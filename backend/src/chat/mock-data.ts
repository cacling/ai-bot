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
import { platformDb } from '../db';
import { outboundTasks } from '../db/schema';
import { logger } from '../services/logger';

const KM_BASE = process.env.KM_SERVICE_URL ?? `http://localhost:${process.env.KM_SERVICE_PORT ?? 18010}`;

const mockDataRoutes = new Hono();

mockDataRoutes.get('/test-personas', async (c) => {
  const category = c.req.query('category');
  const lang = (c.req.query('lang') ?? 'zh') as 'zh' | 'en';
  try {
    const res = await fetch(`${KM_BASE}/api/internal/test-personas`);
    if (!res.ok) return c.json([]);
    const data = await res.json() as { items: Array<Record<string, unknown>> };
    let rows = data.items ?? [];
    if (category) rows = rows.filter((r: any) => r.category === category);
    rows.sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    return c.json(rows.map((r: any) => ({
      id: r.id,
      label: lang === 'en' ? r.label_en : r.label_zh,
      category: r.category,
      tag: lang === 'en' ? r.tag_en : r.tag_zh,
      tagColor: r.tag_color,
      context: JSON.parse(r.context) as Record<string, unknown>,
    })));
  } catch (e) {
    logger.warn('mock-data', 'test_personas_fetch_error', { error: String(e) });
    return c.json([]);
  }
});

mockDataRoutes.get('/outbound-tasks', async (c) => {
  const typeFilter = c.req.query('type');
  const rows = typeFilter
    ? platformDb.select().from(outboundTasks).where(eq(outboundTasks.task_type, typeFilter)).all()
    : platformDb.select().from(outboundTasks).all();
  return c.json(rows.map(r => ({
    id: r.id,
    phone: r.phone,
    task_type: r.task_type,
    label: { zh: r.label_zh, en: r.label_en },
    data: JSON.parse(r.data) as Record<string, unknown>,
  })));
});

export default mockDataRoutes;
