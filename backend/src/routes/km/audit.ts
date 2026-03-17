/**
 * audit.ts — 审计日志（只读）
 */
import { Hono } from 'hono';
import { eq, desc, and, SQL } from 'drizzle-orm';
import { db } from '../../db';
import { kmAuditLogs } from '../../db/schema';

const app = new Hono();

// GET /
app.get('/', async (c) => {
  const { action, object_type, operator, risk_level, page = '1', size = '50' } = c.req.query();
  const conditions: SQL[] = [];
  if (action) conditions.push(eq(kmAuditLogs.action, action));
  if (object_type) conditions.push(eq(kmAuditLogs.object_type, object_type));
  if (operator) conditions.push(eq(kmAuditLogs.operator, operator));
  if (risk_level) conditions.push(eq(kmAuditLogs.risk_level, risk_level));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = Math.min(Number(size) || 50, 200);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;
  const rows = await db.select().from(kmAuditLogs).where(where)
    .orderBy(desc(kmAuditLogs.created_at)).limit(limit).offset(offset);
  const [{ count }] = await db.select({ count: db.$count(kmAuditLogs, where) }).from(kmAuditLogs);
  return c.json({ items: rows, total: count });
});

export default app;
