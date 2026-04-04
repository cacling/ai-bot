import { Hono } from 'hono';
import { getTemporalClient } from '../client.js';
import { WorkflowExecutionAlreadyStartedError } from '@temporalio/client';
import { TASK_QUEUES } from '../config.js';
import type { DailyScheduleInput } from '../types.js';

const wfmRoutes = new Hono();

// POST /daily-schedule/start — 手动触发每日排班
wfmRoutes.post('/daily-schedule/start', async (c) => {
  const body = await c.req.json<Partial<DailyScheduleInput>>();
  const date = body.date ?? new Date().toISOString().slice(0, 10);
  const workflowId = `daily-schedule/${date}`;

  const client = await getTemporalClient();
  try {
    await client.workflow.start('dailyScheduleWorkflow', {
      workflowId,
      taskQueue: TASK_QUEUES.wfm,
      args: [{
        date,
        planName: body.planName ?? `日排班 ${date}`,
        groupId: body.groupId,
        autoPublish: body.autoPublish ?? false,
        notifyAgents: body.notifyAgents ?? true,
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

// POST /publish/:planId/approve — 审批通过
wfmRoutes.post('/publish/:planId/approve', async (c) => {
  const planId = c.req.param('planId');
  const body = await c.req.json<{ approvedBy?: string }>().catch(() => ({} as { approvedBy?: string }));

  const client = await getTemporalClient();
  const handle = client.workflow.getHandle(`schedule-publish/${planId}`);
  await handle.signal('manualApproved', { approvedBy: body.approvedBy });

  return c.json({ ok: true });
});

// POST /publish/:planId/reject — 审批拒绝
wfmRoutes.post('/publish/:planId/reject', async (c) => {
  const planId = c.req.param('planId');
  const { reason } = await c.req.json<{ reason: string }>();

  const client = await getTemporalClient();
  const handle = client.workflow.getHandle(`schedule-publish/${planId}`);
  await handle.signal('manualRejected', { reason });

  return c.json({ ok: true });
});

// GET /publish/:planId/status — 查询发布状态
wfmRoutes.get('/publish/:planId/status', async (c) => {
  const planId = c.req.param('planId');

  const client = await getTemporalClient();
  const handle = client.workflow.getHandle(`schedule-publish/${planId}`);
  const status = await handle.query('getPublishStatus');

  return c.json(status);
});

export { wfmRoutes };
