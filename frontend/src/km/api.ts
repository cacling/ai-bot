/**
 * api.ts — 知识管理 API 客户端
 */
const BASE = '/api/km';

async function request<T = unknown>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...opts?.headers },
    ...opts,
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

// ── 文档 ──
export const kmApi = {
  // 文档
  listDocuments: (params?: Record<string, string>) =>
    request<{ items: KMDocument[]; total: number }>(`/documents?${new URLSearchParams(params)}`),
  getDocument: (id: string) => request<KMDocument & { versions: KMDocVersion[] }>(`/documents/${id}`),
  createDocument: (body: { title: string; source?: string; classification?: string; owner?: string }) =>
    request<{ id: string; version_id: string }>('/documents', { method: 'POST', body: JSON.stringify(body) }),
  createVersion: (docId: string, body: Record<string, unknown>) =>
    request<{ id: string; version_no: number }>(`/documents/${docId}/versions`, { method: 'POST', body: JSON.stringify(body) }),
  triggerParse: (vid: string) =>
    request(`/documents/versions/${vid}/parse`, { method: 'POST', body: '{}' }),

  // 候选
  listCandidates: (params?: Record<string, string>) =>
    request<{ items: KMCandidate[]; total: number }>(`/candidates?${new URLSearchParams(params)}`),
  getCandidate: (id: string) => request<KMCandidateDetail>(`/candidates/${id}`),
  createCandidate: (body: Record<string, unknown>) =>
    request<{ id: string }>('/candidates', { method: 'POST', body: JSON.stringify(body) }),
  updateCandidate: (id: string, body: Record<string, unknown>) =>
    request(`/candidates/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  gateCheck: (id: string) =>
    request<{ gate_evidence: string; gate_conflict: string; gate_ownership: string; all_pass: boolean }>(
      `/candidates/${id}/gate-check`, { method: 'POST' }),

  // 证据
  listEvidence: (params?: Record<string, string>) =>
    request<{ items: KMEvidence[] }>(`/evidence?${new URLSearchParams(params)}`),
  createEvidence: (body: Record<string, unknown>) =>
    request<{ id: string }>('/evidence', { method: 'POST', body: JSON.stringify(body) }),
  updateEvidence: (id: string, body: Record<string, unknown>) =>
    request(`/evidence/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

  // 冲突
  listConflicts: (params?: Record<string, string>) =>
    request<{ items: KMConflict[] }>(`/conflicts?${new URLSearchParams(params)}`),
  resolveConflict: (id: string, body: Record<string, unknown>) =>
    request(`/conflicts/${id}/resolve`, { method: 'PUT', body: JSON.stringify(body) }),

  // 评审包
  listReviewPackages: (params?: Record<string, string>) =>
    request<{ items: KMReviewPackage[]; total: number }>(`/review-packages?${new URLSearchParams(params)}`),
  getReviewPackage: (id: string) => request<KMReviewPackageDetail>(`/review-packages/${id}`),
  createReviewPackage: (body: Record<string, unknown>) =>
    request<{ id: string }>('/review-packages', { method: 'POST', body: JSON.stringify(body) }),
  submitReview: (id: string, body?: Record<string, unknown>) =>
    request(`/review-packages/${id}/submit`, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  approveReview: (id: string, body?: Record<string, unknown>) =>
    request(`/review-packages/${id}/approve`, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  rejectReview: (id: string, body?: Record<string, unknown>) =>
    request(`/review-packages/${id}/reject`, { method: 'POST', body: JSON.stringify(body ?? {}) }),

  // 动作草案
  listActionDrafts: (params?: Record<string, string>) =>
    request<{ items: KMActionDraft[]; total: number }>(`/action-drafts?${new URLSearchParams(params)}`),
  getActionDraft: (id: string) => request<KMActionDraft>(`/action-drafts/${id}`),
  createActionDraft: (body: Record<string, unknown>) =>
    request<{ id: string }>('/action-drafts', { method: 'POST', body: JSON.stringify(body) }),
  executeActionDraft: (id: string, body?: Record<string, unknown>) =>
    request(`/action-drafts/${id}/execute`, { method: 'POST', body: JSON.stringify(body ?? {}) }),

  // 资产
  listAssets: (params?: Record<string, string>) =>
    request<{ items: KMAsset[]; total: number }>(`/assets?${new URLSearchParams(params)}`),
  getAsset: (id: string) => request<KMAsset>(`/assets/${id}`),
  getAssetVersions: (id: string) => request<{ items: KMAssetVersion[] }>(`/assets/${id}/versions`),

  // 治理任务
  listTasks: (params?: Record<string, string>) =>
    request<{ items: KMTask[]; total: number }>(`/tasks?${new URLSearchParams(params)}`),
  createTask: (body: Record<string, unknown>) =>
    request<{ id: string }>('/tasks', { method: 'POST', body: JSON.stringify(body) }),
  updateTask: (id: string, body: Record<string, unknown>) =>
    request(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

  // 审计
  listAuditLogs: (params?: Record<string, string>) =>
    request<{ items: KMAuditLog[]; total: number }>(`/audit-logs?${new URLSearchParams(params)}`),
};

// ── Types ──
export interface KMDocument {
  id: string; title: string; source: string; classification: string;
  owner: string | null; status: string; created_at: string; updated_at: string;
}
export interface KMDocVersion {
  id: string; document_id: string; version_no: number; file_path: string | null;
  scope_json: string | null; effective_from: string | null; effective_to: string | null;
  diff_summary: string | null; status: string; created_at: string;
}
export interface KMCandidate {
  id: string; source_type: string; source_ref_id: string | null;
  normalized_q: string; draft_answer: string | null; category: string | null;
  risk_level: string; gate_evidence: string; gate_conflict: string; gate_ownership: string;
  target_asset_id: string | null; status: string; review_pkg_id: string | null;
  created_by: string | null; created_at: string; updated_at: string;
}
export interface KMCandidateDetail extends KMCandidate {
  evidences: KMEvidence[];
  conflicts: KMConflict[];
  gate_card: {
    evidence: { status: string; details: KMEvidence[] };
    conflict: { status: string; details: KMConflict[] };
    ownership: { status: string; has_target: boolean };
  };
}
export interface KMEvidence {
  id: string; candidate_id: string | null; asset_id: string | null;
  doc_version_id: string | null; locator: string | null;
  status: string; fail_reason: string | null; rule_version: string | null;
  reviewed_by: string | null; reviewed_at: string | null; created_at: string;
}
export interface KMConflict {
  id: string; conflict_type: string; item_a_id: string; item_b_id: string;
  overlap_scope: string | null; blocking_policy: string; resolution: string | null;
  arbiter: string | null; status: string; resolved_at: string | null; created_at: string;
}
export interface KMReviewPackage {
  id: string; title: string; status: string; risk_level: string;
  impact_summary: string | null; candidate_ids_json: string | null;
  approval_snapshot: string | null; submitted_by: string | null;
  submitted_at: string | null; approved_by: string | null;
  created_by: string | null; created_at: string; updated_at: string;
}
export interface KMReviewPackageDetail extends KMReviewPackage {
  candidates: KMCandidate[];
}
export interface KMActionDraft {
  id: string; action_type: string; target_asset_id: string | null;
  review_pkg_id: string | null; status: string; change_summary: string | null;
  rollback_point_id: string | null; regression_window_id: string | null;
  executed_by: string | null; executed_at: string | null;
  created_by: string | null; created_at: string; updated_at: string;
}
export interface KMAsset {
  id: string; title: string; asset_type: string; status: string;
  current_version: number; scope_json: string | null; owner: string | null;
  next_review_date: string | null; created_at: string; updated_at: string;
}
export interface KMAssetVersion {
  id: string; asset_id: string; version_no: number;
  content_snapshot: string | null; scope_snapshot: string | null;
  evidence_summary: string | null; rollback_point_id: string | null;
  action_draft_id: string | null; effective_from: string | null; created_at: string;
}
export interface KMTask {
  id: string; task_type: string; source_type: string | null;
  source_ref_id: string | null; priority: string; assignee: string | null;
  status: string; due_date: string | null; conclusion: string | null;
  created_at: string; updated_at: string;
}
export interface KMAuditLog {
  id: number; action: string; object_type: string; object_id: string;
  operator: string; risk_level: string | null; detail_json: string | null;
  created_at: string;
}
