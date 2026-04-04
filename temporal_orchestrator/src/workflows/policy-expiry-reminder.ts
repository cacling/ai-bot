import {
  proxyActivities,
  defineSignal,
  defineQuery,
  setHandler,
  sleep,
} from '@temporalio/workflow';

import type { PolicyExpiryReminderInput, PolicyExpiryReminderResult } from '../types.js';
import type * as notifyActivities from '../activities/notify.js';
import type * as kmActivities from '../activities/km.js';

const { notifyWorkbench } = proxyActivities<typeof notifyActivities>({
  startToCloseTimeout: '30s',
  retry: { maximumAttempts: 3 },
});

const { createGovernanceTask } = proxyActivities<typeof kmActivities>({
  startToCloseTimeout: '30s',
  retry: { maximumAttempts: 3 },
});

// ─── Signals ───

export const ackReminderSignal = defineSignal('ackReminder');
export const reviewCompletedSignal = defineSignal('reviewCompleted');

// ─── Query ───

interface ReminderStatus {
  assetId: string;
  remindersSent: number;
  acknowledged: boolean;
  status: 'pending' | 'reminded' | 'acknowledged' | 'escalated';
}

export const getReminderStatusQuery = defineQuery<ReminderStatus>('getReminderStatus');

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

export async function policyExpiryReminderWorkflow(
  input: PolicyExpiryReminderInput,
): Promise<PolicyExpiryReminderResult> {
  const { assetId, severity } = input;

  let acknowledged = false;
  let remindersSent = 0;
  let currentStatus: ReminderStatus['status'] = 'pending';

  // Signal handlers
  setHandler(ackReminderSignal, () => {
    acknowledged = true;
  });

  setHandler(reviewCompletedSignal, () => {
    acknowledged = true;
  });

  // Query handler
  setHandler(getReminderStatusQuery, () => ({
    assetId,
    remindersSent,
    acknowledged,
    status: currentStatus,
  }));

  // 1. Send first reminder
  await notifyWorkbench({
    event_type: 'policy_expiry_reminder',
    payload: {
      asset_id: assetId,
      severity,
      reminder_number: 1,
      next_review_date: input.nextReviewDate,
      owner: input.owner,
    },
  });
  remindersSent = 1;
  currentStatus = 'reminded';

  // 2. Wait 3 days
  await sleep(THREE_DAYS_MS);

  // Check if acknowledged
  if (acknowledged) {
    currentStatus = 'acknowledged';
    return { assetId, finalStatus: 'acknowledged' };
  }

  // 3. Send second reminder (escalated severity)
  const escalatedSeverity = severity === 'low' ? 'medium' : severity === 'medium' ? 'high' : 'critical';
  await notifyWorkbench({
    event_type: 'policy_expiry_reminder',
    payload: {
      asset_id: assetId,
      severity: escalatedSeverity,
      reminder_number: 2,
      next_review_date: input.nextReviewDate,
      owner: input.owner,
    },
  });
  remindersSent = 2;

  // 4. Wait another 3 days
  await sleep(THREE_DAYS_MS);

  // Check if acknowledged
  if (acknowledged) {
    currentStatus = 'acknowledged';
    return { assetId, finalStatus: 'acknowledged' };
  }

  // 5. Still not acknowledged → create governance task
  await createGovernanceTask({
    task_type: 'policy_expiry',
    source_type: 'asset',
    source_ref_id: assetId,
    issue_category: 'overdue_review',
    severity: 'high',
    priority: 'high',
  });

  currentStatus = 'escalated';
  return { assetId, finalStatus: 'escalated' };
}
