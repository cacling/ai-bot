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

// Thinking 模式：通过自定义 fetch 注入 enable_thinking 参数（DashScope 要求）
const skillCreatorThinkingProvider = createOpenAI({
  baseURL: process.env.SKILL_CREATOR_BASE_URL ?? process.env.SILICONFLOW_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: process.env.SKILL_CREATOR_API_KEY ?? process.env.SILICONFLOW_API_KEY ?? '',
  fetch: async (url, init) => {
    if (init?.body && typeof init.body === 'string') {
      const body = JSON.parse(init.body);
      body.enable_thinking = true;
      logger.info('llm-thinking', 'request', {
        url: String(url),
        model: body.model,
        enable_thinking: body.enable_thinking,
        message_count: body.messages?.length,
      });
      init = { ...init, body: JSON.stringify(body) };
    }
    const response = await globalThis.fetch(url, init);
    // 克隆响应以便读取 body 同时不影响 SDK 消费
    const cloned = response.clone();
    try {
      const respText = await cloned.text();
      const hasThinkTag = respText.includes('<think>') || respText.includes('</think>');
      const hasReasoningContent = respText.includes('reasoning_content');
      const thinkContentMatch = respText.match(/<think>([\s\S]*?)<\/think>/);
      logger.info('llm-thinking', 'response', {
        status: response.status,
        has_think_tag: hasThinkTag,
        has_reasoning_content_field: hasReasoningContent,
        think_content_length: thinkContentMatch?.[1]?.length ?? 0,
        think_content_preview: thinkContentMatch?.[1]?.substring(0, 200) ?? '(none)',
        response_preview: respText.substring(0, 500),
      });
    } catch (e) {
      logger.warn('llm-thinking', 'response_read_failed', { error: String(e) });
    }
    return response;
  },
});

export const skillCreatorThinkingModel = wrapLanguageModel({
  model: skillCreatorThinkingProvider(process.env.SKILL_CREATOR_MODEL ?? 'qwen3-max'),
  middleware: extractReasoningMiddleware({ tagName: 'think' }),
});
