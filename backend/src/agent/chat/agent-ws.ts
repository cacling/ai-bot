/**
 * agent-ws.ts — Persistent WebSocket route for agent workstation (/ws/agent)
 *
 * Connection params (query string):
 *   ?phone=13800000001&lang=zh
 *
 * Client messages:
 *   { type: 'agent_message', message: '...' }
 *
 * Server events (mirrored from customer session via sessionBus):
 *   { source: 'user', type: 'user_message',       text }
 *   { source: 'user', type: 'text_delta',          delta }
 *   { source: 'user', type: 'skill_diagram_update', skill_name, mermaid }
 *   { source: 'user', type: 'response',             text, card, skill_diagram }
 *
 * Plus agent's own processing results:
 *   { source: 'agent', type: 'text_delta',          delta }
 *   { source: 'agent', type: 'skill_diagram_update', skill_name, mermaid }
 *   { source: 'agent', type: 'response',             text, card, skill_diagram }
 *   { type: 'error',   message: '...' }
 *   { source: 'system', type: 'new_session', channel: 'chat'|'voice'|'outbound' }
 */
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { sessions } from '../../db/schema';
import { upgradeWebSocket } from '../../chat/voice';
import { sessionBus } from '../../session-bus';
import { logger } from '../../logger';
import { analyzeEmotion } from '../card/emotion-analyzer';
import { analyzeHandoff, type TurnRecord, type ToolRecord, type HandoffAnalysis } from '../card/handoff-analyzer';
import { setAgentLang, getLangs } from '../../lang-session';
import { translateText } from '../../skills/translate-lang';
import { checkCompliance } from '../../services/keyword-filter';
import { t, TOOL_LABELS } from '../../i18n';

const agentWs = new Hono();

function buildHandoffFallback(
  userMessage: string,
  toolRecords: ToolRecord[],
  args: { current_intent?: string; recommended_action?: string },
  lang: 'zh' | 'en' = 'zh',
): HandoffAnalysis {
  const labels = TOOL_LABELS[lang];
  const toolNames = toolRecords
    .filter(r => r.success && r.tool !== 'transfer_to_human')
    .map(r => t('tool_success', lang, labels[r.tool] ?? r.tool));
  return {
    customer_intent: args.current_intent ?? t('handoff_default_intent', lang),
    main_issue: userMessage.slice(0, 50),
    business_object: [],
    confirmed_information: [],
    actions_taken: toolNames,
    current_status: t('status_in_progress', lang),
    handoff_reason: args.current_intent ?? t('handoff_reason_user_request', lang),
    next_action: args.recommended_action ?? t('handoff_next_action_greet', lang),
    priority: t('priority_medium', lang),
    risk_flags: [],
    session_summary: t('handoff_summary_basic', lang, userMessage.slice(0, 30), toolRecords.length > 0),
  };
}

async function runHandoffAnalysis(
  ws: { send: (data: string) => void },
  turns: TurnRecord[],
  toolRecords: ToolRecord[],
  args: { current_intent?: string; recommended_action?: string },
  userMessage: string,
  lang: 'zh' | 'en' = 'zh',
): Promise<void> {
  const fallback = buildHandoffFallback(userMessage, toolRecords, args, lang);
  try {
    const analysis = await Promise.race([
      analyzeHandoff(turns, toolRecords, lang),
      new Promise<HandoffAnalysis>(resolve => setTimeout(() => resolve(fallback), 12000)),
    ]);
    ws.send(JSON.stringify({ type: 'handoff_card', data: analysis }));
  } catch {
    ws.send(JSON.stringify({ type: 'handoff_card', data: fallback }));
  }
}

