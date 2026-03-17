/**
 * outbound.ts — 语音外呼 WebSocket 代理路由
 *
 * 与 voice.ts（入呼）的核心区别：
 * 1. 连接建立后立即触发 response.create，让机器人先说开场白
 * 2. 使用外呼专用 system prompt（含任务信息注入）
 * 3. 使用外呼专用工具集（record_call_result / send_followup_sms / transfer_to_human）
 * 4. 工具调用在本地处理（mock），不走 MCP
 */

import { Hono } from 'hono';
import NodeWebSocket from 'ws';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { logger } from '../logger';
import { upgradeWebSocket } from './voice';
import { VoiceSessionState, TRANSFER_PHRASE_RE } from '../services/voice-session';
import { sessionBus } from '../session-bus';
import { setCustomerLang } from '../lang-session';
import { t, OUTBOUND_TOOL_LABELS, SMS_LABELS } from '../i18n';
import { type CollectionCase, type MarketingTask, type CallbackTask, CALLBACK_TASKS } from './outbound-mock';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { outboundTasks } from '../db/schema';
import { sendSkillDiagram, runEmotionAnalysis, runProgressTracking, triggerHandoff, setupGlmCloseHandlers } from '../services/voice-common';
import { textToSpeech } from '../services/tts';
import { translateText } from '../services/translate-lang';
import { getSkillContentByChannel } from '../engine/skills';

// ── 配置 ──────────────────────────────────────────────────────────────────────

