/**
 * mcp/execution-records.ts — Tool Runtime 执行记录查询
 *
 * GET /              — 列出执行记录（分页 + 筛选）
 * GET /stats         — 聚合统计（总量、成功率、平均延迟、适配器分布）
 */
import { Hono } from 'hono';
import { db } from '../db';
import { executionRecords } from '../db';
import { desc, sql, eq, and, gte, lte, like } from 'drizzle-orm';
import { logger } from '../logger';

const app = new Hono();

// GET / — 列出执行记录
app.get('/', async (c) => {
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 200);
  const offset = Number(c.req.query('offset') ?? 0);
  const toolName = c.req.query('tool_name');
  const channel = c.req.query('channel');
  const success = c.req.query('success');
  const startDate = c.req.query('start_date');
  const endDate = c.req.query('end_date');

  try {
    const conditions = [];
    if (toolName) conditions.push(like(executionRecords.tool_name, `%${toolName}%`));
    if (channel) conditions.push(eq(executionRecords.channel, channel));
    if (success === 'true') conditions.push(eq(executionRecords.success, true));
    if (success === 'false') conditions.push(eq(executionRecords.success, false));
    if (startDate) conditions.push(gte(executionRecords.created_at, startDate));
    if (endDate) conditions.push(lte(executionRecords.created_at, endDate));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = db.select().from(executionRecords)
      .where(where)
      .orderBy(desc(executionRecords.created_at))
      .limit(limit)
      .offset(offset)
      .all();

    const countResult = db.select({ count: sql<number>`count(*)` })
      .from(executionRecords)
      .where(where)
      .get();

    return c.json({ items: rows, total: countResult?.count ?? 0 });
  } catch (err) {
    logger.error('execution-records', 'list_error', { error: String(err) });
    return c.json({ items: [], total: 0 });
  }
});

// GET /stats — 聚合统计
app.get('/stats', async (c) => {
  try {
    const total = db.select({ count: sql<number>`count(*)` }).from(executionRecords).get();
    const successCount = db.select({ count: sql<number>`count(*)` }).from(executionRecords).where(eq(executionRecords.success, true)).get();
    const avgLatency = db.select({ avg: sql<number>`avg(latency_ms)` }).from(executionRecords).get();

    // Adapter distribution
    const adapterDist = db.select({
      adapter_type: executionRecords.adapter_type,
      count: sql<number>`count(*)`,
    }).from(executionRecords).groupBy(executionRecords.adapter_type).all();

    // Channel distribution
    const channelDist = db.select({
      channel: executionRecords.channel,
      count: sql<number>`count(*)`,
    }).from(executionRecords).groupBy(executionRecords.channel).all();

    // Top tools by call count
    const topTools = db.select({
      tool_name: executionRecords.tool_name,
      count: sql<number>`count(*)`,
      success_count: sql<number>`sum(case when success = 1 then 1 else 0 end)`,
      avg_latency: sql<number>`avg(latency_ms)`,
    }).from(executionRecords).groupBy(executionRecords.tool_name)
      .orderBy(sql`count(*) desc`).limit(10).all();

    const totalCount = total?.count ?? 0;
    const successTotal = successCount?.count ?? 0;

    return c.json({
      totalCalls: totalCount,
      successRate: totalCount > 0 ? Math.round((successTotal / totalCount) * 1000) / 10 : 0,
      avgLatencyMs: Math.round(avgLatency?.avg ?? 0),
      adapterDistribution: adapterDist,
      channelDistribution: channelDist,
      topTools,
    });
  } catch (err) {
    logger.error('execution-records', 'stats_error', { error: String(err) });
    return c.json({ totalCalls: 0, successRate: 0, avgLatencyMs: 0, adapterDistribution: [], channelDistribution: [], topTools: [] });
  }
});

export default app;
