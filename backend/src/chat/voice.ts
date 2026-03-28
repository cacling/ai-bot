/**
 * voice.ts — GLM-Realtime WebSocket 代理路由（含 MCP 工具调用 + 转人工）
 */

import { Hono } from 'hono';
import { createBunWebSocket } from 'hono/bun';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { subscribers, plans } from '../db/schema';
import { textToSpeech } from '../services/tts';
import { translateText } from '../services/translate-lang';
import { t, TOOL_LABELS } from '../services/i18n';
import { isNoDataResult } from '../services/tool-result';
import { logger } from '../services/logger';
import { sessionBus } from '../services/session-bus';
import { getLangs, setCustomerLang } from '../services/lang-session';
import { checkCompliance } from '../services/keyword-filter';
import { VoiceSessionState } from '../services/voice-session';
import { getMockedToolNames, matchMockRule } from '../services/mock-engine';
import { sendSkillDiagram, runProgressTracking, triggerHandoff } from '../services/voice-common';
import { getSkillsDescriptionByChannel, getSkillContent } from '../engine/skills';
import { SOPGuard } from '../engine/sop-guard';
import { GlmRealtimeController, type WsSend, type ToolCallCtx } from '../services/glm-realtime-controller';

// ── 配置 ──────────────────────────────────────────────────────────────────────

const DEFAULT_PHONE = '13800000001';

// ── 语音 system prompt ────────────────────────────────────────────────────────
const VOICE_PROMPT_TEMPLATE =
  readFileSync(resolve(import.meta.dir, '../engine/inbound-voice-system-prompt.md'), 'utf-8');

const ENGLISH_LANG_INSTRUCTION = `**LANGUAGE REQUIREMENT (MANDATORY — HIGHEST PRIORITY)**
You MUST respond ONLY in English for this entire conversation. All spoken responses must be in English. Do not switch to Chinese under any circumstances, even if the user speaks Chinese or tool results contain Chinese data. Always translate any Chinese data from tool results into English before including it in your response.
When calling tools that accept a \`lang\` parameter (such as diagnose_network, diagnose_app), always pass \`lang: "en"\` to receive English diagnostic output.`;

async function fetchSubscriberInfo(phone: string): Promise<{ name: string; gender: string; planName: string } | null> {
  try {
    const rows = await db
      .select({ name: subscribers.name, gender: subscribers.gender, planId: subscribers.plan_id })
      .from(subscribers)
      .where(eq(subscribers.phone, phone))
      .limit(1);
    if (!rows.length) return null;
    const planRows = await db
      .select({ name: plans.name })
      .from(plans)
      .where(eq(plans.plan_id, rows[0].planId))
      .limit(1);
    return { name: rows[0].name, gender: rows[0].gender, planName: planRows[0]?.name ?? '' };
  } catch {
    return null;
  }
}

function buildVoicePrompt(phone: string, lang: 'zh' | 'en' = 'zh', subscriberName?: string, planName?: string, gender?: string): string {
  const locale = lang === 'en' ? 'en-US' : 'zh-CN';
  const today = new Date().toLocaleDateString(locale, { year: 'numeric', month: '2-digit', day: '2-digit' });
  const defaultName = lang === 'en' ? 'Customer' : '用户';
  const defaultPlan = lang === 'en' ? 'Unknown Plan' : '未知套餐';
  let displayName = subscriberName ?? defaultName;
  if (subscriberName && gender) {
    const title = lang === 'en'
      ? (gender === 'male' ? 'Mr. ' : gender === 'female' ? 'Ms. ' : '')
      : (gender === 'male' ? '先生' : gender === 'female' ? '女士' : '');
    displayName = lang === 'en' ? `${title}${subscriberName}` : `${subscriberName}${title}`;
  }
  const voiceSkills = getSkillsDescriptionByChannel('voice');
  const base = VOICE_PROMPT_TEMPLATE
    .replace('{{PHONE}}', phone)
    .replace('{{SUBSCRIBER_NAME}}', displayName)
    .replace('{{PLAN_NAME}}', planName ?? defaultPlan)
    .replace('{{CURRENT_DATE}}', today)
    .replace('{{SKILL_CONTENT}}', voiceSkills || '（暂无可用技能）');
  return lang === 'en' ? ENGLISH_LANG_INSTRUCTION + '\n\n' + base : base;
}

// Re-export for outbound.ts and test files
export { VoiceSessionState, TRANSFER_PHRASE_RE } from '../services/voice-session';

// ── GLM 工具定义（从 DB 动态生成）─────────────────────────────────────────────

import { getToolsOverview } from '../agent/km/mcp/tools-overview';

