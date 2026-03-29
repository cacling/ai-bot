/**
 * reply-copilot.ts — REST routes for Reply Copilot
 *
 * POST /preview   — preview reply hints for a message
 * POST /feedback  — record agent feedback (use/copy/edit/dismiss)
 */
import { Hono } from 'hono';
import { db } from '../db';
import { kmReplyFeedback } from '../db';
import { buildReplyHints } from '../services/reply-copilot';
import { nanoid } from './helpers';
import { logger } from '../logger';

const app = new Hono();

app.post('/preview', async (c) => {
  const body = await c.req.json<{ message: string; phone?: string }>();
  if (!body.message) return c.json({ error: 'message is required' }, 400);
  const hints = await buildReplyHints({ message: body.message, phone: body.phone ?? '' });
  return c.json({ hints });
});

// POST /build — called by main backend via km-client proxy
app.post('/build', async (c) => {
  const body = await c.req.json<{ message: string; phone?: string; normalizedQuery?: string; intentHints?: string[] }>();
  if (!body.message) return c.json({ error: 'message is required' }, 400);
  const hints = await buildReplyHints({ message: body.message, phone: body.phone ?? '', normalizedQuery: body.normalizedQuery, intentHints: body.intentHints });
  return c.json(hints);
});

app.post('/feedback', async (c) => {
  const body = await c.req.json<{
    session_id?: string;
    phone?: string;
    message_id?: string;
    asset_version_id?: string;
    event_type: string;
    detail_json?: string;
  }>();
  const validEvents = ['shown', 'use', 'copy', 'edit', 'dismiss'];
  if (!validEvents.includes(body.event_type)) {
    return c.json({ error: `event_type must be one of: ${validEvents.join(', ')}` }, 400);
  }
  const id = nanoid();
  await db.insert(kmReplyFeedback).values({
    id,
    session_id: body.session_id,
    phone: body.phone,
    message_id: body.message_id,
    asset_version_id: body.asset_version_id,
    event_type: body.event_type,
    detail_json: body.detail_json,
  });
  logger.info('reply-copilot', 'feedback_recorded', { id, event_type: body.event_type, asset_version_id: body.asset_version_id });
  return c.json({ ok: true, id });
});

export default app;
