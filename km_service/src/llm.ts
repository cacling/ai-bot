/**
 * LLM 配置 — KM Service 独立的模型实例
 *
 * 读取与主后端相同的环境变量，创建独立的 provider/model 实例。
 */
import { createOpenAI } from '@ai-sdk/openai';
import { type LanguageModelV1 } from 'ai';

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

// Thinking 模式（简化版，不含 reasoning_content 转换）
export const skillCreatorThinkingModel: LanguageModelV1 = skillCreatorProvider(
  process.env.SKILL_CREATOR_MODEL ?? 'qwen3-max'
);
