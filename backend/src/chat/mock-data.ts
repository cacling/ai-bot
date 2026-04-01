/**
 * mock-data.ts — REST endpoints for UI reference data
 *
 * GET /api/test-personas                       → all personas (proxied to outbound_service)
 * GET /api/test-personas?category=inbound      → filtered by category
 * GET /api/outbound-tasks                      → all outbound tasks (proxied to outbound_service)
 * GET /api/outbound-tasks?type=collection      → filtered by type
 */
import { Hono } from 'hono';
import { logger } from '../services/logger';

const OUTBOUND_BASE = `http://localhost:${process.env.OUTBOUND_SERVICE_PORT ?? 18021}/api/outbound`;

const mockDataRoutes = new Hono();

mockDataRoutes.get('/test-personas', async (c) => {
  const category = c.req.query('category');
  const lang = c.req.query('lang') ?? 'zh';
  try {
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (lang) params.set('lang', lang);
    const res = await fetch(`${OUTBOUND_BASE}/test-personas?${params}`);
    if (!res.ok) return c.json([]);
    return c.json(await res.json());
  } catch (e) {
    logger.warn('mock-data', 'test_personas_fetch_error', { error: String(e) });
    return c.json([]);
  }
});

mockDataRoutes.get('/outbound-tasks', async (c) => {
  const typeFilter = c.req.query('type');
  try {
    const params = new URLSearchParams();
    if (typeFilter) params.set('type', typeFilter);
    const res = await fetch(`${OUTBOUND_BASE}/tasks?${params}`);
    if (!res.ok) return c.json([]);
    const data = await res.json() as { tasks: Array<Record<string, unknown>> };
    // 转换为前端期望的格式
    return c.json((data.tasks ?? []).map((r: any) => ({
      id: r.id,
      phone: r.phone,
      task_type: r.task_type,
      label: { zh: r.label_zh, en: r.label_en },
      data: typeof r.data === 'string' ? JSON.parse(r.data) : r.data,
    })));
  } catch (e) {
    logger.warn('mock-data', 'outbound_tasks_fetch_error', { error: String(e) });
    return c.json([]);
  }
});

export default mockDataRoutes;
