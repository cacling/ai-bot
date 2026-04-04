import { Hono } from 'hono';
import { WorkflowExecutionAlreadyStartedError } from '@temporalio/client';
import { getTemporalClient } from '../client.js';
import { TASK_QUEUES } from '../config.js';
import type { HumanHandoffInput } from '../types.js';

const handoffRoutes = new Hono();

// 启动 HumanHandoffWorkflow（幂等：workflow 已存在则返回 200）
handoffRoutes.post('/:handoffId/start', async (c) => {
  const { handoffId } = c.req.param();
  const body = await c.req.json<Omit<HumanHandoffInput, 'handoffId'>>();
  const client = await getTemporalClient();

  const workflowId = `handoff/${handoffId}`;
  try {
    const handle = await client.workflow.start('humanHandoffWorkflow', {
      workflowId,
      taskQueue: TASK_QUEUES.outbound,
      args: [{ handoffId, ...body }],
    });
    return c.json({ ok: true, workflowId: handle.workflowId, created: true });
  } catch (err) {
    if (err instanceof WorkflowExecutionAlreadyStartedError) {
      return c.json({ ok: true, workflowId, created: false });
    }
    throw err;
  }
});

// 发送 Signal（通用入口）
handoffRoutes.post('/:handoffId/signal', async (c) => {
  const { handoffId } = c.req.param();
  const { signalName, payload } = await c.req.json<{
    signalName: 'accepted' | 'resolved' | 'resumeAi' | 'rejectResume';
    payload: Record<string, unknown>;
  }>();
  const client = await getTemporalClient();
  const handle = client.workflow.getHandle(`handoff/${handoffId}`);
  await handle.signal(signalName, payload);
  return c.json({ ok: true });
});

// 查询状态
handoffRoutes.get('/:handoffId/status', async (c) => {
  const { handoffId } = c.req.param();
  const client = await getTemporalClient();
  const handle = client.workflow.getHandle(`handoff/${handoffId}`);
  const status = await handle.query('getHandoffStatus');
  return c.json(status);
});

export { handoffRoutes };
