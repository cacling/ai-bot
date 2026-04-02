/**
 * conversations.ts — Conversation CRUD routes
 */
import { Hono } from 'hono';
import { db, ixConversations, eq } from '../db';

const router = new Hono();

/** GET / — List conversations (with optional filters) */
router.get('/', async (c) => {
  const partyId = c.req.query('customer_party_id');
  const status = c.req.query('status');
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 200);

  let query = db.select().from(ixConversations).$dynamic();

  if (partyId) query = query.where(eq(ixConversations.customer_party_id, partyId));
  if (status) query = query.where(eq(ixConversations.status, status));

  const rows = await query.limit(limit).all();
  return c.json({ items: rows });
});

/** GET /:id — Get a single conversation */
router.get('/:id', async (c) => {
  const row = await db.query.ixConversations.findFirst({
    where: eq(ixConversations.conversation_id, c.req.param('id')),
  });
  if (!row) return c.json({ error: 'Conversation not found' }, 404);
  return c.json(row);
});

/** POST / — Create a conversation */
router.post('/', async (c) => {
  const body = await c.req.json<{
    conversation_id?: string;
    customer_party_id?: string;
    channel: string;
    domain_scope?: string;
    subject?: string;
    metadata_json?: string;
  }>();

  if (!body.channel) return c.json({ error: 'channel is required' }, 400);

  const id = body.conversation_id ?? crypto.randomUUID();
  await db.insert(ixConversations).values({
    conversation_id: id,
    customer_party_id: body.customer_party_id ?? null,
    channel: body.channel,
    domain_scope: body.domain_scope ?? 'private_interaction',
    status: 'active',
    subject: body.subject ?? null,
    metadata_json: body.metadata_json ?? null,
  });

  const row = await db.query.ixConversations.findFirst({
    where: eq(ixConversations.conversation_id, id),
  });
  return c.json(row, 201);
});

/** PUT /:id/close — Close a conversation */
router.put('/:id/close', async (c) => {
  const id = c.req.param('id');
  await db.update(ixConversations)
    .set({ status: 'closed', updated_at: new Date() })
    .where(eq(ixConversations.conversation_id, id));

  const row = await db.query.ixConversations.findFirst({
    where: eq(ixConversations.conversation_id, id),
  });
  if (!row) return c.json({ error: 'Conversation not found' }, 404);
  return c.json(row);
});

export default router;
