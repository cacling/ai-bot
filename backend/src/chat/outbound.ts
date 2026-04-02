/**
 * outbound.ts — 语音外呼 WebSocket 代理路由
 *
 * 与 voice.ts（入呼）的核心区别：
 * 1. 连接建立后立即触发 response.create，让机器人先说开场白
 * 2. 使用外呼专用 system prompt（含任务信息注入）
 * 3. 使用外呼专用工具集（record_call_result / send_followup_sms / transfer_to_human）
 * 4. 工具调用通过 outbound-service MCP Server 处理（端口 8004）
 */

import { Hono } from 'hono';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { logger } from '../services/logger';
import { upgradeWebSocket } from './voice';
import { VoiceSessionState } from '../services/voice-session';
import { sessionBus } from '../services/session-bus';
import { setCustomerLang } from '../services/lang-session';
import { t, OUTBOUND_TOOL_LABELS } from '../services/i18n';
import { type CollectionCase, type MarketingTask, type CallbackTask, CALLBACK_TASKS } from './outbound-mock';
const OUTBOUND_BASE = `http://localhost:${process.env.OUTBOUND_SERVICE_PORT ?? 18021}/api/outbound`;
import { sendSkillDiagram, runProgressTracking, triggerHandoff } from '../services/voice-common';
import { GlmRealtimeController, type WsSend } from '../services/glm-realtime-controller';
import { OutboundTextSession } from '../services/outbound-text-session';

// ── 配置 ──────────────────────────────────────────────────────────────────────

const DEFAULT_PHONE = '13800000001';

// ── 外呼 system prompt ────────────────────────────────────────────────────────

const OUTBOUND_PROMPT_TEMPLATE =
  readFileSync(resolve(import.meta.dir, '../engine/outbound-system-prompt.md'), 'utf-8');

const ENGLISH_LANG_INSTRUCTION = `**LANGUAGE REQUIREMENT (MANDATORY — HIGHEST PRIORITY)**
You MUST respond ONLY in English for this entire conversation. All spoken responses must be in English. Do not switch to Chinese under any circumstances, even if the user speaks Chinese or tool results contain Chinese data. Always translate any Chinese data from tool results into English before including it in your response.`;

/** 各场景的音色与语速配置 */
interface VoiceConfig {
  voice: string;
  styleLabel: string;
  styleInstruction: string;
}

const OUTBOUND_VOICE_CONFIG: Record<'zh' | 'en', Record<'collection' | 'marketing', VoiceConfig>> = {
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

function buildOutboundPrompt(phone: string, taskType: 'collection' | 'marketing', taskInfo: CollectionCase | MarketingTask, lang: 'zh' | 'en' = 'zh'): string {
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

// ── GLM 外呼工具定义 ──────────────────────────────────────────────────────────

const OUTBOUND_TOOLS = [
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
          description: '通话结果：ptp=承诺还款，refusal=拒绝还款，dispute=提出异议，converted=成功转化，callback=待回访，not_interested=不感兴趣',
        },
        remark: {
          type: 'string',
          description: '备注信息（异议原因、客户说的关键话语等）',
        },
        callback_time: {
          type: 'string',
          description: '约定回访时间，result=callback 时必填，格式如 "2026-03-15 上午10点"',
        },
        ptp_date: {
          type: 'string',
          description: '承诺还款日期，result=ptp 时必填，格式如 "2026-03-18"',
        },
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
          description: '短信类型：payment_link=还款链接，plan_detail=套餐详情，callback_reminder=回访提醒，product_detail=产品详情',
        },
      },
      required: ['sms_type'],
    },
  },
  {
    type: 'function',
    name: 'transfer_to_human',
    description: '转接人工坐席。客户主动要求、情绪激烈投诉、或高风险情况时调用。',
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
    description: '创建回访任务。客户感兴趣但当前不方便，约定下次回访时间时调用。',
    parameters: {
      type: 'object',
      properties: {
        callback_phone: {
          type: 'string',
          description: '回访电话号码（若客户未变更则使用当前号码）',
        },
        preferred_time: {
          type: 'string',
          description: '客户期望的回访时间，格式如 "2026-03-18 上午10点"',
        },
      },
      required: ['preferred_time'],
    },
  },
];

// ── 路由 ──────────────────────────────────────────────────────────────────────

const outbound = new Hono();

