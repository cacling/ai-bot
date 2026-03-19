import { createOpenAI } from '@ai-sdk/openai';
import { wrapLanguageModel, extractReasoningMiddleware } from 'ai';
import { logger } from '../services/logger';

export const siliconflow = createOpenAI({
  baseURL: process.env.SILICONFLOW_BASE_URL ?? 'https://api.siliconflow.cn/v1',
  apiKey: process.env.SILICONFLOW_API_KEY ?? '',
});

export const chatModel = siliconflow(
  process.env.SILICONFLOW_CHAT_MODEL ?? 'Qwen/Qwen2.5-72B-Instruct'
);

// ── 技能创建器专用 LLM（需求分析 / SKILL.md 生成）───────────────────────────

const skillCreatorProvider = createOpenAI({
  baseURL: process.env.SKILL_CREATOR_BASE_URL ?? process.env.SILICONFLOW_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: process.env.SKILL_CREATOR_API_KEY ?? process.env.SILICONFLOW_API_KEY ?? '',
});

export const skillCreatorModel = skillCreatorProvider(
  process.env.SKILL_CREATOR_MODEL ?? 'qwen3-max'
);

// ── Thinking 模式 ───────────────────────────────────────────────────────────
// DashScope 的 reasoning_content 是独立字段（非流式在 message.reasoning_content，
// 流式在 delta.reasoning_content），需要转换为 <think> 标签包裹到 content 中，
// 以便 extractReasoningMiddleware 能正确提取。
const skillCreatorThinkingProvider = createOpenAI({
  baseURL: process.env.SKILL_CREATOR_BASE_URL ?? process.env.SILICONFLOW_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: process.env.SKILL_CREATOR_API_KEY ?? process.env.SILICONFLOW_API_KEY ?? '',
  fetch: async (url, init) => {
    let isStreaming = false;
    if (init?.body && typeof init.body === 'string') {
      const body = JSON.parse(init.body);
      body.enable_thinking = true;
      isStreaming = body.stream === true;
      logger.info('llm-thinking', 'request', {
        model: body.model,
        enable_thinking: true,
        streaming: isStreaming,
        message_count: body.messages?.length,
      });
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
          // 保留最后一行（可能不完整）
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
          // 如果 reasoning 未正常关闭，补上 </think>
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
        logger.info('llm-thinking', 'response_transform', {
          reasoning_content_length: msg.reasoning_content.length,
        });
        msg.content = `<think>${msg.reasoning_content}</think>${msg.content ?? ''}`;
        delete msg.reasoning_content;
      }
      return new Response(JSON.stringify(respJson), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch (e) {
      logger.warn('llm-thinking', 'response_transform_failed', { error: String(e) });
      return response;
    }
  },
});

export const skillCreatorThinkingModel = wrapLanguageModel({
  model: skillCreatorThinkingProvider(process.env.SKILL_CREATOR_MODEL ?? 'qwen3-max'),
  middleware: extractReasoningMiddleware({ tagName: 'think' }),
});
