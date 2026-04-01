/**
 * emotion-analyzer.ts — 用户情绪实时识别
 *
 * 在每轮用户语音转写完成后由 voice.ts 异步调用，不阻塞语音回复流程。
 *
 * Skill 定义（情绪分类体系 + 判断原则）从 km_service/skills/emotion-detection/ 加载，
 * 遵循项目 Skill 规范，支持渐进式暴露：
 *   - SKILL.md               → system 指令（始终加载）
 *   - references/emotion-guide.md → 详细示例（按需懒加载，当前保留供扩展）
 */

import { generateText } from 'ai';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { siliconflow } from '../../engine/llm';

// ── 模型 ──────────────────────────────────────────────────────────────────────
const MODEL = siliconflow(
  process.env.SILICONFLOW_CHAT_MODEL ?? 'stepfun-ai/Step-3.5-Flash'
);

// ── Skill 文件加载 ─────────────────────────────────────────────────────────────
import { TECH_SKILLS_DIR } from '../../services/paths';

function loadSkill(name: string): string {
  const raw = readFileSync(`${TECH_SKILLS_DIR}/${name}/SKILL.md`, 'utf-8');
  return raw.replace(/^---[\s\S]*?---\n/, '').trim();
}

// system 指令：始终加载（包含情绪分类体系）
const SKILL_SYSTEM = loadSkill('emotion-detection');

// ── 公共类型 ──────────────────────────────────────────────────────────────────
export type EmotionLabel = '平静' | '礼貌' | '焦虑' | '不满' | '愤怒';

export interface EmotionResult {
  label: EmotionLabel;
  emoji: string;
  color: string;
}

const EMOTION_META: Record<EmotionLabel, { emoji: string; color: string }> = {
  平静: { emoji: '😌', color: 'gray'   },
  礼貌: { emoji: '🙏', color: 'green'  },
  焦虑: { emoji: '😟', color: 'amber'  },
  不满: { emoji: '😒', color: 'orange' },
  愤怒: { emoji: '😡', color: 'red'    },
};

const VALID_LABELS = new Set<string>(Object.keys(EMOTION_META));

// ── 主入口 ────────────────────────────────────────────────────────────────────
export async function analyzeEmotion(
  text: string,
  recentTurns: Array<{ role: string; text: string }> = [],
): Promise<EmotionResult> {
  const context = recentTurns
    .map(t => `${t.role === 'user' ? '用户' : '客服'}：${t.text}`)
    .join('\n');

  const userPrompt =
    (context ? `近期对话：\n${context}\n\n` : '') +
    `用户最新说：「${text}」\n\n只输出情绪标签名称：`;

  try {
    const { text: raw } = await generateText({
      model: MODEL,
      system: SKILL_SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: 10,
      temperature: 0,
    });

    const label = raw.trim() as EmotionLabel;
    if (VALID_LABELS.has(label)) {
      return { label, ...EMOTION_META[label] };
    }
  } catch {
    // fall through to default
  }

  return { label: '平静', ...EMOTION_META['平静'] };
}