outbound.get(
  '/ws/outbound',
  upgradeWebSocket(async (c) => {
    const userPhone  = c.req.query('phone') ?? DEFAULT_PHONE;
    const taskParam  = (c.req.query('task') ?? 'marketing') as 'collection' | 'marketing';
    const lang       = (c.req.query('lang') ?? 'zh') as 'zh' | 'en';
    const defaultId  = taskParam === 'collection' ? 'C001' : 'M001';
    const taskId     = c.req.query('id') ?? defaultId;
    const sessionId  = crypto.randomUUID();

    // 从 outbound_service 加载任务信息
    async function loadTask(id: string): Promise<CollectionCase | MarketingTask | undefined> {
      try {
        const res = await fetch(`${OUTBOUND_BASE}/tasks/${id}`);
        if (!res.ok) return undefined;
        const row = await res.json();
        const parsed = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
        return parsed[lang] ?? parsed['zh'];
      } catch { return undefined; }
    }

    const taskInfo = await loadTask(taskId);
    if (!taskInfo) {
      logger.warn('outbound', 'unknown_task_id', { taskParam, taskId });
    }

    const resolvedTask = taskInfo ?? loadTaskFromDB(defaultId) ?? {} as CollectionCase | MarketingTask;
    const systemPrompt = buildOutboundPrompt(userPhone, taskParam, resolvedTask, lang);
    const outboundSkill = taskParam === 'collection' ? 'outbound-collection' : 'outbound-marketing';

    // ── mode=text：文本模式（跳过 GLM-Realtime，用 generateText 驱动对话）──
    const mode = c.req.query('mode') ?? 'voice';
    if (mode === 'text') {
      const textSession = new OutboundTextSession({
        sessionId, userPhone, lang, systemPrompt,
        glmTools: OUTBOUND_TOOLS,
        taskParam, taskId,
        resolvedTask: resolvedTask as unknown as Record<string, unknown>,
      });
      return {
        onOpen(_evt, ws) {
          logger.info('outbound', 'text_mode_connected', { session: sessionId, phone: userPhone, lang, task: taskParam, id: taskId });
          setCustomerLang(userPhone, lang);
          sessionBus.clearHistory(userPhone);
          sessionBus.publish(userPhone, { source: 'system', type: 'new_session', channel: 'outbound', msg_id: crypto.randomUUID() });
          textSession.start(ws);
        },
        onMessage(evt, ws) { textSession.handleMessage(evt.data as string, ws); },
        onClose() { logger.info('outbound', 'text_mode_disconnected', { session: sessionId }); },
        onError() { logger.error('outbound', 'text_mode_ws_error', { session: sessionId }); },
      };
    }

    const state = new VoiceSessionState(userPhone, sessionId);
    let pendingHandoff: Promise<void> | null = null;

    // ── 转人工触发器 ──────────────────────────────────────────────────────────
    function doTriggerHandoff(ws: WsSend, reason: string, toolArgs: Record<string, unknown> = {}) {
      const toolLabel = OUTBOUND_TOOL_LABELS[lang];
      const taskLabel = t(taskParam === 'collection' ? 'outbound_task_collection' : 'outbound_task_marketing', lang);
      const businessObj = t(taskParam === 'collection' ? 'outbound_biz_collection' : 'outbound_biz_marketing', lang);
      pendingHandoff = triggerHandoff(state, ws, sessionId, reason, toolArgs, {
        toolLabels: toolLabel,
        defaultIntent: t('outbound_default_intent', lang),
        buildSummary: (_, tools) => t('outbound_handoff_summary', lang, taskLabel, tools),
        buildMainIssue: () => t('outbound_issue', lang, taskLabel, taskId),
        businessObject: [businessObj],
        buildActionLabel: (tc, label) => tc.success ? t('tool_success', lang, label) : t('tool_failed', lang, label),
        defaultNextAction: t('outbound_next_action_continue', lang),
        defaultPriority: taskParam === 'collection' ? t('priority_medium', lang) : t('priority_low', lang),
        channel: 'outbound',
        lang,
      }) ?? null;
    }

    const controller = new GlmRealtimeController(
      {
        channel: 'outbound',
        sessionId,
        userPhone,
        lang,
        systemPrompt,
        tools: OUTBOUND_TOOLS,
        voiceName: OUTBOUND_VOICE_CONFIG[lang][taskParam].voice,
      },
      state,
      {
        onSessionReady: async (ws) => {
          await sendSkillDiagram(ws, userPhone, outboundSkill, null, lang, sessionId, 'outbound');
          logger.info('outbound', 'skill_diagram_sent', { session: sessionId, skill: outboundSkill });
        },
        enrichToolArgs: (toolName, toolArgs) => {
          if (toolName === 'create_callback_task') {
            const customerName = (resolvedTask as unknown as Record<string, unknown>).customer_name as string ?? '';
            const productName  = (resolvedTask as unknown as Record<string, unknown>).product_name as string ?? '';
            if (!toolArgs.original_task_id) toolArgs.original_task_id = taskId;
            if (!toolArgs.callback_phone) toolArgs.callback_phone = userPhone;
            if (!toolArgs.customer_name) toolArgs.customer_name = customerName;
            if (!toolArgs.product_name) toolArgs.product_name = productName;
          } else if (toolName === 'send_followup_sms') {
            if (!toolArgs.phone) toolArgs.phone = userPhone;
          }
        },
        getActiveSkillName: () => outboundSkill,
        onBotReply: () => {
          logger.info('outbound', 'progress_check', { session: sessionId, skill: outboundSkill, turnsLen: state.turns.length });
          runProgressTracking(ws_ref!, userPhone, outboundSkill, state.turns.slice(-6), lang, sessionId, 'outbound');
        },
      },
      doTriggerHandoff,
      () => pendingHandoff,
    );

    // ws reference for hooks (set in onOpen)
    let ws_ref: WsSend | null = null;

    return {
      onOpen(_evt, ws) {
        ws_ref = ws;
        logger.info('outbound', 'client_connected', { session: sessionId, phone: userPhone, lang, task: taskParam, id: taskId, voice: OUTBOUND_VOICE_CONFIG[lang][taskParam].voice });
        setCustomerLang(userPhone, lang);
        sessionBus.clearHistory(userPhone);
        sessionBus.publish(userPhone, { source: 'system', type: 'new_session', channel: 'outbound', msg_id: crypto.randomUUID() });
        controller.start(ws);
      },
      onMessage(evt) {
        controller.forwardToGlm(evt.data.toString());
      },
      onClose() {
        controller.close();
      },
      onError() {
        controller.error();
      },
    };
  })
);

export default outbound;

// Re-export types and callback tasks for other route files
export { CALLBACK_TASKS } from './outbound-mock';
export type { CollectionCase, MarketingTask, CallbackTask } from './outbound-mock';
