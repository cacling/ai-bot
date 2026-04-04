import {
  proxyActivities,
  startChild,
} from '@temporalio/workflow';

import type { KmRefreshInput } from '../types.js';
import type * as kmActivities from '../activities/km.js';

const {
  scanExpiredAssets,
  scanPendingDocVersions,
  scanExpiredRegressionWindows,
  closeRegressionWindow,
  createGovernanceTask,
} = proxyActivities<typeof kmActivities>({
  startToCloseTimeout: '60s',
  retry: { maximumAttempts: 3 },
});

export async function kmRefreshWorkflow(
  input: KmRefreshInput,
): Promise<{ assetsFound: number; docVersionsFound: number; windowsClosed: number }> {
  const today = new Date().toISOString().slice(0, 10);

  // 1. Scan expired assets → launch child PolicyExpiryReminderWorkflow for each
  const expiredAssetIds = await scanExpiredAssets(today);
  for (const assetId of expiredAssetIds) {
    await startChild('policyExpiryReminderWorkflow', {
      workflowId: `policy-expiry/${assetId}`,
      args: [{
        assetId,
        nextReviewDate: today,
        severity: 'medium' as const,
      }],
    });
  }

  // 2. Scan pending doc versions → launch child KmDocumentPipelineWorkflow for each
  const pendingDocVersionIds = await scanPendingDocVersions();
  for (const docVersionId of pendingDocVersionIds) {
    await startChild('kmDocumentPipelineWorkflow', {
      workflowId: `km-doc/${docVersionId}`,
      args: [{
        docVersionId,
        stages: ['parse', 'chunk', 'generate', 'validate'] as const,
        trigger: 'schedule' as const,
      }],
    });
  }

  // 3. Scan expired regression windows → conclude or escalate
  const expiredWindowIds = await scanExpiredRegressionWindows(today);
  let windowsClosed = 0;
  for (const windowId of expiredWindowIds) {
    try {
      await closeRegressionWindow(windowId, 'inconclusive');
      windowsClosed++;
    } catch {
      // If close fails, create governance task for manual review
      await createGovernanceTask({
        task_type: 'regression_window_expired',
        source_type: 'regression_window',
        source_ref_id: windowId,
        issue_category: 'window_close_failed',
        severity: 'medium',
        priority: 'medium',
      });
    }
  }

  return {
    assetsFound: expiredAssetIds.length,
    docVersionsFound: pendingDocVersionIds.length,
    windowsClosed,
  };
}
