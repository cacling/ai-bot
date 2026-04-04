import {
  proxyActivities,
  defineSignal,
  setHandler,
  sleep,
  startChild,
} from '@temporalio/workflow';

import type { QaFlowSuggestionInput, QaFlowSuggestionResult } from '../types.js';
import type * as analyticsActivities from '../activities/analytics.js';
import type * as notifyActivities from '../activities/notify.js';

const {
  generateQaCandidates,
  writeReviewPackage,
} = proxyActivities<typeof analyticsActivities>({
  startToCloseTimeout: '5m',
  retry: { maximumAttempts: 3 },
});

const { notifyWorkbench } = proxyActivities<typeof notifyActivities>({
  startToCloseTimeout: '30s',
  retry: { maximumAttempts: 3 },
});

// ─── Signals ───

export const acceptedForReviewSignal = defineSignal('acceptedForReview');
export const rejectedForReviewSignal = defineSignal<[{ reason: string }]>('rejectedForReview');

const REVIEW_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function qaFlowSuggestionWorkflow(
  input: QaFlowSuggestionInput,
): Promise<QaFlowSuggestionResult> {
  const { clusterId, issueText, evidenceRefs } = input;

  let accepted = false;
  let rejected = false;

  // Signal handlers
  setHandler(acceptedForReviewSignal, () => {
    accepted = true;
  });

  setHandler(rejectedForReviewSignal, () => {
    rejected = true;
  });

  // 1. Generate QA candidates + flow candidates
  const { candidateIds } = await generateQaCandidates(clusterId, issueText, evidenceRefs);

  // 2. Write review package
  await writeReviewPackage(clusterId, candidateIds);

  // 3. Notify operations for review
  await notifyWorkbench({
    event_type: 'qa_suggestion_pending',
    payload: {
      cluster_id: clusterId,
      issue_text: issueText,
      candidate_count: candidateIds.length,
    },
  });

  // 4. Wait for signal
  const deadline = Date.now() + REVIEW_TIMEOUT_MS;
  while (!accepted && !rejected && Date.now() < deadline) {
    await sleep('1h');
  }

  if (accepted) {
    // Launch auto-test regression
    if (candidateIds.length > 0) {
      await startChild('autoTestRegressionWorkflow', {
        workflowId: `auto-test/${clusterId}`,
        args: [{
          targetType: 'qa_pair',
          targetId: clusterId,
          generatedCaseIds: candidateIds,
          runMode: 'smoke',
        }],
      });
    }
    return { clusterId, finalStatus: 'accepted' };
  }

  return { clusterId, finalStatus: 'rejected' };
}
