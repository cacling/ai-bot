/**
 * voice.ts — GLM-Realtime WebSocket 代理路由（含 MCP 工具调用 + 转人工）
 */

import { Hono } from 'hono';
import { createBunWebSocket } from 'hono/bun';
import NodeWebSocket from 'ws';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { subscribers, plans } from '../db/schema';
import { textToSpeech } from '../skills/tts';
import { translateText } from '../skills/translate-lang';
import { t, TOOL_LABELS } from '../i18n';
import { isNoDataResult } from '../utils/tool-result';
import { logger } from '../logger';
import { sessionBus } from '../session-bus';
import { getLangs, setCustomerLang } from '../lang-session';
import { checkCompliance } from '../compliance/keyword-filter';
import { VoiceSessionState, TRANSFER_PHRASE_RE, type HandoffContext } from '../services/voice-session';
import { callMcpTool } from '../services/mcp-client';
import { sendSkillDiagram, runEmotionAnalysis, runProgressTracking, triggerHandoff, setupGlmCloseHandlers } from '../services/voice-common';
import { getSkillsDescriptionByChannel } from '../agent/skills';

// ── 配置 ──────────────────────────────────────────────────────────────────────

import { BIZ_SKILLS_DIR as SKILLS_DIR } from '../config/paths';

/** Tool → skill name mapping: used to send skill_diagram_update to the frontend */
const SKILL_TOOL_MAP: Record<string, string> = {
  diagnose_network: 'fault-diagnosis',
  diagnose_app: 'telecom-app',
};

const ZHIPU_API_KEY      = process.env.ZHIPU_API_KEY ?? '';
const GLM_REALTIME_URL   = process.env.GLM_REALTIME_URL ?? 'wss://open.bigmodel.cn/api/paas/v4/realtime';
const GLM_REALTIME_MODEL = process.env.GLM_REALTIME_MODEL ?? 'glm-realtime-flash';
const DEFAULT_PHONE      = '13800000001';

// ── 语音 system prompt ────────────────────────────────────────────────────────
const VOICE_PROMPT_TEMPLATE =
  readFileSync(resolve(import.meta.dir, '../agent/inbound-base-system-prompt.md'), 'utf-8') +
  '\n\n' +
  readFileSync(resolve(import.meta.dir, '../agent/inbound-voice-system-prompt.md'), 'utf-8');

const ENGLISH_LANG_INSTRUCTION = `**LANGUAGE REQUIREMENT (MANDATORY — HIGHEST PRIORITY)**
You MUST respond ONLY in English for this entire conversation. All spoken responses must be in English. Do not switch to Chinese under any circumstances, even if the user speaks Chinese or tool results contain Chinese data. Always translate any Chinese data from tool results into English before including it in your response.
When calling tools that accept a \`lang\` parameter (such as diagnose_network, diagnose_app), always pass \`lang: "en"\` to receive English diagnostic output.`;

async function fetchSubscriberInfo(phone: string): Promise<{ name: string; planName: string } | null> {
  try {
    const rows = await db
      .select({ name: subscribers.name, planId: subscribers.plan_id })
      .from(subscribers)
      .where(eq(subscribers.phone, phone))
      .limit(1);
    if (!rows.length) return null;
    const planRows = await db
      .select({ name: plans.name })
      .from(plans)
      .where(eq(plans.plan_id, rows[0].planId))
      .limit(1);
    return { name: rows[0].name, planName: planRows[0]?.name ?? '' };
  } catch {
    return null;
  }
}

function buildVoicePrompt(phone: string, lang: 'zh' | 'en' = 'zh', subscriberName?: string, planName?: string): string {
  const locale = lang === 'en' ? 'en-US' : 'zh-CN';
  const today = new Date().toLocaleDateString(locale, { year: 'numeric', month: '2-digit', day: '2-digit' });
  const defaultName = lang === 'en' ? 'Customer' : '用户';
  const defaultPlan = lang === 'en' ? 'Unknown Plan' : '未知套餐';
  const voiceSkills = getSkillsDescriptionByChannel('voice');
  const base = VOICE_PROMPT_TEMPLATE
    .replace('{{PHONE}}', phone)
    .replace('{{SUBSCRIBER_NAME}}', subscriberName ?? defaultName)
    .replace('{{PLAN_NAME}}', planName ?? defaultPlan)
    .replace('{{CURRENT_DATE}}', today)
    .replace('{{AVAILABLE_SKILLS}}', voiceSkills || '（暂无可用技能）');
  return lang === 'en' ? ENGLISH_LANG_INSTRUCTION + '\n\n' + base : base;
}

