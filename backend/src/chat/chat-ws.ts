/**
 * chat-ws.ts — Persistent WebSocket route for online text chat (/ws/chat)
 *
 * Connection params (query string):
 *   ?phone=13800000001&sessionId=<uuid>&lang=zh
 *
 * Client messages:
 *   { type: 'chat_message', message: '...' }
 *
 * Server events:
 *   { source: 'user',  type: 'text_delta',           delta: '...' }
 *   { source: 'user',  type: 'skill_diagram_update',  skill_name, mermaid }
 *   { source: 'user',  type: 'response',              text, card, skill_diagram }
 *   { source: 'agent', type: 'agent_message',         text }    ← forwarded from agent
 *   { source: 'agent', type: 'text_delta',            delta }   ← forwarded from agent
 *   { source: 'agent', type: 'skill_diagram_update',  ... }     ← forwarded from agent
 *   { source: 'agent', type: 'response',              ... }     ← forwarded from agent
 *   { type: 'error',   message: '...' }
 */
import { Hono } from 'hono';
import { asc, eq } from 'drizzle-orm';
import { type CoreMessage } from 'ai';
import { db } from '../db';
import { messages, sessions, subscribers, plans } from '../db/schema';
import { runAgent, getMcpToolsForRuntime } from '../engine/runner';
import { routeSkill, shouldUseRuntime } from '../engine/skill-router';
import { runSkillTurn } from '../engine/skill-runtime';
import { createInstance, findActiveInstance } from '../engine/skill-instance-store';
import { getSkillMermaid } from '../engine/skills';
import { upgradeWebSocket } from './voice';
import { sessionBus } from '../services/session-bus';
import { logger } from '../services/logger';
import { setCustomerLang, getLangs } from '../services/lang-session';
import { translateText, translateMermaid } from '../services/translate-lang';
import { t } from '../services/i18n';
import { checkCompliance, maskPII, sanitizeText } from '../services/keyword-filter';
import { detectHallucination } from '../services/hallucination-detector';
import { runProgressTracking } from '../services/voice-common';
import { normalizeQuery } from '../services/query-normalizer';
import { buildReplyHints } from '../services/reply-copilot';

const chatWs = new Hono();

