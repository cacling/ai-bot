import { Hono } from 'hono';
import { WorkflowExecutionAlreadyStartedError } from '@temporalio/client';
import { getTemporalClient } from '../client.js';
import { TASK_QUEUES } from '../config.js';
import type { OutboundTaskInput } from '../types.js';

const outboundRoutes = new Hono();

// 启动 OutboundTaskWorkflow（幂等）
outboundRoutes.post('/tasks/:taskId/start', async (c) => {
  const { taskId } = c.req.param();
  const body = await c.req.json<Omit<OutboundTaskInput, 'taskId'>>();
  const client = await getTemporalClient();

  const workflowId = `outbound-task/${taskId}`;
  try {
    const handle = await client.workflow.start('outboundTaskWorkflow', {
      workflowId,
      taskQueue: TASK_QUEUES.outbound,
      args: [{ taskId, ...body }],
    });
    return c.json({ ok: true, workflowId: handle.workflowId, created: true });
  } catch (err) {
    if (err instanceof WorkflowExecutionAlreadyStartedError) {
      return c.json({ ok: true, workflowId, created: false });
    }
    throw err;
  }
});

// 发送通话结果 Signal
outboundRoutes.post('/tasks/:taskId/call-result', async (c) => {
  const { taskId } = c.req.param();
  const body = await c.req.json<{
    result: string;
    remark?: string;
    callbackTime?: string;
    ptpDate?: string;
  }>();
  const client = await getTemporalClient();
  const handle = client.workflow.getHandle(`outbound-task/${taskId}`);
  await handle.signal('callResultRecorded', body);
  return c.json({ ok: true });
});

// 取消任务
outboundRoutes.post('/tasks/:taskId/cancel', async (c) => {
  const { taskId } = c.req.param();
  const client = await getTemporalClient();
  const handle = client.workflow.getHandle(`outbound-task/${taskId}`);
  await handle.signal('taskCancelled');
  return c.json({ ok: true });
});

// 查询状态
outboundRoutes.get('/tasks/:taskId/status', async (c) => {
  const { taskId } = c.req.param();
  const client = await getTemporalClient();
  const handle = client.workflow.getHandle(`outbound-task/${taskId}`);
  const status = await handle.query('getOutboundTaskStatus');
  return c.json(status);
});

export { outboundRoutes };
