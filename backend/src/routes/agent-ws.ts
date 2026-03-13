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
 */
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { sessions } from '../db/schema';
import { upgradeWebSocket } from './voice';
import { sessionBus } from '../session-bus';
import { logger } from '../logger';
import { analyzeEmotion } from '../skills/emotion-analyzer';
import { analyzeHandoff, type TurnRecord, type ToolRecord, type HandoffAnalysis } from '../skills/handoff-analyzer';
import { setAgentLang, getLangs } from '../lang-session';
import { translateText } from '../skills/translate-lang';

const agentWs = new Hono();

function buildHandoffFallback(
  userMessage: string,
  toolRecords: ToolRecord[],
  args: { current_intent?: string; recommended_action?: string },
): HandoffAnalysis {
  return {
    customer_intent: args.current_intent ?? '转人工客服',
    main_issue: userMessage.slice(0, 50),
    business_object: [],
    confirmed_information: [],
    actions_taken: toolRecords
      .filter(r => r.success && r.tool !== 'transfer_to_human')
      .map(r => `已${r.tool === 'diagnose_network' ? '网络诊断' : r.tool === 'query_bill' ? '查询账单' : r.tool}（成功）`),
    current_status: '处理中',
    handoff_reason: args.current_intent ?? '用户要求人工服务',
    next_action: args.recommended_action ?? '请主动问候用户，了解具体需求',
    priority: '中',
    risk_flags: [],
    session_summary: `用户咨询"${userMessage.slice(0, 30)}"，${toolRecords.length > 0 ? '机器人已执行相关查询，' : ''}用户要求转人工客服处理。`,
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
  const fallback = buildHandoffFallback(userMessage, toolRecords, args);
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
            const { agent: agentLang } = getLangs(phone);
            const willTranslate = agentLang !== 'zh';
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
