import { Hono } from 'hono';
import { getTemporalClient } from '../client.js';
import { WorkflowExecutionAlreadyStartedError } from '@temporalio/client';
import { TASK_QUEUES } from '../config.js';
import type { HotIssueMiningInput } from '../types.js';

const analyticsRoutes = new Hono();

// POST /hot-issue-mining/start — 手动触发热点挖掘
analyticsRoutes.post('/hot-issue-mining/start', async (c) => {
  const body = await c.req.json<Partial<HotIssueMiningInput>>();
  const now = new Date();
  const windowEnd = body.windowEnd ?? now.toISOString().slice(0, 10);
  const windowStart = body.windowStart ?? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const workflowId = `hot-issue-mining/${windowEnd}`;

  const client = await getTemporalClient();
  try {
    await client.workflow.start('hotIssueMiningWorkflow', {
      workflowId,
      taskQueue: TASK_QUEUES.analytics,
      args: [{
        windowStart,
        windowEnd,
        channels: body.channels ?? ['online', 'voice', 'outbound'],
        minFrequency: body.minFrequency ?? 3,
        sources: body.sources ?? ['work_orders', 'copilot_queries', 'negative_feedback', 'retrieval_miss'],
      }],
    });
    return c.json({ ok: true, workflowId });
  } catch (err) {
    if (err instanceof WorkflowExecutionAlreadyStartedError) {
      return c.json({ ok: true, workflowId, alreadyRunning: true });
    }
    throw err;
  }
});

// POST /qa-suggestion/:clusterId/accept — 接受 QA 建议
analyticsRoutes.post('/qa-suggestion/:clusterId/accept', async (c) => {
  const clusterId = c.req.param('clusterId');

  const client = await getTemporalClient();
  const handle = client.workflow.getHandle(`qa-suggestion/${clusterId}`);
  await handle.signal('acceptedForReview');

  return c.json({ ok: true });
});

// POST /qa-suggestion/:clusterId/reject — 拒绝 QA 建议
analyticsRoutes.post('/qa-suggestion/:clusterId/reject', async (c) => {
  const clusterId = c.req.param('clusterId');
  const { reason } = await c.req.json<{ reason: string }>();

  const client = await getTemporalClient();
  const handle = client.workflow.getHandle(`qa-suggestion/${clusterId}`);
  await handle.signal('rejectedForReview', { reason });

  return c.json({ ok: true });
});

// GET /auto-test/:targetId/status — 查询回归测试状态
analyticsRoutes.get('/auto-test/:targetId/status', async (c) => {
  const targetId = c.req.param('targetId');

  const client = await getTemporalClient();
  const handle = client.workflow.getHandle(`auto-test/${targetId}`);
  const status = await handle.query('getRegressionStatus');

  return c.json(status);
});

export { analyticsRoutes };
