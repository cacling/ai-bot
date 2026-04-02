/**
 * CDP Customer Management API helpers
 *
 * All requests go through the backend CDP proxy → cdp_service:18020
 */

const CDP_BASE = '/api/cdp';

async function cdpFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${CDP_BASE}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `CDP API error: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Types ──

export interface PartyIdentity {
  party_identity_id: string;
  identity_type: string;
  identity_value: string;
  identity_value_norm: string;
  primary_flag: boolean;
  verified_flag: boolean;
}

export interface ContactPoint {
  contact_point_id: string;
  contact_type: string;
  contact_value: string;
  label: string | null;
  preferred_flag: boolean;
  status: string;
}

export interface CustomerProfile {
  customer_profile_id: string;
  party_id: string;
  basic_profile_json: string | null;
  contact_profile_json: string | null;
  value_profile_json: string | null;
  service_profile_json: string | null;
}

export interface CustomerListItem {
  party_id: string;
  party_type: string;
  display_name: string | null;
  canonical_name: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  primary_identity: PartyIdentity | null;
  profile: CustomerProfile | null;
}

export interface CustomerListResponse {
  items: CustomerListItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface ConsentRecord {
  consent_record_id: string;
  channel_type: string;
  purpose_type: string;
  consent_status: string;
}

export interface CustomerEvent {
  customer_event_id: string;
  event_type: string;
  event_category: string;
  event_time: string;
  source_system: string;
  channel_type: string | null;
  severity: string | null;
  event_payload_json: string | null;
}

export interface CustomerDetail {
  party: CustomerListItem;
  identities: PartyIdentity[];
  contact_points: ContactPoint[];
  profile: CustomerProfile | null;
  recent_events: CustomerEvent[];
  consents: ConsentRecord[];
}

export interface AuditLogItem {
  audit_log_id: string;
  object_type: string;
  object_id: string;
  action: string;
  operator_id: string | null;
  operator_name: string | null;
  before_value: string | null;
  after_value: string | null;
  created_at: string;
}

export interface AuditLogResponse {
  items: AuditLogItem[];
  total: number;
  page: number;
  page_size: number;
}

// ── API Functions ──

export async function fetchCustomerList(params: {
  page?: number;
  page_size?: number;
  keyword?: string;
  status?: string;
}): Promise<CustomerListResponse> {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.page_size) qs.set('page_size', String(params.page_size));
  if (params.keyword) qs.set('keyword', params.keyword);
  if (params.status) qs.set('status', params.status);
  return cdpFetch(`/customers?${qs}`);
}

export async function fetchCustomerDetail(partyId: string): Promise<CustomerDetail> {
  return cdpFetch(`/customers/${partyId}`);
}

export async function updateCustomer(partyId: string, data: {
  display_name?: string;
  status?: string;
}): Promise<{ ok: boolean }> {
  return cdpFetch(`/customers/${partyId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function fetchAuditLogs(params: {
  page?: number;
  page_size?: number;
  object_type?: string;
  object_id?: string;
  operator_id?: string;
  action?: string;
}): Promise<AuditLogResponse> {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.page_size) qs.set('page_size', String(params.page_size));
  if (params.object_type) qs.set('object_type', params.object_type);
  if (params.object_id) qs.set('object_id', params.object_id);
  if (params.operator_id) qs.set('operator_id', params.operator_id);
  if (params.action) qs.set('action', params.action);
  return cdpFetch(`/audit-logs?${qs}`);
}

// ── P1: Tags ──

export interface TagItem {
  tag_id: string;
  tag_name: string;
  tag_category: string | null;
  tag_type: string;
  description: string | null;
  status: string;
  cover_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TagListResponse {
  items: TagItem[];
  total: number;
  page: number;
  page_size: number;
}

export async function fetchTags(params: {
  page?: number;
  page_size?: number;
  category?: string;
  tag_type?: string;
  status?: string;
  keyword?: string;
}): Promise<TagListResponse> {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.page_size) qs.set('page_size', String(params.page_size));
  if (params.category) qs.set('category', params.category);
  if (params.tag_type) qs.set('tag_type', params.tag_type);
  if (params.status) qs.set('status', params.status);
  if (params.keyword) qs.set('keyword', params.keyword);
  return cdpFetch(`/tags?${qs}`);
}

