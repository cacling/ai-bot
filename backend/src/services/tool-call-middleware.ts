/**
 * tool-call-middleware.ts — 统一工具调用中间件
 *
 * 三个通道（文字客服 / 语音客服 / 语音外呼）共用：
 * - 前处理：参数标准化（月份格式等）
 * - Skill 加载：根据工具名推断 skill，加载 SKILL.md
 * - 后处理（仅语音通道）：调用文字 LLM 生成口语化回复
 */
import { generateText } from 'ai';
import { siliconflow } from '../engine/llm';
import { getSkillContent, getToolSkillMap, getToolToSkillsMap } from '../engine/skills';
import { normalizeMonthParam } from './query-normalizer/month';
import { logger } from './logger';

// ── 配置 ─────────────────────────────────────────────────────────────────────

const VOICE_LLM_MODEL = process.env.VOICE_PROCESS_MODEL ?? process.env.SILICONFLOW_CHAT_MODEL ?? 'Qwen/Qwen2.5-72B-Instruct';
const VOICE_LLM_TIMEOUT = 5000;

// ── 类型 ─────────────────────────────────────────────────────────────────────

export type Channel = 'online' | 'voice' | 'outbound';

export interface ToolCallInput {
  channel: Channel;
  toolName: string;
  toolArgs: Record<string, unknown>;
  userPhone: string;
  lang: 'zh' | 'en';
  activeSkillName: string | null;
}

export interface ToolCallPreResult {
  /** 标准化后的参数（原 toolArgs 会被原地修改） */
  normalizedArgs: Record<string, unknown>;
  /** 推断出的 skill 名称 */
  skillName: string | null;
  /** 加载的 SKILL.md 内容（供文字客服注入 system prompt） */
  skillContent: string | null;
}

export interface ToolResultInput {
  channel: Channel;
  toolName: string;
  toolArgs: Record<string, unknown>;
  toolResult: string;
  toolSuccess: boolean;
  userPhone: string;
  lang: 'zh' | 'en';
  activeSkillName: string | null;
  conversationHistory: Array<{ role: string; content: string }>;
}

export interface ToolResultOutput {
  /** 语音通道：口语化回复文本；文字通道：null（LLM 自行生成） */
  spokenText: string | null;
  /** 实际加载的 skill 名称 */
  skillName: string | null;
  /** 加载的 SKILL.md 内容 */
  skillContent: string | null;
}

// ── Skill 推断（共用）─────────────────────────────────────────────────────────

export function inferSkillName(toolName: string, current: string | null): string | null {
  if (current) return current;
  const toolSkillMap = getToolSkillMap();
  if (toolSkillMap[toolName]) return toolSkillMap[toolName];
  const allMap = getToolToSkillsMap();
  const candidates = allMap.get(toolName);
  if (candidates && candidates.length > 0) {
    const inbound = candidates.filter(s => !s.startsWith('outbound-'));
    if (inbound.length > 0) return inbound[0];
  }
  return null;
}

// ── 前处理：参数标准化（所有通道共用）──────────────────────────────────────────

export function preprocessToolCall(input: ToolCallInput): ToolCallPreResult {
  const args = input.toolArgs;

  // 月份参数标准化
  if (typeof args.month === 'string') {
    const raw = args.month;
    args.month = normalizeMonthParam(raw);
    if (args.month !== raw) {
      logger.info('tool-middleware', 'month_normalized', {
        channel: input.channel, tool: input.toolName, raw, normalized: args.month,
      });
    }
  }

  // Skill 推断 + 加载
  const skillName = inferSkillName(input.toolName, input.activeSkillName);
  const skillContent = skillName ? getSkillContent(skillName) : null;

  return { normalizedArgs: args, skillName, skillContent };
}

// ── 后处理：工具结果加工（语音通道调文字 LLM，文字通道跳过）─────────────────────

function buildVoiceSystemPrompt(skillContent: string | null, lang: 'zh' | 'en'): string {
  const langInstruction = lang === 'en'
    ? 'You MUST respond in English only. Translate any Chinese data into English.'
    : '';

  const base = `你是电信客服"小通"的回复生成器。你的任务是根据工具返回的数据，生成一段口语化的客服回复。

严格规则：
- 所有数字（金额、用量、日期）必须严格引用工具返回数据中的原始值，禁止自行计算、推断或四舍五入
- 如果工具返回了 summary 字段，优先直接复述 summary 内容
- 如果工具返回了 changed_items_text 数组，逐条引用
- 回复控制在 2-3 句话，适合语音播报
- 不要使用 Markdown、特殊符号、括号注释
- 语气温暖亲切，像真人客服说话
- 如果工具调用失败，坦诚告知用户，不要编造数据
${langInstruction}`;

  if (skillContent) {
    return base + '\n\n---\n### 当前技能操作指南（严格遵循）\n\n' + skillContent;
  }
  return base;
}

function buildVoiceUserMessage(input: ToolResultInput): string {
  const lastUserMsg = [...input.conversationHistory]
    .reverse()
    .find(t => t.role === 'user')?.content ?? '';

  return `用户（手机号 ${input.userPhone}）说：${lastUserMsg}

工具调用：${input.toolName}(${JSON.stringify(input.toolArgs)})
工具返回（${input.toolSuccess ? '成功' : '失败'}）：
${input.toolResult}

请生成口语化回复：`;
}

export async function postprocessToolResult(input: ToolResultInput): Promise<ToolResultOutput> {
  const skillName = inferSkillName(input.toolName, input.activeSkillName);
  const skillContent = skillName ? getSkillContent(skillName) : null;

  // 文字通道：不需要生成 spokenText，LLM 在 generateText 循环中自行生成回复
  if (input.channel === 'online') {
    return { spokenText: null, skillName, skillContent };
  }

  // 语音通道（voice / outbound）：调文字 LLM 生成口语化回复
  const t0 = Date.now();
  try {
    const result = await generateText({
      model: siliconflow(VOICE_LLM_MODEL),
      system: buildVoiceSystemPrompt(skillContent, input.lang),
      messages: [{ role: 'user', content: buildVoiceUserMessage(input) }],
      maxTokens: 300,
      temperature: 0.3,
      abortSignal: AbortSignal.timeout(VOICE_LLM_TIMEOUT),
    });

    const spokenText = result.text.trim();
    logger.info('tool-middleware', 'voice_generated', {
      channel: input.channel, tool: input.toolName, skill: skillName,
      lang: input.lang, chars: spokenText.length, ms: Date.now() - t0,
    });
    return { spokenText, skillName, skillContent };
  } catch (err) {
    logger.error('tool-middleware', 'voice_fallback', {
      channel: input.channel, tool: input.toolName, error: String(err), ms: Date.now() - t0,
    });
    return { spokenText: '', skillName, skillContent };
  }
}
