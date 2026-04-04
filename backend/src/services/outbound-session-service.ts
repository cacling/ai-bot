/**
 * outbound-session-service.ts — 外呼会话纯业务逻辑
 *
 * 从 chat/outbound.ts 抽取。WS handler 和 REST internal/outbound.ts 都通过
 * 此 service 获取会话配置，而不各自重复加载任务/构建 prompt 的逻辑。
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { logger } from './logger';
import { t, OUTBOUND_TOOL_LABELS } from './i18n';
import { type CollectionCase, type MarketingTask } from '../chat/outbound-mock';

const OUTBOUND_BASE = `http://localhost:${process.env.OUTBOUND_SERVICE_PORT ?? 18021}/api/outbound`;

// ── System prompt template ──
const OUTBOUND_PROMPT_TEMPLATE =
  readFileSync(resolve(import.meta.dir, '../engine/outbound-system-prompt.md'), 'utf-8');

const ENGLISH_LANG_INSTRUCTION = `**LANGUAGE REQUIREMENT (MANDATORY — HIGHEST PRIORITY)**
You MUST respond ONLY in English for this entire conversation. All spoken responses must be in English. Do not switch to Chinese under any circumstances, even if the user speaks Chinese or tool results contain Chinese data. Always translate any Chinese data from tool results into English before including it in your response.`;

// ── Voice config ──
export interface VoiceConfig {
  voice: string;
  styleLabel: string;
  styleInstruction: string;
}

export const OUTBOUND_VOICE_CONFIG: Record<'zh' | 'en', Record<'collection' | 'marketing', VoiceConfig>> = {
  zh: {
    collection: {
      voice: 'tongtong',
      styleLabel: '沉稳认真型',
      styleInstruction: '说话语速适中偏慢（约每分钟160字），语气沉稳认真，每句话停顿清晰，让客户有时间充分理解。不要显得催促或强硬，保持礼貌但坚定。',
    },
    marketing: {
      voice: 'tongtong',
      styleLabel: '热情活泼型',
      styleInstruction: '说话语速轻快活泼（约每分钟230字），语气热情积极、富有感染力，像在分享一件好事。重点信息（优惠、价格）适当放慢强调。',
    },
  },
  en: {
    collection: {
      voice: 'tongtong',
      styleLabel: 'Calm & Professional',
      styleInstruction: 'Speak at a moderate-to-slow pace, with a calm and professional tone. Pause clearly between sentences so the customer has time to understand. Be polite but firm — never sound pushy or aggressive.',
    },
    marketing: {
      voice: 'tongtong',
      styleLabel: 'Warm & Enthusiastic',
      styleInstruction: 'Speak at a lively, upbeat pace with an enthusiastic and engaging tone — like sharing good news with a friend. Slow down slightly to emphasize key details (discounts, prices).',
    },
  },
};

// ── Outbound tools schema ──
export const OUTBOUND_TOOLS = [
  {
    type: 'function',
    name: 'record_call_result',
    description: '记录本次外呼通话结果。通话结束前必须调用。',
    parameters: {
      type: 'object',
      properties: {
        result: {
          type: 'string',
          enum: ['ptp', 'refusal', 'dispute', 'no_answer', 'busy',
                 'converted', 'callback', 'not_interested', 'non_owner', 'verify_failed'],
          description: '通话结果',
        },
        remark: { type: 'string', description: '备注信息' },
        callback_time: { type: 'string', description: '约定回访时间' },
        ptp_date: { type: 'string', description: '承诺还款日期' },
      },
      required: ['result'],
    },
  },
  {
    type: 'function',
    name: 'send_followup_sms',
    description: '向客户发送跟进短信',
    parameters: {
      type: 'object',
      properties: {
        sms_type: {
          type: 'string',
          enum: ['payment_link', 'plan_detail', 'callback_reminder', 'product_detail'],
          description: '短信类型',
        },
      },
      required: ['sms_type'],
    },
  },
  {
    type: 'function',
    name: 'transfer_to_human',
    description: '转接人工坐席。',
    parameters: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          enum: ['user_request', 'emotional_complaint', 'high_risk_operation', 'dispute_review'],
          description: '转人工原因',
        },
        current_intent: { type: 'string', description: '客户当前意图' },
        recommended_action: { type: 'string', description: '建议坐席下一步动作' },
      },
      required: ['reason', 'current_intent'],
    },
  },
  {
    type: 'function',
    name: 'create_callback_task',
    description: '创建回访任务。',
    parameters: {
      type: 'object',
      properties: {
        callback_phone: { type: 'string', description: '回访电话号码' },
        preferred_time: { type: 'string', description: '客户期望的回访时间' },
      },
      required: ['preferred_time'],
    },
  },
];

// ── Session config returned by service ──
export interface OutboundSessionConfig {
  sessionId: string;
  userPhone: string;
  lang: 'zh' | 'en';
  taskParam: 'collection' | 'marketing';
  taskId: string;
  resolvedTask: CollectionCase | MarketingTask;
  systemPrompt: string;
  voiceConfig: VoiceConfig;
  skillName: string;
  tools: typeof OUTBOUND_TOOLS;
  toolLabels: Record<string, string>;
}

/** 从 outbound_service 加载任务信息 */
export async function loadOutboundTask(
  taskId: string,
  lang: 'zh' | 'en',
): Promise<CollectionCase | MarketingTask | undefined> {
  try {
    const res = await fetch(`${OUTBOUND_BASE}/tasks/${taskId}`);
    if (!res.ok) return undefined;
    const row = await res.json();
    const parsed = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
    return parsed[lang] ?? parsed['zh'];
  } catch { return undefined; }
}

