/**
 * LLM 配置 — KM Service 独立的模型实例
 *
 * 读取与主后端相同的环境变量，创建独立的 provider/model 实例。
 * Thinking 模式需要 DashScope reasoning_content → <think> 标签转换。
 */
import { createOpenAI } from '@ai-sdk/openai';
import { wrapLanguageModel, extractReasoningMiddleware, type LanguageModelV1 } from 'ai';

export const siliconflow = createOpenAI({
  baseURL: process.env.SILICONFLOW_BASE_URL ?? 'https://api.siliconflow.cn/v1',
  apiKey: process.env.SILICONFLOW_API_KEY ?? '',
});

export const chatModel: LanguageModelV1 = siliconflow(
  process.env.SILICONFLOW_CHAT_MODEL ?? 'Qwen/Qwen2.5-72B-Instruct'
);

const skillCreatorProvider = createOpenAI({
  baseURL: process.env.SKILL_CREATOR_BASE_URL ?? process.env.SILICONFLOW_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: process.env.SKILL_CREATOR_API_KEY ?? process.env.SILICONFLOW_API_KEY ?? '',
});

export const skillCreatorModel: LanguageModelV1 = skillCreatorProvider(
  process.env.SKILL_CREATOR_MODEL ?? 'qwen3-max'
);

// 视觉模型（图片解析专用）
export const skillCreatorVisionModel: LanguageModelV1 = skillCreatorProvider(
  process.env.SKILL_CREATOR_VISION_MODEL ?? process.env.SKILL_CREATOR_MODEL ?? 'qwen3-max'
);

// ── Thinking 模式 ───────────────────────────────────────────────────────────
// DashScope 的 reasoning_content 是独立字段（非流式在 message.reasoning_content，
// 流式在 delta.reasoning_content），需要转换为 <think> 标签包裹到 content 中，
// 以便 extractReasoningMiddleware 能正确提取。
const skillCreatorThinkingProvider = createOpenAI({
  baseURL: process.env.SKILL_CREATOR_BASE_URL ?? process.env.SILICONFLOW_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: process.env.SKILL_CREATOR_API_KEY ?? process.env.SILICONFLOW_API_KEY ?? '',
  fetch: (async (url: RequestInfo | URL, init: RequestInit | undefined) => {
    let isStreaming = false;
    if (init?.body && typeof init.body === 'string') {
      const body = JSON.parse(init.body);
      body.enable_thinking = true;
      isStreaming = body.stream === true;
      init = { ...init, body: JSON.stringify(body) };
    }

    const response = await globalThis.fetch(url, init);

    // ── 流式响应：逐 chunk 转换 reasoning_content → <think> 标签 ──
    if (isStreaming && response.body) {
      let reasoningStarted = false;
      let isInReasoning = false;
      let buffer = '';

      const transformStream = new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          buffer += new TextDecoder().decode(chunk);
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          let output = '';
          for (const line of lines) {
            if (!line.startsWith('data: ') || line.trim() === 'data: [DONE]') {
              output += line + '\n';
              continue;
            }

            try {
              const data = JSON.parse(line.slice(6));
              const delta = data?.choices?.[0]?.delta;

              if (delta && 'reasoning_content' in delta && delta.reasoning_content != null) {
                if (!reasoningStarted) {
                  delta.content = `<think>${delta.reasoning_content}`;
                  reasoningStarted = true;
                  isInReasoning = true;
                } else {
                  delta.content = delta.reasoning_content;
                }
                delete delta.reasoning_content;
              } else if (delta && 'content' in delta && delta.content != null && isInReasoning) {
                delta.content = `</think>${delta.content}`;
                isInReasoning = false;
              }

              output += `data: ${JSON.stringify(data)}\n`;
            } catch {
              output += line + '\n';
            }
          }

          if (output) {
            controller.enqueue(new TextEncoder().encode(output));
          }
        },
        flush(controller) {
          if (buffer.trim()) {
            controller.enqueue(new TextEncoder().encode(buffer + '\n'));
          }
          if (isInReasoning) {
            controller.enqueue(new TextEncoder().encode(
              `data: ${JSON.stringify({ choices: [{ delta: { content: '</think>' }, index: 0 }] })}\n\n`
            ));
          }
        },
      });

      return new Response(response.body.pipeThrough(transformStream), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }

    // ── 非流式响应：整体转换 reasoning_content ──
    try {
      const respText = await response.text();
      const respJson = JSON.parse(respText);
      const msg = respJson?.choices?.[0]?.message;
      if (msg?.reasoning_content) {
        msg.content = `<think>${msg.reasoning_content}</think>${msg.content ?? ''}`;
        delete msg.reasoning_content;
      }
      return new Response(JSON.stringify(respJson), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch {
      return response;
    }
  }) as typeof fetch,
});

export const skillCreatorThinkingModel: LanguageModelV1 = wrapLanguageModel({
  model: skillCreatorThinkingProvider(process.env.SKILL_CREATOR_MODEL ?? 'qwen3-max'),
  middleware: extractReasoningMiddleware({ tagName: 'think' }),
});
