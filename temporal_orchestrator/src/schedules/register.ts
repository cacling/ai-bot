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

export async function registerSchedules(_client: Client) {
  // P3:
  // await ensureSchedule(client, {
  //   scheduleId: 'km-refresh-daily',
  //   spec: { cronExpressions: ['0 2 * * *'] },
  //   action: {
  //     type: 'startWorkflow',
  //     workflowType: 'kmRefreshWorkflow',
  //     args: [{ scope: 'daily_refresh' }],
  //     taskQueue: TASK_QUEUES.km,
  //   },
  // });

  // P4:
  // await ensureSchedule(client, {
  //   scheduleId: 'daily-schedule',
  //   spec: { cronExpressions: ['0 6 * * *'] },
  //   action: { ... },
  // });

  // P5:
  // await ensureSchedule(client, {
  //   scheduleId: 'hot-issue-mining-weekly',
  //   spec: { cronExpressions: ['0 3 * * 1'] },
  //   action: { ... },
  // });

  // Keep ensureSchedule reference for future use
  void ensureSchedule;
}
