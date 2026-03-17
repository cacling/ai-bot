/**
 * hallucination-detector.ts — 语义级幻觉检测
 *
 * 检查 bot 回复是否包含工具未返回但断言了的内容。
 * 使用 LLM 进行语义分析（异步，不阻塞主流程）。
 */

import { generateText } from 'ai';
import { readFileSync } from 'fs';
import { siliconflow } from '../engine/llm';
import { logger } from '../logger';
import { TECH_SKILLS_DIR } from '../services/paths';

const MODEL = siliconflow(process.env.SILICONFLOW_CHAT_MODEL ?? 'stepfun-ai/Step-3.5-Flash');

const SYSTEM_PROMPT = (() => {
  const raw = readFileSync(`${TECH_SKILLS_DIR}/hallucination-detection/SKILL.md`, 'utf-8');
  return raw.replace(/^---[\s\S]*?---\n/, '').trim();
})();

export interface HallucinationResult {
  has_hallucination: boolean;
  evidence: string;
}

export async function detectHallucination(
  botReply: string,
  toolResults: Array<{ tool: string; result: string }>,
): Promise<HallucinationResult> {
  if (!botReply.trim() || toolResults.length === 0) {
    return { has_hallucination: false, evidence: '' };
  }

  const toolContext = toolResults
    .map(t => `[${t.tool}] ${t.result.slice(0, 500)}`)
    .join('\n');

  try {
    const { text } = await generateText({
      model: MODEL,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `机器人回复：${botReply}\n\n工具返回结果：\n${toolContext}` }],
      maxTokens: 100,
      temperature: 0,
    });

    const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      has_hallucination: !!parsed.has_hallucination,
      evidence: parsed.evidence ?? '',
    };
  } catch (err) {
    logger.warn('hallucination', 'detection_error', { error: String(err) });
    return { has_hallucination: false, evidence: '' };
  }
}