chatWs.get('/ws/chat', upgradeWebSocket((c) => {
  const phone     = c.req.query('phone')     ?? '13800000001';
  const sessionId = c.req.query('sessionId') ?? crypto.randomUUID();
  const langParam = (c.req.query('lang') === 'en' ? 'en' : 'zh') as 'zh' | 'en';

  let unsubscribe: (() => void) | null = null;
  let botEnabled = true;
  let cachedSubscriberName: string | undefined;
  let cachedPlanName: string | undefined;
  let cachedGender: string | undefined;
  let lastActiveSkill: string | null = null;
  // ── 会话级指标 ────────────────────────────────────────────────────────────
  const sessionStartTs = Date.now();
  let messageCount = 0;
  let toolCallCount = 0;
  let toolSuccessCount = 0;
  let transferTriggered = false;
  let lastEmotionLabel: string | null = null;

  return {
    onOpen: async (_, ws) => {
      // Ensure session exists in DB
      const existing = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
      if (existing.length === 0) {
        await db.insert(sessions).values({ id: sessionId });
        sessionBus.clearHistory(phone);
        sessionBus.publish(phone, { source: 'system', type: 'new_session', channel: 'chat', msg_id: crypto.randomUUID() });
      }

      // Register language + active session
      setCustomerLang(phone, langParam);
      sessionBus.setSession(phone, sessionId);

      // Subscribe to agent-side events → translate if needed → forward to customer WS
      unsubscribe = sessionBus.subscribe(phone, async (event) => {
        if (event.source !== 'agent') return;

        if (event.type === 'transfer_to_bot') {
          botEnabled = true;
          logger.info('chat-ws', 'bot_enabled', { phone, session: sessionId });
          try { ws.send(JSON.stringify({ type: 'transfer_to_bot' })); } catch { /* ws closed */ }
          return;
        }

        if (event.type === 'agent_message') {
          const { agent: agentLang, customer: customerLang } = getLangs(phone);
          if (agentLang !== customerLang) {
            try {
              const translated = await translateText(event.text, customerLang);
              try { ws.send(JSON.stringify({ ...event, translated_text: translated })); } catch { /* ws closed */ }
              return;
            } catch { /* fall through to send original */ }
          }
        }

        try { ws.send(JSON.stringify(event)); } catch { /* ws closed */ }
      });

      logger.info('chat-ws', 'connected', { phone, session: sessionId });

      // 只在首次创建 session 且 phone 非空时发送 greeting（避免重连/React re-render 重复推送）
      if (!phone || existing.length > 0) return;

      // 查询用户身份，推送个性化问候
      try {
        const subRows = await db
          .select({ name: subscribers.name, gender: subscribers.gender, planId: subscribers.plan_id })
          .from(subscribers)
          .where(eq(subscribers.phone, phone))
          .limit(1);
        let greetingText: string;
        if (subRows.length) {
          const planRows = await db
            .select({ name: plans.name })
            .from(plans)
            .where(eq(plans.plan_id, subRows[0].planId))
            .limit(1);
          cachedSubscriberName = subRows[0].name;
          cachedPlanName = planRows[0]?.name ?? '';
          cachedGender = subRows[0].gender;
          const name = cachedSubscriberName;
          const planName = cachedPlanName;
          const gender = cachedGender;
          greetingText = t('greeting_with_subscriber', langParam, name, planName, gender);
        } else {
          greetingText = t('greeting_generic', langParam);
        }

        // 持久化问候到 DB
        await db.insert(messages).values({ sessionId, role: 'assistant', content: greetingText });

        // 流式推送
        const CHUNK_SIZE = 3;
        const CHUNK_DELAY_MS = 20;
        for (let i = 0; i < greetingText.length; i += CHUNK_SIZE) {
          const delta = greetingText.slice(i, i + CHUNK_SIZE);
          try { ws.send(JSON.stringify({ source: 'user', type: 'text_delta', delta, msg_id: crypto.randomUUID() })); } catch { break; }
          if (i + CHUNK_SIZE < greetingText.length) await new Promise(r => setTimeout(r, CHUNK_DELAY_MS));
        }
        ws.send(JSON.stringify({ source: 'user', type: 'response', text: greetingText, card: null, skill_diagram: null, msg_id: crypto.randomUUID() }));
        sessionBus.publish(phone, { source: 'user', type: 'response', text: greetingText, card: null, skill_diagram: null, msg_id: crypto.randomUUID() });
        logger.info('chat-ws', 'greeting_sent', { phone, session: sessionId });
      } catch (err) {
        logger.warn('chat-ws', 'greeting_error', { phone, session: sessionId, error: String(err) });
      }
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
        setCustomerLang(phone, newLang);
        logger.info('chat-ws', 'set_lang', { phone, newLang, langs: getLangs(phone) });
        return;
      }
      if (payload.type !== 'chat_message') return;

      const message = payload.message;
      logger.info('chat-ws', 'message', { session: sessionId, preview: message.slice(0, 30) });

      // Query normalization
      const normalizedContext = await normalizeQuery(message, {
        currentDate: new Date(),
        phone,
        lang: langParam,
      });

      if (!botEnabled) {
        // Bot is disabled (human agent mode) — notify agent; re-send transfer_to_human to fix race conditions
        sessionBus.publish(phone, { source: 'user', type: 'user_message', text: message, msg_id: crypto.randomUUID() });
        // Async: generate reply hints for the human agent
        buildReplyHints({ message, phone, normalizedQuery: normalizedContext?.rewritten_query, intentHints: normalizedContext?.intent_hints })
          .then(hints => {
            if (hints) {
              sessionBus.publish(phone, {
                source: 'system', type: 'reply_hints',
                data: hints as unknown as Record<string, unknown>,
                phone,
                msg_id: crypto.randomUUID(),
              });
            }
          })
          .catch(err => logger.warn('chat-ws', 'reply_hints_error', { phone, error: String(err) }));
        try { ws.send(JSON.stringify({ type: 'transfer_to_human' })); } catch { /* ws closed */ }
        return;
      }

      // Notify agent that user sent a message
      sessionBus.publish(phone, { source: 'user', type: 'user_message', text: message, msg_id: crypto.randomUUID() });

      // Load history（支持 tool role 的结构化消息）
      const rows = await db
        .select()
        .from(messages)
        .where(eq(messages.sessionId, sessionId))
        .orderBy(asc(messages.createdAt));
      const history: CoreMessage[] = rows.map(r => {
        // tool/assistant 消息的 content 可能是 JSON（结构化 tool calls/results）
        if (r.role === 'tool' || (r.role === 'assistant' && r.content.startsWith('['))) {
          try {
            let parsed = JSON.parse(r.content);
            // 截断 get_skill_instructions 的大段结果，减少 token 占用
            if (r.role === 'tool' && Array.isArray(parsed)) {
              parsed = parsed.map((part: any) => {
                if (part.type === 'tool-result' && part.toolName === 'get_skill_instructions' && typeof part.result === 'string' && part.result.length > 200) {
                  return { ...part, result: '[技能操作指南已加载，详见系统上下文]' };
                }
                return part;
              });
            }
            return { role: r.role as CoreMessage['role'], content: parsed };
          } catch { /* fallback to string */ }
        }
        return { role: r.role as CoreMessage['role'], content: r.content };
      });

      // ── Workflow Runtime routing ──────────────────────────────────────
      const { agent: agentLang, customer: customerLang } = getLangs(phone);
      const route = routeSkill(sessionId);
      if (route.mode === 'runtime' && route.spec) {
        try {
          const mcpTools = await getMcpToolsForRuntime();
          const turnResult = await runSkillTurn(sessionId, message, route.spec, mcpTools, {
            phone,
            subscriberName: cachedSubscriberName,
            lang: agentLang as 'zh' | 'en',
            history: history.map(m => ({
              role: m.role,
              content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
            })),
          });

          const msg_id = crypto.randomUUID();

          // Persist messages
          const rtMsgRows: Array<{ sessionId: string; role: string; content: string }> = [
            { sessionId, role: 'user', content: message },
            { sessionId, role: 'assistant', content: turnResult.text },
          ];
          await db.insert(messages).values(rtMsgRows);

          // Push diagram with active step
          const rawMermaid = getSkillMermaid(route.spec.skillId);
          if (rawMermaid) {
            const mermaid = await translateMermaid(rawMermaid, langParam);
            const diagramEv = {
              source: 'user' as const, type: 'skill_diagram_update' as const,
              skill_name: route.spec.skillId, mermaid,
              active_step_id: turnResult.currentStepId,
              msg_id,
            };
            try { ws.send(JSON.stringify(diagramEv)); } catch { /* ws closed */ }
            sessionBus.publish(phone, diagramEv);
          }

          // Stream text response
          const CHUNK_SIZE_RT = 3;
          const CHUNK_DELAY_RT = 20;
          for (let i = 0; i < turnResult.text.length; i += CHUNK_SIZE_RT) {
            const delta = turnResult.text.slice(i, i + CHUNK_SIZE_RT);
            const ev = { source: 'user' as const, type: 'text_delta' as const, delta, msg_id };
            try { ws.send(JSON.stringify(ev)); } catch { break; }
            sessionBus.publish(phone, ev);
            if (i + CHUNK_SIZE_RT < turnResult.text.length) {
              await new Promise(r => setTimeout(r, CHUNK_DELAY_RT));
            }
          }

          // Final response event
          ws.send(JSON.stringify({
            source: 'user', type: 'response',
            text: turnResult.text,
            card: null,
            skill_diagram: rawMermaid ? { skill_name: route.spec.skillId, mermaid: rawMermaid } : null,
            current_step_id: turnResult.currentStepId,
            pending_confirm: turnResult.pendingConfirm,
            msg_id,
          }));
          sessionBus.publish(phone, {
            source: 'user', type: 'response',
            text: turnResult.text,
            card: null,
            skill_diagram: null,
            msg_id,
          });

          // Handle transfer
          if (turnResult.transferRequested) {
            botEnabled = false;
            try { ws.send(JSON.stringify({ type: 'transfer_to_human', msg_id })); } catch { /* ws closed */ }
            sessionBus.publish(phone, { source: 'user', type: 'transfer_data', msg_id });
            logger.info('chat-ws', 'bot_disabled', { phone, session: sessionId });
          }

          // Track metrics
          messageCount += 2;
          if (turnResult.toolRecords.length > 0) {
            toolCallCount += turnResult.toolRecords.length;
            toolSuccessCount += turnResult.toolRecords.filter(r => r.success).length;
          }

          logger.info('chat-ws', 'runtime_turn_complete', {
            session: sessionId, skill: route.spec.skillId,
            step: turnResult.currentStepId, finished: turnResult.finished,
            tools: turnResult.toolRecords.map(r => r.tool).join(','),
          });

          return; // Don't fall through to legacy runAgent
        } catch (err) {
          logger.error('chat-ws', 'runtime_error', { session: sessionId, error: String(err) });
          // Fall through to legacy runAgent on runtime error
        }
      }
      // ── End Workflow Runtime routing ──────────────────────────────────

      // Run agent (AI responds in agentLang so agent sees their own language)
      logger.info('chat-ws', 'run_agent_langs', { phone, agentLang, customerLang, willTranslate: agentLang !== customerLang });
      const t0 = Date.now();
      logger.info('chat-ws', 'agent_start', { session: sessionId });
      let result;
      try {
        result = await runAgent(
          message,
          history,
          phone,
          agentLang,
          (skillName, rawMermaid) => {
            translateMermaid(rawMermaid, langParam).then(mermaid => {
              const ev = { source: 'user' as const, type: 'skill_diagram_update' as const, skill_name: skillName, mermaid, msg_id: crypto.randomUUID() };
              try { ws.send(JSON.stringify(ev)); } catch { /* ws closed */ }
              sessionBus.publish(phone, ev);
            }).catch(() => {
              const ev = { source: 'user' as const, type: 'skill_diagram_update' as const, skill_name: skillName, mermaid: rawMermaid, msg_id: crypto.randomUUID() };
              try { ws.send(JSON.stringify(ev)); } catch { /* ws closed */ }
              sessionBus.publish(phone, ev);
            });
          },
          (delta: string) => {
            // 推送中间步骤文本（如"身份验证通过，正在查询欠费..."）
            const ev = { source: 'user' as const, type: 'step_text' as const, text: delta, msg_id: crypto.randomUUID() };
            try { ws.send(JSON.stringify(ev)); } catch { /* ws closed */ }
            sessionBus.publish(phone, { ...ev, source: 'user' });
          },
          cachedSubscriberName,
          cachedPlanName,
          cachedGender,
          undefined,
          { normalizedContext },
        );
      } catch (err) {
        logger.error('chat-ws', 'agent_error', { session: sessionId, error: String(err) });
        ws.send(JSON.stringify({ type: 'error', message: String(err) }));
        return;
      }

      // 统计指标
      messageCount += 2; // user + assistant
      if (result.card) toolCallCount++;
      if (result.transferData) { transferTriggered = true; }
      // 从 steps 提取工具调用统计
      for (const step of (result as any).steps ?? []) {
        for (const tc of step.toolCalls ?? []) {
          toolCallCount++;
          const tr = (step.toolResults ?? []).find((r: any) => r.toolCallId === tc.toolCallId);
          if (tr && !String(tr.result).includes('"error"')) toolSuccessCount++;
        }
      }

      logger.info('chat-ws', 'agent_done', {
        session: sessionId, ms: Date.now() - t0,
        text_len: result.text?.length ?? 0, card: result.card?.type ?? null,
      });

      // ── 合规拦截：bot 回复发送前检查 ──────────────────────────────────
      const compliance = checkCompliance(result.text);
      if (compliance.hasBlock) {
        result.text = sanitizeText(result.text, compliance.matches);
        logger.warn('chat-ws', 'compliance_blocked', {
          session: sessionId, phone,
          keywords: compliance.matches.filter(m => m.category === 'banned').map(m => m.keyword),
        });
        sessionBus.publish(phone, {
          source: 'voice', type: 'compliance_alert',
          data: { source: 'bot', keywords: compliance.matches.filter(m => m.category === 'banned').map(m => m.keyword), text: result.text.slice(0, 100) },
          msg_id: crypto.randomUUID(),
        });
      }
      if (compliance.hasWarning) {
        logger.info('chat-ws', 'compliance_warning', {
          session: sessionId, phone,
          keywords: compliance.matches.filter(m => m.category === 'warning').map(m => m.keyword),
        });
      }
      if (compliance.hasPII) {
        result.text = maskPII(result.text, compliance.piiMatches);
      }

      // ── 幻觉检测（异步，不阻塞回复）──────────────────────────
      const toolResultsForCheck: Array<{ tool: string; result: string }> = [];
      for (const step of (result as any).steps ?? []) {
        for (const tr of step.toolResults ?? []) {
          toolResultsForCheck.push({
            tool: tr.toolName ?? 'unknown',
            result: typeof tr.result === 'string' ? tr.result : JSON.stringify(tr.result),
          });
        }
      }
      if (toolResultsForCheck.length > 0) {
        detectHallucination(result.text, toolResultsForCheck)
          .then(hr => {
            if (hr.has_hallucination) {
              logger.warn('chat-ws', 'hallucination_detected', { session: sessionId, evidence: hr.evidence });
              sessionBus.publish(phone, {
                source: 'voice', type: 'compliance_alert',
                data: { source: 'hallucination', keywords: [hr.evidence], text: result.text.slice(0, 100) },
                msg_id: crypto.randomUUID(),
              });
            }
          })
          .catch(() => {});
      }

      // Persist messages（含 tool calls/results，保证多轮上下文完整）
      const msgRows: Array<{ sessionId: string; role: string; content: string }> = [
        { sessionId, role: 'user', content: message },
      ];
      if (result.responseMessages) {
        for (const msg of result.responseMessages) {
          const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
          msgRows.push({ sessionId, role: msg.role, content });
        }
      } else {
        // fallback: 没有 responseMessages 时保持旧行为
        msgRows.push({ sessionId, role: 'assistant', content: result.text });
      }
      logger.info('chat-ws', 'persist_messages', { session: sessionId, count: msgRows.length, roles: msgRows.map(r => r.role) });
      await db.insert(messages).values(msgRows);

      // Stream text
      const CHUNK_SIZE = 3;
      const CHUNK_DELAY_MS = 20;
      logger.info('chat-ws', 'stream_start', { session: sessionId, text_len: result.text.length });
      for (let i = 0; i < result.text.length; i += CHUNK_SIZE) {
        const delta = result.text.slice(i, i + CHUNK_SIZE);
        const ev = { source: 'user' as const, type: 'text_delta' as const, delta, msg_id: crypto.randomUUID() };
        try { ws.send(JSON.stringify(ev)); } catch {
          logger.warn('chat-ws', 'stream_ws_closed', { session: sessionId, sent_chars: i });
          break;
        }
        sessionBus.publish(phone, ev);
        if (i + CHUNK_SIZE < result.text.length) {
          await new Promise(r => setTimeout(r, CHUNK_DELAY_MS));
        }
      }
      logger.info('chat-ws', 'stream_done', { session: sessionId });

      // Translate AI response for customer if langs differ
      let translatedResponseText: string | undefined;
      if (agentLang !== customerLang) {
        try {
          translatedResponseText = await translateText(result.text, customerLang);
        } catch { /* no translation on failure, customer sees original */ }
      }

      // Translate skill_diagram mermaid if needed
      let finalSkillDiagram = result.skill_diagram ?? null;
      if (finalSkillDiagram && langParam !== 'zh') {
        try {
          finalSkillDiagram = { ...finalSkillDiagram, mermaid: await translateMermaid(finalSkillDiagram.mermaid, langParam) };
        } catch { /* keep original */ }
      }

      // Final response (no handoff_card on customer side)
      const responseEv = {
        source: 'user' as const,
        type: 'response' as const,
        text: result.text,
        card: result.card ?? null,
        skill_diagram: finalSkillDiagram,
        msg_id: crypto.randomUUID(),
      };
      // Customer gets translated_text if available; agent (via bus) sees original agentLang text
      ws.send(JSON.stringify(translatedResponseText ? { ...responseEv, translated_text: translatedResponseText } : responseEv));
      sessionBus.publish(phone, responseEv);

      // ── 异步流程进度追踪（与 voice/outbound 通道对齐） ──
      const diagramSkill = result.skill_diagram?.skill_name ?? lastActiveSkill;
      if (diagramSkill) {
        lastActiveSkill = diagramSkill;
        const recentTurns = rows.slice(-4).map(r => ({ role: r.role === 'user' ? 'user' : 'assistant', text: r.content }));
        recentTurns.push({ role: 'user', text: message });
        recentTurns.push({ role: 'assistant', text: result.text });
        runProgressTracking(ws, phone, diagramSkill, recentTurns, langParam, sessionId, 'chat');
      }

      // ── Check if matched skill should use runtime for next turn ──
      if (lastActiveSkill) {
        const rt = shouldUseRuntime(lastActiveSkill);
        if (rt.use && rt.spec) {
          const existing = findActiveInstance(sessionId);
          if (!existing) {
            createInstance(sessionId, rt.spec.skillId, rt.spec.version, rt.spec.startStepId);
            logger.info('chat-ws', 'runtime_instance_created_after_legacy', {
              session: sessionId, skill: lastActiveSkill,
            });
          }
        }
      }

      // Signal agent side to run handoff analysis (never sent to customer WS)
      if (result.transferData) {
        const { turns, toolRecords, args, userMessage: um } = result.transferData;
        sessionBus.publish(phone, { source: 'user', type: 'transfer_data', turns, toolRecords, args, userMessage: um, msg_id: crypto.randomUUID() });
        botEnabled = false;
        logger.info('chat-ws', 'bot_disabled', { phone, session: sessionId });
        try { ws.send(JSON.stringify({ type: 'transfer_to_human' })); } catch { /* ws closed */ }
      }

      logger.info('chat-ws', 'response_sent', { session: sessionId });
    },

    onClose: () => {
      unsubscribe?.();
      logger.info('chat-ws', 'session_summary', {
        phone, session: sessionId, channel: 'chat',
        message_count: messageCount,
        tool_call_count: toolCallCount,
        tool_success_rate: toolCallCount > 0 ? Math.round((toolSuccessCount / toolCallCount) * 100) / 100 : null,
        transfer_triggered: transferTriggered,
        auto_resolved: !transferTriggered,
        duration_ms: Date.now() - sessionStartTs,
      });
      logger.info('chat-ws', 'closed', { phone, session: sessionId });
    },
  };
}));

export default chatWs;
