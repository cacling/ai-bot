import {
  proxyActivities,
  startChild,
} from '@temporalio/workflow';

import type { DailyScheduleInput, DailyScheduleResult } from '../types.js';
import type * as wfmActivities from '../activities/wfm.js';

const {
  createPlan,
  generateSchedule,
  validatePublish,
  publishPlan,
  notifyAgents,
} = proxyActivities<typeof wfmActivities>({
  startToCloseTimeout: '60s',
  retry: { maximumAttempts: 3 },
});

export async function dailyScheduleWorkflow(
  input: DailyScheduleInput,
): Promise<DailyScheduleResult> {
  const { date, planName, groupId, autoPublish, notifyAgents: shouldNotify } = input;

  // 1. Create plan
  const plan = await createPlan(date, planName, groupId);
  const planId = plan.id;

  // 2. Generate schedule
  await generateSchedule(planId);

  // 3. Validate
  const validation = await validatePublish(planId);
  const hasErrors = validation.results.some((r) => !r.valid);

  if (!hasErrors && autoPublish) {
    // 4a. Auto-publish (no blocking issues)
    await publishPlan(planId, 'temporal-auto');

    if (shouldNotify) {
      await notifyAgents(planId);
    }

    return { date, planId: String(planId), publishStatus: 'published' };
  }

  // 4b. Has errors or manual approval required → launch SchedulePublishWorkflow
  await startChild('schedulePublishWorkflow', {
    workflowId: `schedule-publish/${planId}`,
    args: [{
      planId: String(planId),
      versionNo: 1,
      requestedBy: 'temporal-daily',
    }],
  });

  return { date, planId: String(planId), publishStatus: 'awaiting_approval' };
}
