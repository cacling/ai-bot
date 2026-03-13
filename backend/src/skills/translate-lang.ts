/**
 * translate-lang.ts — 对话实时翻译
 *
 * 当客户侧与坐席侧语言不同时，由接收方 WebSocket handler 调用，
 * 将消息翻译为接收方语言后再推送给前端。
 *
 * Skill 定义从 backend/skills/translate-lang/SKILL.md 加载。
 */

import { generateText } from 'ai';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { siliconflow } from '../agent/llm';

const MODEL = siliconflow(
  process.env.SILICONFLOW_CHAT_MODEL ?? 'stepfun-ai/Step-3.5-Flash'
);

const SKILLS_DIR = resolve(import.meta.dir, '../../skills');

function loadSkill(name: string): string {
  const raw = readFileSync(`${SKILLS_DIR}/tech-skills/${name}/SKILL.md`, 'utf-8');
  return raw.replace(/^---[\s\S]*?---\n/, '').trim();
}

const SKILL_SYSTEM = loadSkill('translate-lang');

/**
 * 将 text 翻译为 targetLang。
 * 失败时抛出错误，调用方按需处理（通常降级为展示原文）。
 */
export async function translateText(text: string, targetLang: 'zh' | 'en'): Promise<string> {
  const targetName = targetLang === 'zh' ? '中文' : 'English';
  const { text: result } = await generateText({
    model: MODEL,
    system: `${SKILL_SYSTEM}\n\n目标语言：${targetName}`,
    messages: [{ role: 'user', content: text }],
    temperature: 0,
  });
  return result.trim() || text;
}