/** 构建外呼 system prompt */
export function buildOutboundPrompt(
  phone: string,
  taskType: 'collection' | 'marketing',
  taskInfo: CollectionCase | MarketingTask,
  lang: 'zh' | 'en' = 'zh',
): string {
  const locale = lang === 'en' ? 'en-US' : 'zh-CN';
  const today = new Date().toLocaleDateString(locale, { year: 'numeric', month: '2-digit', day: '2-digit' });

  if (taskType === 'collection' && 'due_date' in taskInfo && taskInfo.due_date) {
    const dueMs = new Date(taskInfo.due_date + 'T00:00:00+08:00').getTime();
    const nowMs = Date.now();
    (taskInfo as CollectionCase).overdue_days = Math.max(0, Math.floor((nowMs - dueMs) / (1000 * 60 * 60 * 24)));
  }

  const taskInfoStr = JSON.stringify(taskInfo, null, 2);
  const taskTypeLabel = t(taskType === 'collection' ? 'outbound_task_type_collection' : 'outbound_task_type_marketing', lang);
  const voiceCfg = OUTBOUND_VOICE_CONFIG[lang][taskType];

  const base = OUTBOUND_PROMPT_TEMPLATE
    .replace('{{PHONE}}', phone)
    .replace('{{CURRENT_DATE}}', today)
    .replace('{{TASK_TYPE}}', taskTypeLabel)
    .replace('{{TASK_INFO}}', taskInfoStr)
    .replace('{{VOICE_STYLE}}', voiceCfg.styleLabel)
    .replace('{{VOICE_STYLE_INSTRUCTION}}', voiceCfg.styleInstruction);
  return lang === 'en' ? ENGLISH_LANG_INSTRUCTION + '\n\n' + base : base;
}

/**
 * 准备一个完整的外呼会话配置。
 * WS handler 和 REST internal/outbound.ts 都可调用此方法。
 */
export async function prepareOutboundSession(opts: {
  userPhone: string;
  taskParam: 'collection' | 'marketing';
  taskId: string;
  lang: 'zh' | 'en';
  sessionId?: string;
}): Promise<OutboundSessionConfig> {
  const { userPhone, taskParam, taskId, lang } = opts;
  const sessionId = opts.sessionId ?? crypto.randomUUID();

  const taskInfo = await loadOutboundTask(taskId, lang);
  if (!taskInfo) {
    logger.warn('outbound-session', 'unknown_task_id', { taskParam, taskId });
  }
  const resolvedTask = taskInfo ?? ({} as CollectionCase | MarketingTask);
  const systemPrompt = buildOutboundPrompt(userPhone, taskParam, resolvedTask, lang);
  const skillName = taskParam === 'collection' ? 'outbound-collection' : 'outbound-marketing';
  const voiceConfig = OUTBOUND_VOICE_CONFIG[lang][taskParam];
  const toolLabels = OUTBOUND_TOOL_LABELS[lang];

  return {
    sessionId,
    userPhone,
    lang,
    taskParam,
    taskId,
    resolvedTask,
    systemPrompt,
    voiceConfig,
    skillName,
    tools: OUTBOUND_TOOLS,
    toolLabels,
  };
}
