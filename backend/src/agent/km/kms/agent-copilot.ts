/**
 * agent-copilot.ts — REST routes for Agent Copilot
 *
 * POST /ask      — agent asks knowledge base a question
 * POST /feedback — record agent feedback (extends reply-copilot feedback)
 */
import { Hono } from 'hono';
import { db } from '../../../db';
import { kmReplyFeedback } from '../../../db/schema';
import { askKnowledgeBase } from '../../../services/agent-copilot';
import { nanoid } from './helpers';
import { logger } from '../../../services/logger';

const app = new Hono();

app.post('/ask', async (c) => {
  const body = await c.req.json<{
    question: string;
    phone?: string;
    conversation_summary?: string;
  }>();
  if (!body.question) return c.json({ error: 'question is required' }, 400);

  const answer = await askKnowledgeBase({
    question: body.question,
    phone: body.phone ?? '',
    conversationContext: body.conversation_summary,
  });

  return c.json({ answer });
});

app.post('/feedback', async (c) => {
  const body = await c.req.json<{
    session_id?: string;
    phone?: string;
    message_id?: string;
    asset_version_id?: string;
    event_type: string;
    detail_json?: string;
    source?: string;
  }>();

  const validEvents = [
    'shown', 'use', 'copy', 'edit', 'dismiss',
    'adopt_direct', 'adopt_with_edit', 'helpful', 'not_helpful',
  ];
  if (!validEvents.includes(body.event_type)) {
    return c.json({ error: `event_type must be one of: ${validEvents.join(', ')}` }, 400);
  }

  const id = nanoid();
  const detail = body.detail_json
    ? JSON.parse(body.detail_json)
    : {};
  if (body.source) detail.source = body.source;

  await db.insert(kmReplyFeedback).values({
    id,
    session_id: body.session_id,
    phone: body.phone,
    message_id: body.message_id,
    asset_version_id: body.asset_version_id,
    event_type: body.event_type,
    detail_json: JSON.stringify(detail),
  });

  logger.info('agent-copilot', 'feedback_recorded', {
    id,
    event_type: body.event_type,
    source: body.source,
    asset_version_id: body.asset_version_id,
  });

  return c.json({ ok: true, id });
});

export default app;
