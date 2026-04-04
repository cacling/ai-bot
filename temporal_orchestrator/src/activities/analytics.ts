/**
 * analytics.ts — 分析相关 Activity（P5）
 *
 * 热点挖掘、QA 候选生成、自动测试回归。
 * P5 阶段先用 mock 实现，后续接入真实分析引擎。
 */
import { SERVICE_URLS } from '../config.js';

const KM_BASE = `${SERVICE_URLS.km}/api/internal`;

// ─── Hot Issue Mining ───

export async function collectRecentData(
  windowStart: string,
  windowEnd: string,
  sources: string[],
): Promise<{ items: Array<{ id: string; text: string; source: string; timestamp: string }> }> {
  // P5 mock: return empty data set
  // In production, this would query work orders, copilot queries, feedback, retrieval miss
  console.log(`[analytics] collectRecentData mock: ${windowStart} - ${windowEnd}, sources: ${sources.join(',')}`);
  return { items: [] };
}

export async function clusterIssues(
  data: Array<{ id: string; text: string }>,
  minFrequency: number,
): Promise<{ clusters: Array<{ id: string; issueText: string; frequency: number; evidenceRefs: string[] }> }> {
  // P5 mock: no clusters found
  console.log(`[analytics] clusterIssues mock: ${data.length} items, minFrequency=${minFrequency}`);
  return { clusters: [] };
}

export async function createReviewPackages(
  clusters: Array<{ id: string; issueText: string }>,
): Promise<{ packageIds: string[] }> {
  // P5 mock: create packages via km_service
  const ids: string[] = [];
  for (const cluster of clusters) {
    try {
      const resp = await fetch(`${KM_BASE}/governance/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_type: 'hot_issue_review',
          source_type: 'cluster',
          source_ref_id: cluster.id,
          issue_category: 'hot_issue',
          severity: 'medium',
          priority: 'medium',
        }),
      });
      if (resp.ok) {
        const result = await resp.json() as { task_id: string };
        ids.push(result.task_id);
      }
    } catch {
      // best-effort
    }
  }
  return { packageIds: ids };
}

// ─── QA Flow Suggestion ───

export async function generateQaCandidates(
  clusterId: string,
  issueText: string,
  evidenceRefs: string[],
): Promise<{ candidateIds: string[]; draftCount: number }> {
  // P5 mock: no candidates generated
  console.log(`[analytics] generateQaCandidates mock: cluster=${clusterId}, issue="${issueText}", refs=${evidenceRefs.length}`);
  return { candidateIds: [], draftCount: 0 };
}

export async function writeReviewPackage(
  clusterId: string,
  candidateIds: string[],
): Promise<{ packageId: string }> {
  // P5 mock
  console.log(`[analytics] writeReviewPackage mock: cluster=${clusterId}, candidates=${candidateIds.length}`);
  return { packageId: `PKG-${clusterId}` };
}

// ─── Auto Test Regression ───

export async function generateTestCases(
  targetType: string,
  targetId: string,
): Promise<{ caseIds: string[] }> {
  // P5 mock
  console.log(`[analytics] generateTestCases mock: ${targetType}/${targetId}`);
  return { caseIds: [] };
}

export async function executeTestCases(
  caseIds: string[],
  runMode: string,
): Promise<{ passCount: number; failCount: number; results: Array<{ caseId: string; passed: boolean }> }> {
  // P5 mock: all pass
  console.log(`[analytics] executeTestCases mock: ${caseIds.length} cases, mode=${runMode}`);
  return {
    passCount: caseIds.length,
    failCount: 0,
    results: caseIds.map((id) => ({ caseId: id, passed: true })),
  };
}
