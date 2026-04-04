import {
  proxyActivities,
  startChild,
} from '@temporalio/workflow';

import type { HotIssueMiningInput, HotIssueMiningResult } from '../types.js';
import type * as analyticsActivities from '../activities/analytics.js';

const {
  collectRecentData,
  clusterIssues,
  createReviewPackages,
} = proxyActivities<typeof analyticsActivities>({
  startToCloseTimeout: '5m',
  retry: { maximumAttempts: 3 },
});

export async function hotIssueMiningWorkflow(
  input: HotIssueMiningInput,
): Promise<HotIssueMiningResult> {
  const { windowStart, windowEnd, sources, minFrequency } = input;

  // 1. Collect recent data from multiple sources
  const { items } = await collectRecentData(windowStart, windowEnd, sources);

  if (items.length === 0) {
    return { clusterCount: 0, reviewPackageIds: [] };
  }

  // 2. Cluster issues
  const { clusters } = await clusterIssues(items, minFrequency);

  if (clusters.length === 0) {
    return { clusterCount: 0, reviewPackageIds: [] };
  }

  // 3. For each high-frequency cluster, launch child QaFlowSuggestionWorkflow
  for (const cluster of clusters) {
    await startChild('qaFlowSuggestionWorkflow', {
      workflowId: `qa-suggestion/${cluster.id}`,
      args: [{
        clusterId: cluster.id,
        issueText: cluster.issueText,
        evidenceRefs: cluster.evidenceRefs,
      }],
    });
  }

  // 4. Create review packages
  const { packageIds } = await createReviewPackages(clusters);

  return { clusterCount: clusters.length, reviewPackageIds: packageIds };
}
