import { type Client } from '@temporalio/client';

interface ScheduleConfig {
  scheduleId: string;
  spec: { cronExpressions: string[] };
  action: {
    type: 'startWorkflow';
    workflowType: string;
    args: unknown[];
    taskQueue: string;
  };
}

async function ensureSchedule(client: Client, config: ScheduleConfig) {
  try {
    const handle = client.schedule.getHandle(config.scheduleId);
    await handle.update((prev) => ({
      ...prev,
      spec: { calendars: [], intervals: [], cronExpressions: config.spec.cronExpressions },
      action: config.action,
    }));
    console.log(`Schedule ${config.scheduleId} updated`);
  } catch {
    await client.schedule.create({
      scheduleId: config.scheduleId,
      spec: { cronExpressions: config.spec.cronExpressions },
      action: config.action,
    });
    console.log(`Schedule ${config.scheduleId} created`);
  }
}

export async function registerSchedules(client: Client) {
  // P3
  await ensureSchedule(client, {
    scheduleId: 'km-refresh-daily',
    spec: { cronExpressions: ['0 2 * * *'] },
    action: {
      type: 'startWorkflow',
      workflowType: 'kmRefreshWorkflow',
      args: [{ scope: 'daily_refresh' }],
      taskQueue: 'km',
    },
  });

  // P4
  await ensureSchedule(client, {
    scheduleId: 'daily-schedule',
    spec: { cronExpressions: ['0 6 * * *'] },
    action: {
      type: 'startWorkflow',
      workflowType: 'dailyScheduleWorkflow',
      args: [{
        date: new Date().toISOString().slice(0, 10),
        planName: `日排班`,
        autoPublish: false,
        notifyAgents: true,
      }],
      taskQueue: 'wfm',
    },
  });

  // P5
  await ensureSchedule(client, {
    scheduleId: 'hot-issue-mining-weekly',
    spec: { cronExpressions: ['0 3 * * 1'] },
    action: {
      type: 'startWorkflow',
      workflowType: 'hotIssueMiningWorkflow',
      args: [{
        windowStart: '', // populated at runtime by workflow
        windowEnd: '',
        channels: ['online', 'voice', 'outbound'],
        minFrequency: 3,
        sources: ['work_orders', 'copilot_queries', 'negative_feedback', 'retrieval_miss'],
      }],
      taskQueue: 'analytics',
    },
  });

}
