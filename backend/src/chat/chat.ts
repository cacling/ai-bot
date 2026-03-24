import { asc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { type CoreMessage } from 'ai';
import { db } from '../db';
import { messages, sessions } from '../db/schema';
import { runAgent, getMcpToolsForRuntime, type AgentResult } from '../engine/runner';
import { routeSkill, shouldUseRuntime } from '../engine/skill-router';
import { runSkillTurn } from '../engine/skill-runtime';
import { createInstance, findActiveInstance } from '../engine/skill-instance-store';
import { logger } from '../services/logger';

const chat = new Hono();

// POST /api/chat
chat.post('/chat', async (c) => {
  const body = await c.req.json<{ message?: string; session_id?: string; user_phone?: string; lang?: string }>();
  const userMessage = body.message?.trim();
  const sessionId = body.session_id?.trim();
  const userPhone = body.user_phone?.trim() || '13800000001';
  const lang = (body.lang === 'en' ? 'en' : 'zh') as 'zh' | 'en';

  if (!userMessage) {
    return c.json({ error: 'message 不能为空' }, 400);
  }
  if (!sessionId) {
    return c.json({ error: 'session_id 不能为空' }, 400);
  }

  const t_req = Date.now();
  logger.info('chat', 'request', {
    session: sessionId,
    preview: userMessage.slice(0, 30),
  });

  // Ensure session exists
  const existing = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  const t_session = Date.now();

  if (existing.length === 0) {
    await db.insert(sessions).values({ id: sessionId });
    logger.info('chat', 'session_created', { session: sessionId });
  }

  // Load history as CoreMessage[]
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(asc(messages.createdAt));
  const t_history = Date.now();

  const history: CoreMessage[] = rows.map((r) => ({
    role: r.role as 'user' | 'assistant',
    content: r.content,
  }));

  logger.info('chat', 'agent_start', {
    session: sessionId,
    history: history.length,
    db_session_ms: t_session - t_req,
    db_history_ms: t_history - t_session,
  });

  // ── Workflow Runtime routing ──────────────────────────────────────
  const route = routeSkill(sessionId);
  if (route.mode === 'runtime' && route.spec) {
    try {
      const mcpTools = await getMcpToolsForRuntime();
      const turnResult = await runSkillTurn(sessionId, userMessage, route.spec, mcpTools, {
        phone: userPhone,
        lang: 'zh',
        history: history.map(m => ({
          role: m.role,
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        })),
      });

      // Persist messages
      const msgRows = [
        { sessionId, role: 'user', content: userMessage },
        { sessionId, role: 'assistant', content: turnResult.text },
      ];
      await db.insert(messages).values(msgRows);

      return c.json({
        text: turnResult.text,
        card: null,
        skill_diagram: null,
        current_step_id: turnResult.currentStepId,
        pending_confirm: turnResult.pendingConfirm,
      });
    } catch (err) {
      logger.error('chat', 'runtime_error', { session: sessionId, error: String(err) });
      // Fall through to legacy runAgent
    }
  }
  // ── End Workflow Runtime routing ──────────────────────────────────

  // Run agent
  let result: Awaited<ReturnType<typeof runAgent>>;
  const t_agent = Date.now();
  try {
    result = await runAgent(userMessage, history, userPhone, lang);
  } catch (err) {
    logger.error('chat', 'agent_error', { session: sessionId, error: String(err) });
    return c.json({ error: `Agent 执行失败: ${String(err)}` }, 500);
  }
  const t_agent_done = Date.now();

  // Persist user + assistant messages
  await db.insert(messages).values([
    { sessionId, role: 'user', content: userMessage },
    { sessionId, role: 'assistant', content: result.text },
  ]);
  const t_write = Date.now();

  logger.info('chat', 'request_done', {
    session: sessionId,
    db_session_ms: t_session - t_req,
    db_history_ms: t_history - t_session,
    agent_ms: t_agent_done - t_agent,
    db_write_ms: t_write - t_agent_done,
    total_ms: t_write - t_req,
    card: result.card?.type ?? null,
  });

  // ── Check if matched skill should use runtime for next turn ──
  const lastActiveSkill = result.skill_diagram?.skill_name ?? null;
  if (lastActiveSkill) {
    const rt = shouldUseRuntime(lastActiveSkill);
    if (rt.use && rt.spec) {
      const existingInstance = findActiveInstance(sessionId);
      if (!existingInstance) {
        createInstance(sessionId, rt.spec.skillId, rt.spec.version, rt.spec.startStepId);
        logger.info('chat', 'runtime_instance_created_after_legacy', {
          session: sessionId, skill: lastActiveSkill,
        });
      }
    }
  }

  return c.json({
    response: result.text,
    session_id: sessionId,
    card: result.card ?? null,
    skill_diagram: result.skill_diagram ?? null,
  });
});

// DELETE /api/sessions/:id
chat.delete('/sessions/:id', async (c) => {
  const sessionId = c.req.param('id');
  await db.delete(sessions).where(eq(sessions.id, sessionId));
  logger.info('chat', 'session_deleted', { session: sessionId });
  return c.json({ ok: true, session_id: sessionId });
});

export default chat;