// Re-export for outbound.ts and test files
export { VoiceSessionState, TRANSFER_PHRASE_RE } from '../services/voice-session';

// ── GLM 工具定义 ──────────────────────────────────────────────────────────────
const VOICE_TOOLS = [
  {
    type: 'function',
    name: 'query_subscriber',
    description: '查询用户的账户信息，包括套餐、余额、流量使用情况、已订增值业务',
    parameters: {
      type: 'object',
      properties: { phone: { type: 'string', description: '用户手机号' } },
      required: ['phone'],
    },
  },
  {
    type: 'function',
    name: 'query_bill',
    description: '查询用户的账单和费用明细',
    parameters: {
      type: 'object',
      properties: {
        phone: { type: 'string', description: '用户手机号' },
        month: { type: 'string', description: '账单月份，格式 YYYY-MM，不填则返回最近3个月' },
      },
      required: ['phone'],
    },
  },
  {
    type: 'function',
    name: 'query_plans',
    description: '查询可用套餐列表，或查询指定套餐详情',
    parameters: {
      type: 'object',
      properties: { plan_id: { type: 'string', description: '套餐 ID，不填则返回全部套餐' } },
    },
  },
  {
    type: 'function',
    name: 'cancel_service',
    description: '退订用户已开通的增值业务',
    parameters: {
      type: 'object',
      properties: {
        phone:      { type: 'string', description: '用户手机号' },
        service_id: { type: 'string', description: '要退订的业务ID，如 video_pkg、sms_100' },
      },
      required: ['phone', 'service_id'],
    },
  },
  {
    type: 'function',
    name: 'diagnose_network',
    description: '诊断用户的网络故障问题',
    parameters: {
      type: 'object',
      properties: {
        phone: { type: 'string', description: '用户手机号' },
        issue_type: {
          type: 'string',
          enum: ['no_signal', 'slow_data', 'call_drop', 'no_network'],
          description: '故障类型：no_signal=无信号，slow_data=网速慢，call_drop=通话中断，no_network=无法上网',
        },
      },
      required: ['phone', 'issue_type'],
    },
  },
  {
    type: 'function',
    name: 'diagnose_app',
    description: '诊断营业厅 App 问题，涵盖账号被锁、登录失败、设备不兼容、可疑活动等安全类场景',
    parameters: {
      type: 'object',
      properties: {
        phone: { type: 'string', description: '用户手机号' },
        issue_type: {
          type: 'string',
          enum: ['app_locked', 'login_failed', 'device_incompatible', 'suspicious_activity'],
          description: '故障类型：app_locked=App被锁定，login_failed=登录失败，device_incompatible=设备不兼容，suspicious_activity=可疑活动',
        },
      },
      required: ['phone', 'issue_type'],
    },
  },
  {
    type: 'function',
    name: 'issue_invoice',
    description: '为用户指定月份的账单开具电子发票并发送到邮箱',
    parameters: {
      type: 'object',
      properties: {
        phone: { type: 'string', description: '用户手机号' },
        month: { type: 'string', description: '账单月份，格式 YYYY-MM' },
        email: { type: 'string', description: '发票接收邮箱地址' },
      },
      required: ['phone', 'month', 'email'],
    },
  },
  {
    type: 'function',
    name: 'transfer_to_human',
    description: '将用户转接给人工客服。触发条件：用户明确要求人工、连续两轮无法识别意图、用户情绪激烈或投诉、高风险操作需人工确认、工具连续失败、身份校验未通过、置信度不足。',
    parameters: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          enum: ['user_request', 'unrecognized_intent', 'emotional_complaint', 'high_risk_operation', 'tool_failure', 'identity_verify_failed', 'low_confidence'],
          description: '转人工原因',
        },
        current_intent:     { type: 'string', description: '用户当前意图，如"退订业务"、"投诉网络" 等' },
        risk_tags:          { type: 'array', items: { type: 'string' }, description: '风险标签，如 ["complaint","high_value"]' },
        recommended_action: { type: 'string', description: '推荐坐席的下一步动作' },
      },
      required: ['reason', 'current_intent'],
    },
  },
];


// ── Bun WebSocket 适配器 ──────────────────────────────────────────────────────
export const { upgradeWebSocket, websocket: voiceWebsocket } = createBunWebSocket();

// ── 路由 ──────────────────────────────────────────────────────────────────────
const voice = new Hono();

