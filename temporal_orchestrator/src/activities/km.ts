/**
 * km.ts — KM 相关 Activity（P3）
 *
 * 所有 Activity 通过 HTTP 调 km_service 内部 API，不直接碰业务库。
 */
import { SERVICE_URLS } from '../config.js';

const KM_BASE = `${SERVICE_URLS.km}/api/internal`;

// ─── Pipeline Activities ───

export async function enqueuePipelineJobs(
  docVersionId: string,
  stages: string[],
  idempotencyKey?: string,
): Promise<{ jobs: Array<{ id: string; stage: string; status: string }> }> {
  const resp = await fetch(`${KM_BASE}/pipeline/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      doc_version_id: docVersionId,
      stages,
      idempotency_key: idempotencyKey ?? `pipeline-${docVersionId}`,
    }),
  });
  if (!resp.ok) throw new Error(`enqueuePipelineJobs failed: ${resp.status}`);
  return resp.json();
}

export async function runPipelineStage(
  jobId: string,
  stage: string,
): Promise<{ status: 'completed' | 'failed'; result?: unknown; error?: string }> {
  const resp = await fetch(`${KM_BASE}/pipeline/jobs/${jobId}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage }),
  });
  if (!resp.ok) throw new Error(`runPipelineStage failed: ${resp.status}`);
  return resp.json();
}

export async function markPipelineJobStatus(
  jobId: string,
  status: 'running' | 'completed' | 'failed',
  errorCode?: string,
  errorMessage?: string,
  candidateCount?: number,
): Promise<{ ok: boolean }> {
  const resp = await fetch(`${KM_BASE}/pipeline/jobs/${jobId}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status,
      error_code: errorCode,
      error_message: errorMessage,
      candidate_count: candidateCount,
    }),
  });
  if (!resp.ok) throw new Error(`markPipelineJobStatus failed: ${resp.status}`);
  return resp.json();
}

// ─── Governance Activities ───

export async function createGovernanceTask(body: {
  task_type: string;
  source_type: string;
  source_ref_id: string;
  issue_category?: string;
  severity?: string;
  priority?: string;
}): Promise<{ ok: boolean; task_id?: string }> {
  const resp = await fetch(`${KM_BASE}/governance/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`createGovernanceTask failed: ${resp.status}`);
  return resp.json();
}

// ─── Scan Activities (for KmRefreshWorkflow) ───

export async function scanExpiredAssets(asOfDate?: string): Promise<string[]> {
  const qs = asOfDate ? `?as_of_date=${asOfDate}` : '';
  const resp = await fetch(`${KM_BASE}/assets/scan-expired${qs}`);
  if (!resp.ok) throw new Error(`scanExpiredAssets failed: ${resp.status}`);
  const data = await resp.json() as { asset_ids: string[] };
  return data.asset_ids;
}

export async function scanPendingDocVersions(): Promise<string[]> {
  const resp = await fetch(`${KM_BASE}/doc-versions/scan-pending`);
  if (!resp.ok) throw new Error(`scanPendingDocVersions failed: ${resp.status}`);
  const data = await resp.json() as { doc_version_ids: string[] };
  return data.doc_version_ids;
}

export async function scanExpiredRegressionWindows(asOfDate?: string): Promise<string[]> {
  const qs = asOfDate ? `?as_of_date=${asOfDate}` : '';
  const resp = await fetch(`${KM_BASE}/regression-windows/scan-expired${qs}`);
  if (!resp.ok) throw new Error(`scanExpiredRegressionWindows failed: ${resp.status}`);
  const data = await resp.json() as { window_ids: string[] };
  return data.window_ids;
}

export async function closeRegressionWindow(
  windowId: string,
  verdict: 'pass' | 'fail' | 'inconclusive',
): Promise<{ ok: boolean }> {
  const resp = await fetch(`${KM_BASE}/regression-windows/${windowId}/conclude`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ verdict }),
  });
  if (!resp.ok) throw new Error(`closeRegressionWindow failed: ${resp.status}`);
  return resp.json();
}