agentWs.get('/ws/agent', upgradeWebSocket((c) => {
  const phone     = c.req.query('phone') ?? '13800000001';
  const langParam = (c.req.query('lang') === 'en' ? 'en' : 'zh') as 'zh' | 'en';

  let unsubscribe: (() => void) | null = null;

  return {
    onOpen: (_, ws) => {
      // Register agent language
      setAgentLang(phone, langParam);
      logger.info('agent-ws', 'open', { phone, initLang: langParam, langs: getLangs(phone) });

      // Subscribe to customer-side events → translate if needed → forward to agent WS
      unsubscribe = sessionBus.subscribeWithHistory(phone, async (event) => {
        // Voice session events: translate user_message / response if langs differ, forward others directly
        if (event.source === 'voice') {
          if (event.type === 'user_message' || event.type === 'response') {
            const { agent: agentLang, customer: customerLang } = getLangs(phone);
            const willTranslate = agentLang !== customerLang;
            logger.info('agent-ws', 'voice_event_translate_check', {
              phone, eventType: event.type, agentLang, willTranslate,
              preview: event.text.slice(0, 40),
            });
            if (willTranslate) {
              try {
                const translated = await translateText(event.text, agentLang);
                logger.info('agent-ws', 'voice_event_translated', { phone, agentLang, preview: translated.slice(0, 40) });
                try { ws.send(JSON.stringify({ ...event, translated_text: translated })); } catch { /* ws closed */ }
                return;
              } catch (e) {
                logger.warn('agent-ws', 'voice_event_translate_error', { phone, error: String(e) });
                /* fall through to send original */
              }
            }
          }
          try { ws.send(JSON.stringify(event)); } catch { /* ws closed */ }
          return;
        }

        if (event.source === 'system') {
          logger.info('agent-ws', 'system_event_forward', { phone, eventType: event.type, channel: (event as Record<string,unknown>).channel });
          try { ws.send(JSON.stringify(event)); } catch { /* ws closed */ }
          return;
        }

        // Forward compliance_alert from any source (agent, voice, model_filter)
        if (event.type === 'compliance_alert') {
          logger.info('agent-ws', 'compliance_alert_forwarded', { phone, source: event.source, data: (event as Record<string,unknown>).data });
          try { ws.send(JSON.stringify(event)); } catch { /* ws closed */ }
          return;
        }

        if (event.source !== 'user') return;

        if (event.type === 'transfer_data') {
          // Run handoff analysis on agent side; don't forward raw transfer_data to agent WS
          const { agent: agentLang } = getLangs(phone);
          runHandoffAnalysis(ws, event.turns as TurnRecord[], event.toolRecords as ToolRecord[], event.args, event.userMessage, agentLang)
            .catch(() => { /* ignore */ });
          return;
        }

        if (event.type === 'user_message') {
          // Trigger emotion analysis async; result sent as emotion_update
          analyzeEmotion(event.text).then(emotion => {
            try { ws.send(JSON.stringify({ type: 'emotion_update', ...emotion })); } catch { /* ws closed */ }
          }).catch(() => { /* ignore */ });

          // Translate customer message for agent if langs differ
          const { agent: agentLang, customer: customerLang } = getLangs(phone);
          logger.info('agent-ws', 'user_message_langs', { phone, agentLang, customerLang, willTranslate: agentLang !== customerLang });
          if (agentLang !== customerLang) {
            try {
              const translated = await translateText(event.text, agentLang);
              try { ws.send(JSON.stringify({ ...event, translated_text: translated })); } catch { /* ws closed */ }
              return;
            } catch { /* fall through to send original */ }
          }
        }

        // Translate AI response (source:'user', type:'response') for agent if langs differ
        if (event.type === 'response' && typeof event.text === 'string') {
          const { agent: agentLang, customer: customerLang } = getLangs(phone);
          if (agentLang !== customerLang) {
            try {
              const translated = await translateText(event.text, agentLang);
              try { ws.send(JSON.stringify({ ...event, translated_text: translated })); } catch { /* ws closed */ }
              return;
            } catch { /* fall through to send original */ }
          }
        }

        try { ws.send(JSON.stringify(event)); } catch { /* ws closed */ }
      });
      logger.info('agent-ws', 'connected', { phone });
    },

    onMessage: async (evt, ws) => {
      let payload: { type: string; message: string };
      try {
        payload = JSON.parse(evt.data as string);
      } catch {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
        return;
      }
      if (payload.type === 'set_lang') {
        const newLang = (payload as unknown as { lang: string }).lang === 'en' ? 'en' : 'zh';
        setAgentLang(phone, newLang);
        logger.info('agent-ws', 'set_lang', { phone, newLang, langs: getLangs(phone) });
        return;
      }
      if (payload.type !== 'agent_message') return;

      const message = payload.message;
      logger.info('agent-ws', 'message', { phone, preview: message.slice(0, 30) });

      // ── 合规拦截：坐席发言检查 ──────────────────────────────────────
      const agentCompliance = checkCompliance(message);
      if (agentCompliance.hasBlock) {
        const blockedKeywords = agentCompliance.matches.filter(m => m.category === 'banned').map(m => m.keyword);
        logger.warn('agent-ws', 'compliance_blocked', { phone, keywords: blockedKeywords });
        ws.send(JSON.stringify({
          type: 'compliance_block',
          keywords: blockedKeywords,
          message: t('compliance_block', langParam, blockedKeywords.join(t('list_separator', langParam))),
        }));
        // 直接发 compliance_alert 给坐席前端（供合规监控卡片使用）
        ws.send(JSON.stringify({
          type: 'compliance_alert',
          data: { source: 'agent', keywords: blockedKeywords, text: message.slice(0, 100) },
        }));
        return; // 不转发给客户
      }
      if (agentCompliance.hasWarning) {
        const warningKeywords = agentCompliance.matches.filter(m => m.category === 'warning').map(m => m.keyword);
        logger.info('agent-ws', 'compliance_warning', { phone, keywords: warningKeywords });
        ws.send(JSON.stringify({
          type: 'compliance_warning',
          keywords: warningKeywords,
          message: t('compliance_warning', langParam, warningKeywords.join(t('list_separator', langParam))),
        }));
        // 直接发 compliance_alert 给坐席前端（供合规监控卡片使用）
        ws.send(JSON.stringify({
          type: 'compliance_alert',
          data: { source: 'agent', keywords: warningKeywords, text: message.slice(0, 100) },
        }));
        // 告警不阻止发送，继续处理
      }

      // Detect "transfer to bot" command — do not forward to customer
      const TRANSFER_TO_BOT_RE = /转机器人|transfer\s*to\s*bot/i;
      if (TRANSFER_TO_BOT_RE.test(message.trim())) {
        sessionBus.publish(phone, { source: 'agent', type: 'transfer_to_bot', msg_id: crypto.randomUUID() });
        logger.info('agent-ws', 'transfer_to_bot', { phone });
        return;
      }

      // Resolve active session for this phone
      let sessionId = sessionBus.getSession(phone);
      if (!sessionId) {
        sessionId = crypto.randomUUID();
        await db.insert(sessions).values({ id: sessionId });
        sessionBus.setSession(phone, sessionId);
        logger.info('agent-ws', 'session_created', { phone, session: sessionId });
      }

      // Forward agent message to customer side via session bus
      sessionBus.publish(phone, { source: 'agent', type: 'agent_message', text: message, msg_id: crypto.randomUUID() });
      logger.info('agent-ws', 'agent_message_sent', { phone, preview: message.slice(0, 30) });
    },

    onClose: () => {
      unsubscribe?.();
      logger.info('agent-ws', 'closed', { phone });
    },
  };
}));

export default agentWs;