const TRANSFER_TO_HUMAN_TOOL = {
  type: 'function',
  name: 'transfer_to_human',
  description: '将用户转接给人工客服。触发条件：用户明确要求人工、连续两轮无法识别意图、用户情绪激烈或投诉、高风险操作需人工确认、工具连续失败、身份校验未通过、置信度不足、用户问题超出已有技能范围。',
  parameters: {
    type: 'object',
    properties: {
      reason: {
        type: 'string',
        enum: ['user_request', 'unrecognized_intent', 'emotional_complaint', 'high_risk_operation', 'tool_failure', 'identity_verify_failed', 'low_confidence'],
        description: '转人工原因',
      },
      current_intent:     { type: 'string', description: '用户当前意图，如"退订业务"、"停机保号" 等' },
      risk_tags:          { type: 'array', items: { type: 'string' }, description: '风险标签，如 ["complaint","high_value"]' },
      recommended_action: { type: 'string', description: '推荐坐席的下一步动作' },
    },
    required: ['reason', 'current_intent'],
  },
};

/** 从 DB 读取所有 available 的 MCP 工具，转换为 GLM function calling 格式 */
function buildVoiceTools(): Array<Record<string, unknown>> {
  const tools: Array<Record<string, unknown>> = [];
  const allTools = getToolsOverview();

  tools.push({
    type: 'function',
    name: 'get_skill_instructions',
    description: '加载指定技能的完整操作指南（含状态图 SOP）。收到用户问题后，必须先调用此工具加载对应技能，再按 SOP 逐步执行。',
    parameters: {
      type: 'object',
      properties: { skill_name: { type: 'string', description: '技能名称（kebab-case）' } },
      required: ['skill_name'],
    },
  });

  for (const tool of allTools) {
    if (tool.source_type === 'builtin') continue;
    if (tool.status !== 'available') continue;

    const schema = (() => {
      try {
        const { getToolDetail } = require('../agent/km/mcp/tools-overview');
        const detail = getToolDetail(tool.name);
        if (detail?.inputSchema) return detail.inputSchema;
      } catch { /* ignore */ }
      return { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' } }, required: ['phone'] };
    })();

    tools.push({
      type: 'function',
      name: tool.name,
      description: tool.description,
      parameters: schema,
    });
  }

  tools.push(TRANSFER_TO_HUMAN_TOOL);
  return tools;
}


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

    const state = new VoiceSessionState(userPhone, sessionId);
    const sopGuard = new SOPGuard();
    let pendingHandoff: Promise<void> | null = null;
    let unsubscribeAgent: (() => void) | null = null;
    let activeSkillName: string | null = null;

    // ── 转人工触发器 ──────────────────────────────────────────────────────────
    function doTriggerHandoff(ws: WsSend, reason: string, toolArgs: Record<string, unknown> = {}) {
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

    let controller: GlmRealtimeController;

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

        const instructions = buildVoicePrompt(userPhone, lang, subInfo?.name, subInfo?.planName, subInfo?.gender);
        const voiceTools = buildVoiceTools();
        const hasEnInstruction = instructions.includes('LANGUAGE REQUIREMENT');
        logger.info('voice', 'lang_chain_prompt', { session: sessionId, lang, hasEnInstruction, promptLen: instructions.length, promptHead: instructions.slice(0, 120) });
        logger.info('voice', 'session_tools', { session: sessionId, toolCount: voiceTools.length, toolNames: voiceTools.map((t: any) => t.name) });

        controller = new GlmRealtimeController(
          {
            channel: 'voice',
            sessionId,
            userPhone,
            lang,
            systemPrompt: instructions,
            tools: voiceTools,
            voiceName: 'tongtong',
            vadInterruptResponse: process.env.VAD_INTERRUPT === 'true',
          },
          state,
          {
            // ── GLM 事件前置拦截 ──
            onGlmEvent: (msg, wsRef) => {
              // 转写失败 → 标记静默
              if (msg.type === 'conversation.item.input_audio_transcription.failed') {
                state.muteNextResponse = true;
                logger.info('voice', 'transcription_failed_mute', { session: sessionId });
                return 'handled';
              }

              // 噪音触发的回应 → 拦截
              if (state.muteNextResponse) {
                if (msg.type === 'response.audio.delta') return 'handled';
                if (msg.type === 'response.audio_transcript.delta' || msg.type === 'response.audio_transcript.done') return 'handled';
                if (msg.type === 'response.done') {
                  state.muteNextResponse = false;
                  logger.info('voice', 'muted_response_done', { session: sessionId });
                  return 'handled';
                }
              }

              // 工具处理中 → 拦截 GLM 过渡回复
              if (state.toolProcessing) {
                if (msg.type === 'response.audio.delta' || msg.type === 'response.audio_transcript.delta' || msg.type === 'response.audio_transcript.done') {
                  logger.info('voice', 'tool_processing_muted', { session: sessionId, type: msg.type });
                  return 'handled';
                }
                if (msg.type === 'response.done') {
                  logger.info('voice', 'tool_processing_response_done', { session: sessionId });
                  return 'handled';
                }
              }

              // 转人工后告别语完毕 → 拦截后续 GLM 响应
              if (state.transferTriggered && state.farewellDone && (
                msg.type.startsWith('response.') || msg.type.startsWith('output_audio_buffer.')
              )) {
                return 'handled';
              }

              // 转人工后 bot 回复完毕前的 transcript.done → 拦截（farewell gating）
              if (state.transferTriggered && state.farewellDone && msg.type === 'response.audio_transcript.done') {
                return 'handled';
              }

              // 打断检测
              if (msg.type === 'input_audio_buffer.speech_started') {
                state.markBargeIn();
                logger.info('voice', 'barge_in', { session: sessionId, count: state.bargeInCount });
              }

              return 'pass';
            },

            // ── get_skill_instructions 短路 ──
            onBeforeToolCall: async (ctx: ToolCallCtx) => {
              if (ctx.toolName === 'get_skill_instructions') {
                const skillName = (ctx.toolArgs.skill_name ?? '') as string;
                const content = getSkillContent(skillName) ?? getSkillContent(skillName.replace(/_/g, '-')) ?? `技能 "${skillName}" 不存在`;
                activeSkillName = skillName.replace(/_/g, '-');
                sopGuard.recordToolCall('get_skill_instructions', { success: true, hasData: true });
                try {
                  const { skillWorkflowSpecs } = await import('../db/schema');
                  const { eq: eqFn, and } = await import('drizzle-orm');
                  const planRow = db.select().from(skillWorkflowSpecs)
                    .where(and(eqFn(skillWorkflowSpecs.skill_id, activeSkillName), eqFn(skillWorkflowSpecs.status, 'published')))
                    .get();
                  if (planRow) {
                    sopGuard.activatePlan(activeSkillName, JSON.parse(planRow.spec_json));
                    logger.info('voice', 'plan_activated', { session: sessionId, skill: activeSkillName });
                  }
                } catch { /* ignore */ }
                logger.info('voice', 'skill_loaded', { session: sessionId, skill: activeSkillName, content_len: content.length });
                await sendSkillDiagram(ws, userPhone, activeSkillName, null, lang, sessionId, 'voice');
                return content;
              }
              return null;
            },

            sopCheck: (toolName) => sopGuard.check(toolName),
            sopRecord: (toolName, r) => sopGuard.recordToolCall(toolName, r),

            mockToolCall: (name, args) => {
              const mockedNames = getMockedToolNames();
              if (!mockedNames.has(name)) return null;
              const mockResult = matchMockRule(name, args);
              if (mockResult !== null) {
                return { result: mockResult, success: true };
              }
              return { result: JSON.stringify({ success: false, message: `工具 ${name} 处于 Mock 模式但未匹配到规则` }), success: false };
            },

            getActiveSkillName: () => activeSkillName,
            setActiveSkillName: (name) => { activeSkillName = name; },

            onBotReply: (transcript) => {
              // 检测 GLM 回复语言是否与用户设置一致
              const hasChinese = /[\u4e00-\u9fff]/.test(transcript);
              if (lang === 'en' && hasChinese) {
                logger.warn('voice', 'lang_chain_mismatch', { session: sessionId, lang, transcript: transcript.slice(0, 80), turn: state.turns.length });
              }

              // 合规异步检查
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

              // 异步流程进度追踪
              logger.info('voice', 'progress_check', { session: sessionId, activeSkillName, turnsLen: state.turns.length });
              if (activeSkillName) {
                runProgressTracking(ws, userPhone, activeSkillName, state.turns.slice(-6), lang, sessionId, 'voice');
              }
            },

            onClose: () => {
              if (state.silenceTimer) clearTimeout(state.silenceTimer);
              logger.info('voice', 'session_metrics', { session: sessionId, phone: userPhone, ...state.getMetrics() });
              unsubscribeAgent?.();
              unsubscribeAgent = null;
            },
          },
          doTriggerHandoff,
          () => pendingHandoff,
        );

        controller.start(ws);

        // ── Skill 推断（在工具管道中补充）──
        // 已通过 getActiveSkillName/setActiveSkillName hooks 处理

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

export default voice;
