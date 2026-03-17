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

import { TECH_SKILLS_DIR } from '../config/paths';

function loadSkill(name: string): string {
  const raw = readFileSync(`${TECH_SKILLS_DIR}/${name}/SKILL.md`, 'utf-8');
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

// ── Mermaid 流程图翻译（带缓存） ──────────────────────────────────────────────

const mermaidCache = new Map<string, string>();

/**
 * 翻译 mermaid 流程图中的展示文本，保留语法结构。
 * 结果按 skill+lang 缓存，同一进程内不重复调用 LLM。
 * 翻译失败或结果缺少关键字时 fallback 到原文。
 */
export async function translateMermaid(mermaid: string, targetLang: 'zh' | 'en'): Promise<string> {
  if (targetLang === 'zh') return mermaid; // 源语言就是中文，无需翻译

  const cacheKey = `${targetLang}:${mermaid}`;
  const cached = mermaidCache.get(cacheKey);
  if (cached) return cached;

  try {
    const targetName = 'English';
    const { text: result } = await generateText({
      model: MODEL,
      system: `You are a mermaid diagram translator. Translate ONLY the display labels/text in the mermaid diagram to ${targetName}. Preserve ALL mermaid syntax, keywords, structure, indentation, comments (like %% tool:xxx and %% branch:xxx), participant aliases, and formatting exactly as-is. Output ONLY the translated mermaid code, nothing else.`,
      messages: [{ role: 'user', content: mermaid }],
      temperature: 0,
    });
    const translated = result.trim();
    // 校验：翻译结果必须包含关键 mermaid 语法关键字，否则 fallback
    const hasKeyword = /sequenceDiagram|graph |flowchart |classDiagram|stateDiagram|gantt/i.test(translated);
    if (!translated || !hasKeyword) return mermaid;
    mermaidCache.set(cacheKey, translated);
    return translated;
  } catch {
    return mermaid; // 翻译失败，返回原文
  }
}