export async function createTag(data: {
  tag_name: string;
  tag_category?: string;
  tag_type?: string;
  description?: string;
}): Promise<{ tag_id: string; tag_name: string }> {
  return cdpFetch('/tags', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateTag(tagId: string, data: {
  tag_name?: string;
  tag_category?: string;
  description?: string;
  status?: string;
}): Promise<{ ok: boolean }> {
  return cdpFetch(`/tags/${tagId}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteTag(tagId: string): Promise<{ ok: boolean }> {
  return cdpFetch(`/tags/${tagId}`, { method: 'DELETE' });
}

// ── P1: Blacklist ──

export interface BlacklistItem {
  blacklist_id: string;
  party_id: string;
  reason: string;
  source: string;
  operator_name: string | null;
  status: string;
  created_at: string;
  removed_at: string | null;
  removed_by: string | null;
  display_name: string | null;
  primary_phone: string | null;
}

export interface BlacklistListResponse {
  items: BlacklistItem[];
  total: number;
  page: number;
  page_size: number;
}

export async function fetchBlacklist(params: {
  page?: number;
  page_size?: number;
  status?: string;
}): Promise<BlacklistListResponse> {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.page_size) qs.set('page_size', String(params.page_size));
  if (params.status) qs.set('status', params.status);
  return cdpFetch(`/blacklist?${qs}`);
}

export async function addToBlacklist(data: {
  party_id: string;
  reason: string;
}): Promise<{ blacklist_id: string }> {
  return cdpFetch('/blacklist', { method: 'POST', body: JSON.stringify(data) });
}

export async function removeFromBlacklist(blacklistId: string): Promise<{ ok: boolean }> {
  return cdpFetch(`/blacklist/${blacklistId}/remove`, { method: 'PATCH' });
}

// ── P2: Segments ──

export interface SegmentItem {
  segment_id: string;
  segment_name: string;
  segment_type: string;
  description: string | null;
  conditions: string | null;
  estimated_count: number;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SegmentListResponse {
  items: SegmentItem[];
  total: number;
  page: number;
  page_size: number;
}

export async function fetchSegments(params: {
  page?: number;
  page_size?: number;
  status?: string;
}): Promise<SegmentListResponse> {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.page_size) qs.set('page_size', String(params.page_size));
  if (params.status) qs.set('status', params.status);
  return cdpFetch(`/segments?${qs}`);
}

export async function createSegment(data: {
  segment_name: string;
  segment_type?: string;
  description?: string;
  conditions?: unknown;
}): Promise<{ segment_id: string }> {
  return cdpFetch('/segments', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateSegment(segmentId: string, data: Record<string, unknown>): Promise<{ ok: boolean }> {
  return cdpFetch(`/segments/${segmentId}`, { method: 'PATCH', body: JSON.stringify(data) });
}

// ── P2: Lifecycle ──

export interface LifecycleStage {
  stage_id: string;
  stage_name: string;
  stage_order: number;
  description: string | null;
  color: string | null;
  status: string;
  party_count: number;
}

export async function fetchLifecycleStages(): Promise<{ items: LifecycleStage[] }> {
  return cdpFetch('/lifecycle/stages');
}

export async function fetchLifecycleFunnel(): Promise<{
  funnel: Array<{ stage_id: string; stage_name: string; stage_order: number; color: string | null; party_count: number }>;
}> {
  return cdpFetch('/lifecycle/funnel');
}

// ── P2: Import/Export Tasks ──

export interface ImportExportTask {
  task_id: string;
  task_type: string;
  task_name: string | null;
  status: string;
  file_name: string | null;
  total_count: number;
  success_count: number;
  fail_count: number;
  fail_detail: string | null;
  operator_name: string | null;
  created_at: string;
  finished_at: string | null;
}

export interface TaskListResponse {
  items: ImportExportTask[];
  total: number;
  page: number;
  page_size: number;
}

export async function fetchTasks(params: {
  page?: number;
  page_size?: number;
  task_type?: string;
  status?: string;
}): Promise<TaskListResponse> {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.page_size) qs.set('page_size', String(params.page_size));
  if (params.task_type) qs.set('task_type', params.task_type);
  if (params.status) qs.set('status', params.status);
  return cdpFetch(`/tasks?${qs}`);
}

export async function retryTask(taskId: string): Promise<{ ok: boolean }> {
  return cdpFetch(`/tasks/${taskId}/retry`, { method: 'POST' });
}

// ── P2: Resolution Cases (reuse existing CDP API) ──

export interface ResolutionCase {
  resolution_case_id: string;
  left_entity_type: string;
  left_entity_id: string;
  right_entity_type: string;
  right_entity_id: string;
  suggested_action: string;
  match_score: number | null;
  status: string;
  review_reason: string | null;
  created_at: string;
}

export async function fetchResolutionCases(params: {
  status?: string;
}): Promise<{ items: ResolutionCase[] }> {
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);
  return cdpFetch(`/resolution-cases?${qs}` as `/resolution-cases?${string}`);
}

export async function updateResolutionCase(caseId: string, data: {
  status: string;
  reviewed_by?: string;
}): Promise<{ ok: boolean }> {
  return cdpFetch(`/resolution-cases/${caseId}`, { method: 'PATCH', body: JSON.stringify(data) });
}
