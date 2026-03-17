/**
 * progress-tracker.ts — 对话流程进度追踪
 *
 * 在每轮 bot 回复完成后异步调用，根据对话上下文判断当前处于流程图的哪个状态节点。
 * 模式与 emotion-analyzer.ts 一致：异步、不阻塞主流程。
 */

import { generateText } from 'ai';
import { siliconflow } from '../agent/llm';

const MODEL = siliconflow(
  process.env.SILICONFLOW_CHAT_MODEL ?? 'stepfun-ai/Step-3.5-Flash'
);

const SYSTEM_PROMPT = `你是一个对话流程分析器。根据客服对话的最近几轮内容，判断当前处于给定流程状态列表中的哪个状态。

规则：
- 只输出一个状态名，必须是列表中的某一个，不要输出其他内容
- 根据对话的最新进展来判断，关注最后一轮 bot 的回复
- 如果无法确定，输出列表中最接近的状态名`;

/**
 * 分析当前对话处于流程图的哪个状态节点。
 * @param recentTurns 最近几轮对话
 * @param stateNames 流程图中的所有状态名列表
 * @returns 匹配的状态名，无法判断时返回 null
 */
export async function analyzeProgress(
  recentTurns: { role: string; text: string }[],
  stateNames: string[],
): Promise<string | null> {
  if (stateNames.length === 0 || recentTurns.length === 0) return null;

  const context = recentTurns
    .map(t => `${t.role === 'user' ? '用户' : '客服'}：${t.text}`)
    .join('\n');

  const userPrompt = `状态列表：${stateNames.join('、')}\n\n对话记录：\n${context}\n\n当前处于哪个状态？`;

  try {
    const { text: raw } = await generateText({
      model: MODEL,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: 30,
      temperature: 0,
    });

    const result = raw.trim();
    // Validate the result is one of the state names
    if (stateNames.includes(result)) return result;
    // Fuzzy match: check if any state name is contained in the result
    const match = stateNames.find(s => result.includes(s));
    return match ?? null;
  } catch {
    return null;
  }
}
