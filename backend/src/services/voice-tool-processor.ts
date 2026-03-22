import { generateText } from 'ai';
import { siliconflow } from '../engine/llm';
import { getSkillContent, getToolSkillMap, getToolToSkillsMap } from '../engine/skills';
import { logger } from './logger';

const VOICE_PROCESS_MODEL = process.env.VOICE_PROCESS_MODEL ?? process.env.SILICONFLOW_CHAT_MODEL ?? 'Qwen/Qwen2.5-72B-Instruct';
const VOICE_PROCESS_TIMEOUT = 5000;

export interface VoiceToolProcessInput {
  toolName: string;
  toolArgs: Record<string, unknown>;
  toolResult: string;
  toolSuccess: boolean;
  userPhone: string;
  lang: 'zh' | 'en';
  activeSkillName: string | null;
  conversationHistory: Array<{ role: string; content: string }>;
}

export interface VoiceToolProcessOutput {
  spokenText: string;
  skillLoaded: string | null;
}

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

export function buildSystemPrompt(skillContent: string | null, lang: 'zh' | 'en'): string {
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

export function buildUserMessage(input: VoiceToolProcessInput): string {
  const lastUserMsg = [...input.conversationHistory]
    .reverse()
    .find(t => t.role === 'user')?.content ?? '';

  return `用户（手机号 ${input.userPhone}）说：${lastUserMsg}

工具调用：${input.toolName}(${JSON.stringify(input.toolArgs)})
工具返回（${input.toolSuccess ? '成功' : '失败'}）：
${input.toolResult}

请生成口语化回复：`;
}

export async function processToolResultForVoice(
  input: VoiceToolProcessInput,
): Promise<VoiceToolProcessOutput> {
  const t0 = Date.now();
  const skillName = inferSkillName(input.toolName, input.activeSkillName);
  const skillContent = skillName ? getSkillContent(skillName) : null;

  try {
    const result = await generateText({
      model: siliconflow(VOICE_PROCESS_MODEL),
      system: buildSystemPrompt(skillContent, input.lang),
      messages: [{ role: 'user', content: buildUserMessage(input) }],
      maxTokens: 300,
      temperature: 0.3,
      abortSignal: AbortSignal.timeout(VOICE_PROCESS_TIMEOUT),
    });

    const spokenText = result.text.trim();
    logger.info('voice-processor', 'generated', {
      tool: input.toolName,
      skill: skillName,
      lang: input.lang,
      chars: spokenText.length,
      ms: Date.now() - t0,
    });

    return { spokenText, skillLoaded: skillName };
  } catch (err) {
    logger.error('voice-processor', 'fallback', {
      tool: input.toolName,
      error: String(err),
      ms: Date.now() - t0,
    });
    return { spokenText: '', skillLoaded: null };
  }
}
