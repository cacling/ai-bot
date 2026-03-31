/**
 * LLM 配置 — KM Service 独立的模型实例
 *
 * 读取与主后端相同的环境变量，创建独立的 provider/model 实例。
 * 支持 Qwen（DashScope）和 OpenAI（GPT-5.4）两套 provider，
 * 通过 getSkillCreatorModels(provider) 按需选择。
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

// ══════════════════════════════════════════════════════════════════════════════
// Skill Creator — Qwen（DashScope）
// ══════════════════════════════════════════════════════════════════════════════

const qwenProvider = createOpenAI({
  baseURL: process.env.SKILL_CREATOR_BASE_URL ?? process.env.SILICONFLOW_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: process.env.SKILL_CREATOR_API_KEY ?? process.env.SILICONFLOW_API_KEY ?? '',
});

const qwenModel: LanguageModelV1 = qwenProvider(
  process.env.SKILL_CREATOR_MODEL ?? 'qwen3-max'
);

const qwenVisionModel: LanguageModelV1 = qwenProvider(
  process.env.SKILL_CREATOR_VISION_MODEL ?? process.env.SKILL_CREATOR_MODEL ?? 'qwen3-max'
);

// DashScope 的 reasoning_content 是独立字段，需要转换为 <think> 标签
// 以便 extractReasoningMiddleware 能正确提取。
const qwenThinkingProvider = createOpenAI({
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

const qwenThinkingModel: LanguageModelV1 = wrapLanguageModel({
  model: qwenThinkingProvider(process.env.SKILL_CREATOR_MODEL ?? 'qwen3-max'),
  middleware: extractReasoningMiddleware({ tagName: 'think' }),
});

// ══════════════════════════════════════════════════════════════════════════════
// Skill Creator — OpenAI（GPT-5.4）
// ══════════════════════════════════════════════════════════════════════════════

const openaiProvider = createOpenAI({
  baseURL: process.env.SKILL_CREATOR_OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
  apiKey: process.env.SKILL_CREATOR_OPENAI_API_KEY ?? '',
});

const openaiModel: LanguageModelV1 = openaiProvider(
  process.env.SKILL_CREATOR_OPENAI_MODEL ?? 'gpt-5.4-2026-03-05'
);

const openaiVisionModel: LanguageModelV1 = openaiProvider(
  process.env.SKILL_CREATOR_OPENAI_VISION_MODEL ?? process.env.SKILL_CREATOR_OPENAI_MODEL ?? 'gpt-5.4-2026-03-05'
);

// GPT-5.4 原生支持 reasoning.effort，但推理过程是内部的、不对外暴露文本
// （providerMetadata.openai.reasoningTokens > 0 证明确实在推理）。
// 因此 UI 上「思考」开关仍可启用以获得更好的推理质量，但不会显示思考过程。
const openaiThinkingModel: LanguageModelV1 = openaiProvider(
  process.env.SKILL_CREATOR_OPENAI_MODEL ?? 'gpt-5.4-2026-03-05',
  { reasoningEffort: 'high' },
);

// ══════════════════════════════════════════════════════════════════════════════
// Provider 选择
// ══════════════════════════════════════════════════════════════════════════════

export type SkillCreatorProvider = 'qwen' | 'openai';

interface SkillCreatorModels {
  model: LanguageModelV1;
  thinkingModel: LanguageModelV1;
  visionModel: LanguageModelV1;
}

const modelsMap: Record<SkillCreatorProvider, SkillCreatorModels> = {
  qwen: { model: qwenModel, thinkingModel: qwenThinkingModel, visionModel: qwenVisionModel },
  openai: { model: openaiModel, thinkingModel: openaiThinkingModel, visionModel: openaiVisionModel },
};

export function getSkillCreatorModels(provider: SkillCreatorProvider = 'qwen'): SkillCreatorModels {
  return modelsMap[provider] ?? modelsMap.qwen;
}

// 向后兼容：保留原有导出名（默认 qwen）
export const skillCreatorModel = qwenModel;
export const skillCreatorThinkingModel = qwenThinkingModel;
export const skillCreatorVisionModel = qwenVisionModel;