const ZHIPU_API_KEY      = process.env.ZHIPU_API_KEY ?? '';
const GLM_REALTIME_URL   = process.env.GLM_REALTIME_URL ?? 'wss://open.bigmodel.cn/api/paas/v4/realtime';
const GLM_REALTIME_MODEL = process.env.GLM_REALTIME_MODEL ?? 'glm-realtime-flash';
const DEFAULT_PHONE      = '13800000001';

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
  const taskInfoStr = JSON.stringify(taskInfo, null, 2);
  const taskTypeLabel = t(taskType === 'collection' ? 'outbound_task_type_collection' : 'outbound_task_type_marketing', lang);
  const voiceCfg = OUTBOUND_VOICE_CONFIG[lang][taskType];
  // 按任务类型加载对应 channel 的技能内容
  const channel = `outbound-${taskType}` as const;
  const skillContent = getSkillContentByChannel(channel);

  const base = OUTBOUND_PROMPT_TEMPLATE
    .replace('{{PHONE}}', phone)
    .replace('{{CURRENT_DATE}}', today)
    .replace('{{TASK_TYPE}}', taskTypeLabel)
    .replace('{{TASK_INFO}}', taskInfoStr)
    .replace('{{VOICE_STYLE}}', voiceCfg.styleLabel)
    .replace('{{VOICE_STYLE_INSTRUCTION}}', voiceCfg.styleInstruction)
    .replace('{{SKILL_CONTENT}}', skillContent || '');
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
  upgradeWebSocket((c) => {
    const userPhone  = c.req.query('phone') ?? DEFAULT_PHONE;
    const taskParam  = (c.req.query('task') ?? 'marketing') as 'collection' | 'marketing';
    const lang       = (c.req.query('lang') ?? 'zh') as 'zh' | 'en';
    const defaultId  = taskParam === 'collection' ? 'C001' : 'M001';
    const taskId     = c.req.query('id') ?? defaultId;
    const sessionId  = crypto.randomUUID();

    // 从 DB 加载任务信息（根据语言选择 zh/en 变体）
    function loadTaskFromDB(id: string): CollectionCase | MarketingTask | undefined {
      const rows = db.select().from(outboundTasks).where(eq(outboundTasks.id, id)).all();
      if (rows.length === 0) return undefined;
      const parsed = JSON.parse(rows[0].data);
      return parsed[lang] ?? parsed['zh'];
    }

    const taskInfo = loadTaskFromDB(taskId);
    if (!taskInfo) {
      logger.warn('outbound', 'unknown_task_id', { taskParam, taskId });
    }

    const resolvedTask = taskInfo ?? loadTaskFromDB(defaultId) ?? {} as CollectionCase | MarketingTask;
    const systemPrompt = buildOutboundPrompt(userPhone, taskParam, resolvedTask, lang);

    let glmWs: InstanceType<typeof NodeWebSocket> | null = null;
    const state = new VoiceSessionState(userPhone, sessionId);
    let pendingHandoff: Promise<void> | null = null;

    // ── 转人工触发器 ──────────────────────────────────────────────────────────
    function doTriggerHandoff(ws: { send: (data: string) => void }, reason: string, toolArgs: Record<string, unknown> = {}) {
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

    return {
      onOpen(_evt, ws) {
        logger.info('outbound', 'client_connected', { session: sessionId, phone: userPhone, lang, task: taskParam, id: taskId, voice: OUTBOUND_VOICE_CONFIG[lang][taskParam].voice });
        setCustomerLang(userPhone, lang);
        sessionBus.clearHistory(userPhone);
        sessionBus.publish(userPhone, { source: 'system', type: 'new_session', channel: 'outbound', msg_id: crypto.randomUUID() });

        if (!ZHIPU_API_KEY) {
          ws.send(JSON.stringify({ type: 'error', message: 'ZHIPU_API_KEY not configured' }));
          ws.close();
          return;
        }

        const glmUrl = `${GLM_REALTIME_URL}?model=${GLM_REALTIME_MODEL}`;
        glmWs = new NodeWebSocket(glmUrl, {
          headers: { Authorization: `Bearer ${ZHIPU_API_KEY}` },
        });

        glmWs.on('open', () => {
          logger.info('outbound', 'glm_connected', { session: sessionId });
          glmWs!.send(JSON.stringify({
            event_id: crypto.randomUUID(),
            client_timestamp: Date.now(),
            type: 'session.update',
            session: {
              beta_fields: { chat_mode: 'audio' },
              modalities: ['text', 'audio'],
              instructions: systemPrompt,
              voice: OUTBOUND_VOICE_CONFIG[lang][taskParam].voice,
              input_audio_format: 'pcm',
              output_audio_format: 'mp3',
              turn_detection: {
                type: 'server_vad',
                silence_duration_ms: 1500,
                threshold: 0.6,
                interrupt_response: false,
              },
              temperature: 0.2,
              tools: OUTBOUND_TOOLS,
            },
          }));
        });

        // ── 非中文 TTS 覆盖（与 voice.ts 相同逻辑）──
        const ttsOverride = lang !== 'zh';
        let ttsAccum = '';
        let ttsFlushed = 0;
        let ttsQueue: Promise<void> = Promise.resolve();

        function ttsSendSentence(sentence: string) {
          ttsQueue = ttsQueue.then(async () => {
            try {
              const translated = await translateText(sentence, lang);
              const audio = await textToSpeech(translated, lang);
              logger.info('outbound', 'tts_override_sentence', { session: sessionId, zhLen: sentence.length, enPreview: translated.slice(0, 60) });
              ws.send(JSON.stringify({ type: 'tts_override', text: translated, audio }));
            } catch (e) {
              logger.warn('outbound', 'tts_override_error', { session: sessionId, error: String(e) });
              ws.send(JSON.stringify({ type: 'tts_override', text: sentence, audio: null }));
            }
          });
        }
        function ttsFlushSentences() {
          const pending = ttsAccum.slice(ttsFlushed);
          const re = /[。？！；\n]/g;
          let match: RegExpExecArray | null;
          while ((match = re.exec(pending)) !== null) {
            const end = ttsFlushed + match.index + match[0].length;
            const sentence = ttsAccum.slice(ttsFlushed, end).trim();
            if (sentence) ttsSendSentence(sentence);
            ttsFlushed = end;
          }
        }
        function ttsFlushRemainder() {
          const remainder = ttsAccum.slice(ttsFlushed).trim();
          if (remainder) ttsSendSentence(remainder);
          ttsAccum = '';
          ttsFlushed = 0;
        }

        glmWs.on('message', async (data: Buffer) => {
          try {
            const text = data.toString();
            const msg  = JSON.parse(text);

            logger.info('outbound', 'glm_event', { session: sessionId, type: msg.type, preview: text.slice(0, 200) });

            // 会话就绪后：触发机器人开口 + 推送 skill 时序图
            if (msg.type === 'session.updated') {
              logger.info('outbound', 'trigger_bot_opening', { session: sessionId });
              glmWs!.send(JSON.stringify({
                event_id: crypto.randomUUID(),
                client_timestamp: Date.now(),
                type: 'response.create',
              }));
              const skillName = taskParam === 'collection' ? 'outbound-collection' : 'outbound-marketing';
              await sendSkillDiagram(ws, userPhone, skillName, null, lang, sessionId, 'outbound');
              logger.info('outbound', 'skill_diagram_sent', { session: sessionId, skill: skillName });
            }

            // 用户语音转写完成
            if (msg.type === 'conversation.item.input_audio_transcription.completed') {
              const transcript = (msg.transcript ?? '') as string;
              if (transcript) {
                state.addUserTurn(transcript);
                sessionBus.publish(userPhone, { source: 'voice', type: 'user_message', text: transcript, msg_id: crypto.randomUUID() });
                runEmotionAnalysis(ws, userPhone, transcript, state.turns.slice(-5));
              }
            }

            // 非中文模式：拦截 GLM 中文音频
            if (ttsOverride && msg.type === 'response.audio.delta') return;

            // 非中文模式：拦截 transcript delta，按句切分翻译 + TTS
            if (ttsOverride && msg.type === 'response.audio_transcript.delta') {
              const delta = (msg.delta ?? '') as string;
              if (delta) { ttsAccum += delta; ttsFlushSentences(); }
              return;
            }

            // bot 回复完整文本
            if (msg.type === 'response.audio_transcript.done') {
              const transcript = (msg.transcript ?? '') as string;
              if (transcript) {
                if (ttsOverride) ttsFlushRemainder();
                state.addAssistantTurn(transcript);
                sessionBus.publish(userPhone, { source: 'voice', type: 'response', text: transcript, msg_id: crypto.randomUUID() });
                if (!state.transferTriggered && TRANSFER_PHRASE_RE.test(transcript)) {
                  logger.info('outbound', 'transfer_detected_via_speech', { session: sessionId });
                  doTriggerHandoff(ws, 'user_request');
                }
                // ── 异步流程进度追踪 ──
                const outboundSkill = taskParam === 'collection' ? 'outbound-collection' : 'outbound-marketing';
                logger.info('outbound', 'progress_check', { session: sessionId, skill: outboundSkill, turnsLen: state.turns.length });
                runProgressTracking(ws, userPhone, outboundSkill, state.turns.slice(-6), lang, sessionId, 'outbound');
              }
              if (ttsOverride) return;
            }

            // 工具调用拦截
            if (msg.type === 'response.function_call_arguments.done') {
              const toolName = msg.name as string;
              const toolArgs = JSON.parse(msg.arguments ?? '{}') as Record<string, unknown>;
              logger.info('outbound', 'tool_called', { session: sessionId, tool: toolName, args: toolArgs });

              // 转人工
              if (toolName === 'transfer_to_human') {
                const reason = (toolArgs.reason ?? 'user_request') as string;
                const currentSkillName = taskParam === 'collection' ? 'outbound-collection' : 'outbound-marketing';
                await sendSkillDiagram(ws, userPhone, currentSkillName, null, lang, sessionId, 'outbound');
                try {
                  glmWs!.send(JSON.stringify({ event_id: crypto.randomUUID(), client_timestamp: Date.now(), type: 'conversation.item.create', item: { type: 'function_call_output', call_id: msg.call_id, output: '{"ok":true}' } }));
                  glmWs!.send(JSON.stringify({ event_id: crypto.randomUUID(), client_timestamp: Date.now(), type: 'response.create' }));
                } catch {}
                doTriggerHandoff(ws, reason, toolArgs);
                return;
              }

              // 本地 mock 处理其他工具
              let toolResult = '';

              if (toolName === 'record_call_result') {
                const result = toolArgs.result as string;
                const remark = toolArgs.remark ? t('outbound_record_remark', lang, toolArgs.remark) : '';
                const extra = toolArgs.ptp_date ? t('outbound_record_ptp', lang, toolArgs.ptp_date) : (toolArgs.callback_time ? t('outbound_record_callback', lang, toolArgs.callback_time) : '');
                toolResult = JSON.stringify({ success: true, message: t('outbound_record_result', lang, result, extra, remark) });
                logger.info('outbound', 'record_call_result', { session: sessionId, result, remark: toolArgs.remark, taskId });
              } else if (toolName === 'send_followup_sms') {
                const smsType = toolArgs.sms_type as string;
                const smsLabel = SMS_LABELS[lang][smsType] ?? smsType;
                toolResult = JSON.stringify({ success: true, message: t('outbound_sms_sent', lang, smsLabel, userPhone) });
                logger.info('outbound', 'send_followup_sms', { session: sessionId, smsType, phone: userPhone });
              } else if (toolName === 'create_callback_task') {
                const cbPhone = (toolArgs.callback_phone ?? userPhone) as string;
                const cbTime  = (toolArgs.preferred_time ?? '') as string;
                const customerName = (resolvedTask as Record<string, unknown>).customer_name as string ?? '';
                const productName  = (resolvedTask as Record<string, unknown>).product_name as string ?? '';
                const cbTask: CallbackTask = {
                  task_id:          crypto.randomUUID(),
                  original_task_id: taskId,
                  customer_name:    customerName,
                  callback_phone:   cbPhone,
                  preferred_time:   cbTime,
                  product_name:     productName,
                  created_at:       new Date().toISOString(),
                  status:           'pending',
                };
                CALLBACK_TASKS.push(cbTask);
                logger.info('outbound', 'create_callback_task', { session: sessionId, taskId, cbPhone, cbTime });
                toolResult = JSON.stringify({ success: true, message: t('outbound_callback_created', lang, cbPhone, cbTime), callback_task_id: cbTask.task_id });
              } else {
                toolResult = JSON.stringify({ error: t('tool_unknown', lang, toolName) });
              }

              // 推送无高亮版流程图（progressHL 由后续 progress tracker 异步添加）
              const currentSkillName = taskParam === 'collection' ? 'outbound-collection' : 'outbound-marketing';
              await sendSkillDiagram(ws, userPhone, currentSkillName, null, lang, sessionId, 'outbound');

              glmWs!.send(JSON.stringify({ event_id: crypto.randomUUID(), client_timestamp: Date.now(), type: 'conversation.item.create', item: { type: 'function_call_output', call_id: msg.call_id, output: toolResult } }));
              glmWs!.send(JSON.stringify({ event_id: crypto.randomUUID(), client_timestamp: Date.now(), type: 'response.create' }));
              return;
            }

            // ── GLM 敏感内容拦截（code 1301 等） ────────────────────
            if (msg.type === 'error') {
              const errCode = msg.error?.code ?? '';
              const errMsg  = msg.error?.message ?? '';
              logger.warn('outbound', 'glm_error', { session: sessionId, code: errCode, message: errMsg });

              const friendly = t('sensitive_content_error', lang);
              ws.send(JSON.stringify({ type: 'error', message: friendly }));

              sessionBus.publish(userPhone, {
                source: 'voice', type: 'compliance_alert',
                data: {
                  source: 'model_filter',
                  keywords: [`GLM-${errCode}`],
                  text: t('sensitive_content_alert', lang) + ` [${errCode}] ${errMsg.slice(0, 80)}`,
                },
                msg_id: crypto.randomUUID(),
              });
              return;
            }

            // 其余事件透传
            ws.send(text);
          } catch (e) {
            logger.warn('outbound', 'glm_message_error', { session: sessionId, error: String(e) });
          }
        });

        setupGlmCloseHandlers(glmWs, ws, () => pendingHandoff, sessionId, 'outbound');
      },

      onMessage(evt, _ws) {
        if (glmWs?.readyState === NodeWebSocket.OPEN) glmWs.send(evt.data.toString());
      },

      onClose() {
        logger.info('outbound', 'client_disconnected', { session: sessionId });
        if (glmWs && glmWs.readyState !== NodeWebSocket.CLOSED) glmWs.close();
        glmWs = null;
      },

      onError() {
        logger.error('outbound', 'client_ws_error', { session: sessionId });
        glmWs?.close();
        glmWs = null;
      },
    };
  })
);

export default outbound;

// Re-export types and callback tasks for other route files
export { CALLBACK_TASKS } from './outbound-mock';
export type { CollectionCase, MarketingTask, CallbackTask } from './outbound-mock';
