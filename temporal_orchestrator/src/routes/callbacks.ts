import { Hono } from 'hono';
import { WorkflowExecutionAlreadyStartedError } from '@temporalio/client';
import { getTemporalClient } from '../client.js';
import { TASK_QUEUES } from '../config.js';
import type { CallbackInput } from '../types.js';

const callbackRoutes = new Hono();

// 启动 CallbackWorkflow（幂等：workflow 已存在则返回 200）
callbackRoutes.post('/:callbackTaskId/start', async (c) => {
  const { callbackTaskId } = c.req.param();
  const body = await c.req.json<Omit<CallbackInput, 'callbackTaskId'>>();
  const client = await getTemporalClient();

  const workflowId = `callback/${callbackTaskId}`;
  try {
    const handle = await client.workflow.start('callbackWorkflow', {
      workflowId,
      taskQueue: TASK_QUEUES.outbound,
      args: [{ callbackTaskId, ...body }],
    });
    return c.json({ ok: true, workflowId: handle.workflowId, created: true });
  } catch (err) {
    if (err instanceof WorkflowExecutionAlreadyStartedError) {
      return c.json({ ok: true, workflowId, created: false });
    }
    throw err;
  }
});

// 标记完成
callbackRoutes.post('/:callbackTaskId/complete', async (c) => {
  const { callbackTaskId } = c.req.param();
  const client = await getTemporalClient();
  const handle = client.workflow.getHandle(`callback/${callbackTaskId}`);
  await handle.signal('callbackCompleted');
  return c.json({ ok: true });
});

// 改期
callbackRoutes.post('/:callbackTaskId/reschedule', async (c) => {
  const { callbackTaskId } = c.req.param();
  const { newTime } = await c.req.json<{ newTime: string }>();
  const client = await getTemporalClient();
  const handle = client.workflow.getHandle(`callback/${callbackTaskId}`);
  await handle.signal('callbackRescheduled', { newTime });
  return c.json({ ok: true });
});

// 取消
callbackRoutes.post('/:callbackTaskId/cancel', async (c) => {
  const { callbackTaskId } = c.req.param();
  const client = await getTemporalClient();
  const handle = client.workflow.getHandle(`callback/${callbackTaskId}`);
  await handle.signal('callbackCancelled');
  return c.json({ ok: true });
});

export { callbackRoutes };
