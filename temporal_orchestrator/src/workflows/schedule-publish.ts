import {
  proxyActivities,
  defineSignal,
  defineQuery,
  setHandler,
  sleep,
} from '@temporalio/workflow';

import type { SchedulePublishInput, SchedulePublishResult } from '../types.js';
import type * as wfmActivities from '../activities/wfm.js';
import type * as notifyActivities from '../activities/notify.js';

const { publishPlan, notifyAgents } = proxyActivities<typeof wfmActivities>({
  startToCloseTimeout: '60s',
  retry: { maximumAttempts: 3 },
});

const { notifyWorkbench } = proxyActivities<typeof notifyActivities>({
  startToCloseTimeout: '30s',
  retry: { maximumAttempts: 3 },
});

// ─── Signals ───

export const manualApprovedSignal = defineSignal<[{ approvedBy?: string }]>('manualApproved');
export const manualRejectedSignal = defineSignal<[{ reason: string }]>('manualRejected');

// ─── Query ───

interface PublishStatus {
  planId: string;
  status: 'awaiting_approval' | 'published' | 'rejected' | 'expired';
  approvedBy?: string;
  rejectedReason?: string;
}

export const getPublishStatusQuery = defineQuery<PublishStatus>('getPublishStatus');

const APPROVAL_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function schedulePublishWorkflow(
  input: SchedulePublishInput,
): Promise<SchedulePublishResult> {
  const { planId } = input;

  let approved = false;
  let rejected = false;
  let approvedBy: string | undefined;
  let rejectedReason: string | undefined;
  let currentStatus: PublishStatus['status'] = 'awaiting_approval';

  // Signal handlers
  setHandler(manualApprovedSignal, ({ approvedBy: by }) => {
    approved = true;
    approvedBy = by;
  });

  setHandler(manualRejectedSignal, ({ reason }) => {
    rejected = true;
    rejectedReason = reason;
  });

  // Query handler
  setHandler(getPublishStatusQuery, () => ({
    planId,
    status: currentStatus,
    approvedBy,
    rejectedReason,
  }));

  // Notify workbench that approval is needed
  await notifyWorkbench({
    event_type: 'schedule_publish_pending',
    payload: { plan_id: planId, requested_by: input.requestedBy },
  });

  // Wait for approval/rejection signal with 24h timeout
  const deadline = Date.now() + APPROVAL_TIMEOUT_MS;
  while (!approved && !rejected && Date.now() < deadline) {
    await sleep('5m');
  }

  if (approved) {
    await publishPlan(Number(planId), approvedBy);
    await notifyAgents(Number(planId));
    currentStatus = 'published';
    return { planId, publishStatus: 'published' };
  }

  if (rejected) {
    currentStatus = 'rejected';
    return { planId, publishStatus: 'rejected' };
  }

  // Timeout
  currentStatus = 'expired';
  return { planId, publishStatus: 'expired' };
}
