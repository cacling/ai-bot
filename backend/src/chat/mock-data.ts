/**
 * mock-data.ts — REST endpoints for UI reference data
 *
 * GET /api/mock-users           → all users (inbound + outbound)
 * GET /api/mock-users?type=inbound  → inbound only
 * GET /api/outbound-tasks           → all outbound tasks
 * GET /api/outbound-tasks?type=collection → filtered by type
 */
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { mockUsers, outboundTasks } from '../db/schema';

const mockDataRoutes = new Hono();

mockDataRoutes.get('/mock-users', async (c) => {
  const typeFilter = c.req.query('type');
  const rows = typeFilter
    ? db.select().from(mockUsers).where(eq(mockUsers.type, typeFilter)).all()
    : db.select().from(mockUsers).all();
  return c.json(rows.map(r => ({
    id: r.id,
    phone: r.phone,
    name: r.name,
    plan: { zh: r.plan_zh, en: r.plan_en },
    status: r.status as 'active' | 'suspended',
    tag: { zh: r.tag_zh, en: r.tag_en },
    tagColor: r.tag_color,
    type: r.type as 'inbound' | 'outbound',
  })));
});

mockDataRoutes.get('/outbound-tasks', async (c) => {
  const typeFilter = c.req.query('type');
  const rows = typeFilter
    ? db.select().from(outboundTasks).where(eq(outboundTasks.task_type, typeFilter)).all()
    : db.select().from(outboundTasks).all();
  return c.json(rows.map(r => ({
    id: r.id,
    phone: r.phone,
    task_type: r.task_type,
    label: { zh: r.label_zh, en: r.label_en },
    data: JSON.parse(r.data) as Record<string, unknown>,
  })));
});

export default mockDataRoutes;
