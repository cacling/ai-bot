import {
  proxyActivities,
  defineSignal,
  defineQuery,
  setHandler,
} from '@temporalio/workflow';

import type { AutoTestRegressionInput, AutoTestRegressionResult } from '../types.js';
import type * as analyticsActivities from '../activities/analytics.js';
import type * as kmActivities from '../activities/km.js';

const {
  generateTestCases,
  executeTestCases,
} = proxyActivities<typeof analyticsActivities>({
  startToCloseTimeout: '10m',
  retry: { maximumAttempts: 2 },
});

const { createGovernanceTask } = proxyActivities<typeof kmActivities>({
  startToCloseTimeout: '30s',
  retry: { maximumAttempts: 3 },
});

// ─── Signals ───

export const rerunFailedSignal = defineSignal('rerunFailed');
export const approveReleaseSignal = defineSignal('approveRelease');
export const blockReleaseSignal = defineSignal<[{ reason: string }]>('blockRelease');

// ─── Query ───

interface RegressionStatus {
  targetId: string;
  passRate: number;
  totalCases: number;
  status: 'running' | 'completed' | 'governance_created';
}

export const getRegressionStatusQuery = defineQuery<RegressionStatus>('getRegressionStatus');

const PASS_RATE_THRESHOLD = 0.9; // 90%

export async function autoTestRegressionWorkflow(
  input: AutoTestRegressionInput,
): Promise<AutoTestRegressionResult> {
  const { targetType, targetId, generatedCaseIds, runMode } = input;

  let passRate = 0;
  let totalCases = 0;
  let currentStatus: RegressionStatus['status'] = 'running';
  let blocked = false;
  let approved = false;
  let rerunRequested = false;
  let failedCaseIds: string[] = [];

  // Signal handlers
  setHandler(rerunFailedSignal, () => {
    rerunRequested = true;
  });

  setHandler(approveReleaseSignal, () => {
    approved = true;
  });

  setHandler(blockReleaseSignal, () => {
    blocked = true;
  });

  // Query handler
  setHandler(getRegressionStatusQuery, () => ({
    targetId,
    passRate,
    totalCases,
    status: currentStatus,
  }));

  // 1. Generate test cases if none provided
  let caseIds = generatedCaseIds;
  if (caseIds.length === 0) {
    const generated = await generateTestCases(targetType, targetId);
    caseIds = generated.caseIds;
  }

  if (caseIds.length === 0) {
    // No test cases to run
    currentStatus = 'completed';
    return { targetId, passRate: 1, finalStatus: 'releasable' };
  }

  // 2. Execute test cases
  const results = await executeTestCases(caseIds, runMode);
  totalCases = results.passCount + results.failCount;
  passRate = totalCases > 0 ? results.passCount / totalCases : 0;
  failedCaseIds = results.results.filter((r) => !r.passed).map((r) => r.caseId);

  // 3. Evaluate results
  if (passRate >= PASS_RATE_THRESHOLD) {
    currentStatus = 'completed';
    return { targetId, passRate, finalStatus: 'releasable' };
  }

  // Pass rate below threshold → create governance task
  await createGovernanceTask({
    task_type: 'regression_failure',
    source_type: targetType,
    source_ref_id: targetId,
    issue_category: 'low_pass_rate',
    severity: passRate < 0.5 ? 'high' : 'medium',
    priority: 'high',
  });

  currentStatus = 'governance_created';
  return { targetId, passRate, finalStatus: 'needs_governance' };
}
