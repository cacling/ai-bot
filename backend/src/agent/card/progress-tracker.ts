/**
 * progress-tracker.ts — 对话流程进度追踪
 *
 * 在每轮 bot 回复完成后异步调用，根据对话上下文判断当前处于流程图的哪个状态节点。
 * 模式与 emotion-analyzer.ts 一致：异步、不阻塞主流程。
 */

import { generateText } from 'ai';
import { siliconflow } from '../llm';

const MODEL = siliconflow(
  process.env.SILICONFLOW_CHAT_MODEL ?? 'stepfun-ai/Step-3.5-Flash'
);

const SYSTEM_PROMPT = `你是一个对话流程状态分析器。根据客服对话的最近几轮内容和流程图结构，判断当前处于哪个状态节点。

规则：
1. 只输出一个状态名，必须是状态列表中的某一个，不要输出其他内容
2. 重点关注最后1-2轮对话（尤其是最后一轮 bot 的回复内容和用户的最新回应）
3. 参考流程图的转移关系来理解状态的先后顺序，对话只会向前推进
4. 判断逻辑：看最后一轮 bot 在做什么（介绍方案？确认意向？处理异议？引导办理？安排回访？），以此确定当前状态
5. 如果 bot 正在确认办理方式或引导下一步操作，说明已经超过了"反馈意向"阶段
6. 如果 bot 正在安排回访时间或创建回访任务，状态应该是"待回访"相关节点`;

/**
 * 分析当前对话处于流程图的哪个状态节点。
 * @param recentTurns 最近几轮对话
 * @param stateNames 流程图中的所有状态名列表
 * @param transitions 流程图中的转移关系（可选），格式如 "A → B（条件）"
 * @returns 匹配的状态名，无法判断时返回 null
 */
export async function analyzeProgress(
  recentTurns: { role: string; text: string }[],
  stateNames: string[],
  transitions?: string[],
): Promise<string | null> {
  if (stateNames.length === 0 || recentTurns.length === 0) return null;

  const context = recentTurns
    .map(t => `${t.role === 'user' ? '用户' : '客服'}：${t.text}`)
    .join('\n');

  let userPrompt = `状态列表：${stateNames.join('、')}\n\n`;
  if (transitions && transitions.length > 0) {
    userPrompt += `流程转移关系（表示状态之间的先后顺序和触发条件）：\n${transitions.join('\n')}\n\n`;
  }
  userPrompt += `对话记录：\n${context}\n\n根据最后一轮 bot 的回复内容，当前处于哪个状态？`;

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
