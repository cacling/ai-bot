import { Hono } from 'hono';
import { getTemporalClient } from '../client.js';
import { WorkflowExecutionAlreadyStartedError } from '@temporalio/client';
import { TASK_QUEUES } from '../config.js';
import type { KmDocumentPipelineInput } from '../types.js';

const kmRoutes = new Hono();

// POST /doc-versions/:vid/start — 启动文档流水线 Workflow
kmRoutes.post('/doc-versions/:vid/start', async (c) => {
  const vid = c.req.param('vid');
  const body = await c.req.json<Partial<KmDocumentPipelineInput>>();

  const client = await getTemporalClient();
  const workflowId = `km-doc/${vid}`;

  try {
    await client.workflow.start('kmDocumentPipelineWorkflow', {
      workflowId,
      taskQueue: TASK_QUEUES.km,
      args: [{
        docVersionId: vid,
        stages: body.stages ?? ['parse', 'chunk', 'generate', 'validate'],
        trigger: body.trigger ?? 'manual',
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

// POST /doc-versions/:vid/retry — 从指定阶段重试
kmRoutes.post('/doc-versions/:vid/retry', async (c) => {
  const vid = c.req.param('vid');
  const { stage } = await c.req.json<{ stage: string }>();

  const client = await getTemporalClient();
  const handle = client.workflow.getHandle(`km-doc/${vid}`);
  await handle.signal('retryFromStage', { stage });

  return c.json({ ok: true });
});

// POST /doc-versions/:vid/cancel — 取消流水线
kmRoutes.post('/doc-versions/:vid/cancel', async (c) => {
  const vid = c.req.param('vid');

  const client = await getTemporalClient();
  const handle = client.workflow.getHandle(`km-doc/${vid}`);
  await handle.signal('cancelPipeline');

  return c.json({ ok: true });
});

// GET /doc-versions/:vid/status — 查询流水线状态
kmRoutes.get('/doc-versions/:vid/status', async (c) => {
  const vid = c.req.param('vid');

  const client = await getTemporalClient();
  const handle = client.workflow.getHandle(`km-doc/${vid}`);
  const status = await handle.query('getPipelineStatus');

  return c.json(status);
});

// POST /refresh/start — 手动触发知识刷新
kmRoutes.post('/refresh/start', async (c) => {
  const body = await c.req.json<{ scope?: string }>();

  const client = await getTemporalClient();
  const today = new Date().toISOString().slice(0, 10);
  const workflowId = `km-refresh/${today}`;

  try {
    await client.workflow.start('kmRefreshWorkflow', {
      workflowId,
      taskQueue: TASK_QUEUES.km,
      args: [{ scope: body.scope ?? 'daily_refresh' }],
    });
    return c.json({ ok: true, workflowId });
  } catch (err) {
    if (err instanceof WorkflowExecutionAlreadyStartedError) {
      return c.json({ ok: true, workflowId, alreadyRunning: true });
    }
    throw err;
  }
});

// POST /policy-expiry/:assetId/ack — 确认过期提醒
kmRoutes.post('/policy-expiry/:assetId/ack', async (c) => {
  const assetId = c.req.param('assetId');

  const client = await getTemporalClient();
  const handle = client.workflow.getHandle(`policy-expiry/${assetId}`);
  await handle.signal('ackReminder');

  return c.json({ ok: true });
});

export { kmRoutes };