voice.get(
  '/ws/voice',
  upgradeWebSocket((c) => {
    const userPhone = c.req.query('phone') ?? DEFAULT_PHONE;
    const lang      = (c.req.query('lang') ?? 'zh') as 'zh' | 'en';
    const resume    = c.req.query('resume') === 'true';
    const sessionId = crypto.randomUUID();
    let glmWs: InstanceType<typeof NodeWebSocket> | null = null;
    const state = new VoiceSessionState(userPhone, sessionId);
    let pendingHandoff: Promise<void> | null = null;
    let unsubscribeAgent: (() => void) | null = null;
    let activeSkillName: string | null = null; // 当前活跃 skill，用于进度追踪

    // ── 转人工触发器 ──────────────────────────────────────────────────────────
    function doTriggerHandoff(
      ws: { send: (data: string) => void },
      reason: string,
      toolArgs: Record<string, unknown> = {},
    ) {
      const agentLang = getLangs(userPhone).agent;
      const toolLabel = TOOL_LABELS[lang];
      pendingHandoff = triggerHandoff(state, ws, sessionId, reason, toolArgs, {
        toolLabels: toolLabel,
        defaultIntent: t('handoff_default_inquiry', lang),
        buildSummary: (intent, tools) => t('handoff_summary_inferred', lang, intent, tools),
        buildMainIssue: (intent) => t('handoff_issue_incomplete', lang, intent),
        businessObject: [],
        buildActionLabel: (tc, label) => {
          if (!tc.success) return t('tool_failed', lang, label);
          const noData = isNoDataResult(tc.result_summary);
          return noData ? t('tool_no_data', lang, label) : t('tool_success', lang, label);
        },
        defaultNextAction: t('handoff_next_action_greet', lang),
        defaultPriority: t('priority_medium', lang),
        analysisLang: agentLang as 'zh' | 'en',
        channel: 'voice',
        lang,
      }) ?? null;
    }

    return {
      // ── 前端连接建立 ──────────────────────────────────────────────────────
      async onOpen(_evt, ws) {
        logger.info('voice', 'client_connected', { session: sessionId, phone: userPhone, lang, resume });
        setCustomerLang(userPhone, lang);
        if (!resume) {
          sessionBus.clearHistory(userPhone);
          sessionBus.publish(userPhone, { source: 'system', type: 'new_session', channel: 'voice', msg_id: crypto.randomUUID() });
        }
        const subInfo = await fetchSubscriberInfo(userPhone);
        logger.info('voice', 'subscriber_info', { session: sessionId, name: subInfo?.name ?? null, plan: subInfo?.planName ?? null });

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
          logger.info('voice', 'glm_connected', { session: sessionId, model: GLM_REALTIME_MODEL });
          const instructions = buildVoicePrompt(userPhone, lang, subInfo?.name, subInfo?.planName);
          const hasEnInstruction = instructions.includes('LANGUAGE REQUIREMENT');
          logger.info('voice', 'lang_chain_prompt', { session: sessionId, lang, hasEnInstruction, promptLen: instructions.length, promptHead: instructions.slice(0, 120) });
          glmWs!.send(JSON.stringify({
            event_id: crypto.randomUUID(),
            client_timestamp: Date.now(),
            type: 'session.update',
            session: {
              beta_fields: { chat_mode: 'audio' },
              modalities: ['text', 'audio'],
              instructions,
              voice: 'tongtong',
              input_audio_format: 'pcm',
              output_audio_format: 'mp3',
              turn_detection: {
                type: 'server_vad',
                silence_duration_ms: 1500,
                threshold: 0.6,
                interrupt_response: false,
              },
              temperature: 0.2,
              tools: VOICE_TOOLS,
            },
          }));
        });

        // ── 非中文 TTS 覆盖：拦截 GLM 中文音频，按句翻译 + TTS 生成目标语言语音 ──
        const ttsOverride = lang !== 'zh';
        /** 累积当前回合的 transcript delta 片段 */
        let ttsAccum = '';
        /** 已处理的字符偏移量（用于按句切分） */
        let ttsFlushed = 0;
        /** 当前回合的 TTS 分句 Promise 队列（保证顺序播放） */
        let ttsQueue: Promise<void> = Promise.resolve();

        /** 按句切分并异步翻译 + TTS，流式发给前端 */
        function ttsSendSentence(sentence: string) {
          ttsQueue = ttsQueue.then(async () => {
            try {
              const translated = await translateText(sentence, lang);
              const audio = await textToSpeech(translated, lang);
              logger.info('voice', 'tts_override_sentence', { session: sessionId, zhLen: sentence.length, enPreview: translated.slice(0, 60) });
              ws.send(JSON.stringify({ type: 'tts_override', text: translated, audio }));
            } catch (e) {
              logger.warn('voice', 'tts_override_error', { session: sessionId, error: String(e), sentence: sentence.slice(0, 40) });
              // 降级：发送未翻译文本（无音频）
              ws.send(JSON.stringify({ type: 'tts_override', text: sentence, audio: null }));
            }
          });
        }

        /** 检查累积文本中是否有完整句子可以发送 */
        function ttsFlushSentences() {
          // 按中文句号/问号/感叹号/分号 或 连续逗号后的长段 切分
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

        /** 回合结束时，发送剩余未切分的尾部文本 */
        function ttsFlushRemainder() {
          const remainder = ttsAccum.slice(ttsFlushed).trim();
          if (remainder) ttsSendSentence(remainder);
          ttsAccum = '';
          ttsFlushed = 0;
        }

        // GLM → 前端：拦截工具调用和转人工，其余透传
        glmWs.on('message', async (data: Buffer) => {
          try {
            const text = data.toString();
            const msg  = JSON.parse(text);

            logger.info('voice', 'glm_event', { session: sessionId, type: msg.type, preview: text.slice(0, 200) });

            // ── 会话就绪后：触发机器人主动问候 ───────────────────────────
            if (msg.type === 'session.updated') {
              logger.info('voice', 'trigger_bot_opening', { session: sessionId });
              glmWs!.send(JSON.stringify({
                event_id: crypto.randomUUID(),
                client_timestamp: Date.now(),
                type: 'response.create',
              }));
            }

            // ── 用户语音转写完成 → 记录用户话语 + 异步情绪分析 ──────────
            if (msg.type === 'conversation.item.input_audio_transcription.completed') {
              const transcript = (msg.transcript ?? '') as string;
              if (transcript) {
                state.addUserTurn(transcript);
                state.markUserEnd();
                const umId = crypto.randomUUID();
                logger.info('voice', 'bus_publish_user_message', { session: sessionId, phone: userPhone, preview: transcript.slice(0, 40), msg_id: umId });
                sessionBus.publish(userPhone, { source: 'voice', type: 'user_message', text: transcript, msg_id: umId });
                runEmotionAnalysis(ws, userPhone, transcript, state.turns.slice(-5));
              }
            }

            // ── 非中文模式：拦截 transcript delta，按句切分翻译 + TTS ──────
            if (ttsOverride && msg.type === 'response.audio_transcript.delta') {
              const delta = (msg.delta ?? '') as string;
              if (delta) {
                ttsAccum += delta;
                ttsFlushSentences();
              }
              return; // 不透传中文字幕给前端
            }

            // ── bot 回复完整文本 → 记录助手话语 + 检测转人工兜底 ──────────
            if (msg.type === 'response.audio_transcript.done') {
              if (state.transferTriggered && state.farewellDone) return;
              const transcript = (msg.transcript ?? '') as string;
              if (transcript) {
                // 非中文模式：发送剩余未切分的尾句
                if (ttsOverride) {
                  ttsFlushRemainder();
                  logger.info('voice', 'tts_override_done', { session: sessionId, zhLen: transcript.length });
                }
                // 检测 GLM 回复语言是否与用户设置一致
                const hasChinese = /[\u4e00-\u9fff]/.test(transcript);
                const expectedEn = lang === 'en';
                if (expectedEn && hasChinese) {
                  logger.warn('voice', 'lang_chain_mismatch', { session: sessionId, lang, transcript: transcript.slice(0, 80), turn: state.turns.length });
                }
                state.addAssistantTurn(transcript);
                const respId = crypto.randomUUID();
                logger.info('voice', 'bus_publish_response', { session: sessionId, phone: userPhone, lang, preview: transcript.slice(0, 40), msg_id: respId, turn: state.turns.length });
                sessionBus.publish(userPhone, { source: 'voice', type: 'response', text: transcript, msg_id: respId });

                // ── 合规异步检查 ──
                const voiceCompliance = checkCompliance(transcript);
                if (voiceCompliance.hasBlock || voiceCompliance.hasWarning) {
                  const alertKeywords = voiceCompliance.matches.map(m => m.keyword);
                  logger.warn('voice', 'compliance_alert', { session: sessionId, phone: userPhone, keywords: alertKeywords });
                  sessionBus.publish(userPhone, {
                    source: 'voice', type: 'compliance_alert',
                    data: { source: 'bot_voice', keywords: alertKeywords, text: transcript.slice(0, 100) },
                    msg_id: crypto.randomUUID(),
                  });
                }

                if (
                  !state.transferTriggered &&
                  TRANSFER_PHRASE_RE.test(transcript)
                ) {
                  logger.info('voice', 'transfer_detected_via_speech', { session: sessionId, transcript });
                  doTriggerHandoff(ws, 'user_request');
                }

                // ── 异步流程进度追踪 ──
                logger.info('voice', 'progress_check', { session: sessionId, activeSkillName, turnsLen: state.turns.length });
                if (activeSkillName) {
                  runProgressTracking(ws, userPhone, activeSkillName, state.turns.slice(-6), lang, sessionId, 'voice');
                }
              }
              // 非中文模式：不透传 GLM 的 transcript.done 事件（前端由 tts_override 驱动）
              if (ttsOverride) return;
            }

            // ── 拦截工具调用（MCP 工具 + 转人工） ────────────────────────
            if (msg.type === 'response.function_call_arguments.done') {
              const toolName = msg.name as string;
              const toolArgs = JSON.parse(msg.arguments ?? '{}') as Record<string, unknown>;
              logger.info('voice', 'tool_called', { session: sessionId, tool: toolName });

              // ── 转人工（工具调用路径） ─────────────────────────────────────
              if (toolName === 'transfer_to_human') {
                const reason = (toolArgs.reason ?? 'user_request') as string;
                logger.info('voice', 'transfer_to_human_tool_called', { session: sessionId, reason });

                try {
                  glmWs!.send(JSON.stringify({
                    event_id: crypto.randomUUID(),
                    client_timestamp: Date.now(),
                    type: 'conversation.item.create',
                    item: { type: 'function_call_output', call_id: msg.call_id, output: '{"ok":true}' },
                  }));
                  glmWs!.send(JSON.stringify({
                    event_id: crypto.randomUUID(),
                    client_timestamp: Date.now(),
                    type: 'response.create',
                  }));
                } catch (e) {
                  logger.warn('voice', 'transfer_glm_send_error', { session: sessionId, error: String(e) });
                }

                doTriggerHandoff(ws, reason, toolArgs);
                return;
              }

              // ── MCP 工具调用 ──────────────────────────────────────────────
              logger.info('voice', 'tool_call_start', { session: sessionId, tool: toolName, args: toolArgs });
              const { text: result, success } = await callMcpTool(sessionId, toolName, toolArgs);
              state.recordTool(toolName, toolArgs, result, success);
              logger.info('voice', 'lang_chain_mcp_result', { session: sessionId, tool: toolName, lang, resultPreview: result.slice(0, 150) });

              // 若该工具对应某个 skill，推送高亮版 skill_diagram_update
              if (SKILL_TOOL_MAP[toolName]) {
                activeSkillName = SKILL_TOOL_MAP[toolName];
                await sendSkillDiagram(ws, userPhone, activeSkillName, toolName, lang, sessionId, 'voice');
              }

              // Translate tool result to English before feeding back to GLM
              let toolOutput = result;
              if (lang === 'en') {
                try {
                  toolOutput = await translateText(result, 'en');
                  logger.info('voice', 'lang_chain_translated', { session: sessionId, tool: toolName, ok: true, translatedPreview: toolOutput.slice(0, 150) });
                } catch (e) {
                  logger.warn('voice', 'lang_chain_translated', { session: sessionId, tool: toolName, ok: false, error: String(e) });
                }
              }
              logger.info('voice', 'lang_chain_to_glm', { session: sessionId, tool: toolName, lang, outputPreview: toolOutput.slice(0, 150) });
              glmWs!.send(JSON.stringify({
                event_id: crypto.randomUUID(),
                client_timestamp: Date.now(),
                type: 'conversation.item.create',
                item: { type: 'function_call_output', call_id: msg.call_id, output: toolOutput },
              }));
              glmWs!.send(JSON.stringify({
                event_id: crypto.randomUUID(),
                client_timestamp: Date.now(),
                type: 'response.create',
              }));
              return;
            }

            // 转人工后：告别语的 response.done 到达后标记完成
            if (state.transferTriggered && !state.farewellDone && msg.type === 'response.done') {
              state.farewellDone = true;
            }

            // 转人工且告别语已播完：拦截后续 GLM 响应/音频
            if (state.transferTriggered && state.farewellDone && (
              msg.type.startsWith('response.') ||
              msg.type.startsWith('output_audio_buffer.')
            )) {
              return;
            }

            // ── GLM 敏感内容拦截（code 1301 等） ────────────────────
            if (msg.type === 'error') {
              const errCode = msg.error?.code ?? '';
              const errMsg  = msg.error?.message ?? '';
              logger.warn('voice', 'glm_error', { session: sessionId, code: errCode, message: errMsg });

              // 向前端发送友好提示（替换原始技术性错误信息）
              const friendly = t('sensitive_content_error', lang);
              ws.send(JSON.stringify({ type: 'error', message: friendly }));

              // 向坐席工作台推送合规告警
              sessionBus.publish(userPhone, {
                source: 'voice', type: 'compliance_alert',
                data: {
                  source: 'model_filter',
                  keywords: [`GLM-${errCode}`],
                  text: t('sensitive_content_alert', lang) + ` [${errCode}] ${errMsg.slice(0, 80)}`,
                },
                msg_id: crypto.randomUUID(),
              });
              return;                 // 不再透传原始 error
            }

            // ── 首包时延检测 ──────────────────────
            if (msg.type === 'response.audio.delta') {
              const latency = state.markFirstAudioPack();
              if (latency !== null) {
                logger.info('voice', 'first_pack_latency', { session: sessionId, latency_ms: latency });
              }
              // 非中文模式：拦截 GLM 中文音频，不发给前端
              if (ttsOverride) return;
            }

            // ── 打断检测 ────────────────────────────────────────────────
            if (msg.type === 'input_audio_buffer.speech_started') {
              state.markBargeIn();
              logger.info('voice', 'barge_in', { session: sessionId, count: state.bargeInCount });
            }

            // 其余事件正常透传
            ws.send(text);
          } catch (e) {
            logger.warn('voice', 'glm_message_error', { session: sessionId, error: String(e) });
          }
        });

        setupGlmCloseHandlers(glmWs, ws, () => pendingHandoff, sessionId, 'voice');

        // Subscribe to agent messages and play TTS to customer
        unsubscribeAgent = sessionBus.subscribe(userPhone, async (event) => {
          if (event.source === 'agent' && event.type === 'transfer_to_bot') {
            logger.info('voice', 'transfer_to_bot', { session: sessionId });
            try { ws.send(JSON.stringify({ type: 'transfer_to_bot' })); } catch { /* ws closed */ }
            return;
          }

          if (event.source !== 'agent' || event.type !== 'agent_message') return;
          const agentText = event.text as string;
          if (!agentText?.trim()) return;

          const { agent: agentLang, customer: customerLang } = getLangs(userPhone);
          let textForTts = agentText;

          if (agentLang !== customerLang) {
            try {
              textForTts = await translateText(agentText, customerLang);
              logger.info('voice', 'agent_message_translated', { session: sessionId, from: agentLang, to: customerLang, preview: textForTts.slice(0, 40) });
            } catch (e) {
              logger.warn('voice', 'agent_message_translate_error', { session: sessionId, error: String(e) });
            }
          }

          try {
            const audio = await textToSpeech(textForTts, customerLang);
            logger.info('voice', 'agent_tts_done', { session: sessionId, lang: customerLang, chars: textForTts.length });
            try { ws.send(JSON.stringify({ type: 'agent_audio', audio, text: textForTts, original_text: agentText })); } catch { /* ws closed */ }
          } catch (e) {
            logger.error('voice', 'agent_tts_error', { session: sessionId, error: String(e) });
            try { ws.send(JSON.stringify({ type: 'agent_message', text: textForTts, original_text: agentText })); } catch { /* ws closed */ }
          }
        });
      },

      onMessage(evt, _ws) {
        if (glmWs?.readyState === NodeWebSocket.OPEN) {
          glmWs.send(evt.data.toString());
        }
      },

      onClose() {
        if (state.silenceTimer) clearTimeout(state.silenceTimer);
        logger.info('voice', 'session_metrics', { session: sessionId, phone: userPhone, ...state.getMetrics() });
        logger.info('voice', 'client_disconnected', { session: sessionId });
        unsubscribeAgent?.();
        unsubscribeAgent = null;
        if (glmWs && glmWs.readyState !== NodeWebSocket.CLOSED) glmWs.close();
        glmWs = null;
      },

      onError() {
        logger.error('voice', 'client_ws_error', { session: sessionId });
        glmWs?.close();
        glmWs = null;
      },
    };
  })
);

export default voice;
