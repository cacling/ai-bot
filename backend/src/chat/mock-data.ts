/**
 * mock-data.ts — REST endpoints for UI reference data
 *
 * GET /api/test-personas                       → all personas
 * GET /api/test-personas?category=inbound      → filtered by category
 * GET /api/outbound-tasks                      → all outbound tasks
 * GET /api/outbound-tasks?type=collection      → filtered by type
 */
import { Hono } from 'hono';
import { eq, asc } from 'drizzle-orm';
import { db } from '../db';
import { testPersonas, outboundTasks } from '../db/schema';

const mockDataRoutes = new Hono();

mockDataRoutes.get('/test-personas', async (c) => {
  const category = c.req.query('category');
  const lang = (c.req.query('lang') ?? 'zh') as 'zh' | 'en';
  const rows = category
    ? db.select().from(testPersonas).where(eq(testPersonas.category, category)).orderBy(asc(testPersonas.sort_order)).all()
    : db.select().from(testPersonas).orderBy(asc(testPersonas.sort_order)).all();
  return c.json(rows.map(r => ({
    id: r.id,
    label: lang === 'en' ? r.label_en : r.label_zh,
    category: r.category,
    tag: lang === 'en' ? r.tag_en : r.tag_zh,
    tagColor: r.tag_color,
    context: JSON.parse(r.context) as Record<string, unknown>,
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
