/**
 * Outbound Management API helpers
 *
 * All requests go through the backend outbound proxy → outbound_service:18021
 */

const OB_BASE = '/api/outbound';

async function obFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${OB_BASE}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Outbound API error: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Types ──

export interface Campaign {
  campaign_id: string;
  campaign_name: string;
  offer_type: 'plan_upgrade' | 'roaming_pack' | 'family_bundle' | 'retention';
  status: 'active' | 'paused' | 'ended';
  headline: string;
  benefit_summary: string;
  target_segment: string;
  recommended_plan_id: string | null;
  price_delta: number | null;
  valid_from: string;
  valid_until: string;
  created_at: string;
  updated_at: string;
}

export interface OutboundTask {
  id: string;
  phone: string;
  task_type: 'collection' | 'marketing';
  label_zh: string;
  label_en: string;
  data: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  campaign_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CallResult {
  result_id: string;
  task_id: string | null;
  phone: string;
  result: string;
  remark: string | null;
  callback_time: string | null;
  ptp_date: string | null;
  created_at: string;
}

export interface MarketingResult {
  record_id: string;
  campaign_id: string;
  phone: string;
  result: string;
  callback_time: string | null;
  is_dnd: number;
  recorded_at: string;
}

export interface CallbackTask {
  task_id: string;
  original_task_id: string;
  customer_name: string;
  callback_phone: string;
  preferred_time: string;
  product_name: string;
  status: 'pending' | 'completed' | 'cancelled';
  created_at: string;
}

export interface HandoffCase {
  case_id: string;
  phone: string;
  source_skill: string;
  reason: string;
  priority: 'low' | 'medium' | 'high';
  queue_name: string;
  status: 'open' | 'assigned' | 'resolved' | 'closed';
  created_at: string;
}

export interface DashboardStats {
  overall: {
    total_tasks: number;
    completed: number;
    in_progress: number;
    pending: number;
    total_results: number;
    connect_rate: number;
    conversion_rate: number;
    ptp_rate: number;
  };
  by_campaign: Array<{
    campaign_id: string;
    campaign_name: string;
    status: string;
    total_tasks: number;
    completed_tasks: number;
    total_results: number;
    connected: number;
    converted: number;
    connect_rate: number;
    conversion_rate: number;
  }>;
  result_distribution: Record<string, number>;
}

// ── API functions ──

export async function fetchCampaigns(status?: string): Promise<Campaign[]> {
  const qs = status ? `?status=${status}` : '';
  const data = await obFetch<{ campaigns: Campaign[] }>(`/campaigns${qs}`);
  return data.campaigns;
}

export async function fetchCampaign(id: string): Promise<Campaign> {
  return obFetch<Campaign>(`/campaigns/${id}`);
}

export async function createCampaign(body: Partial<Campaign> & { campaign_id: string; campaign_name: string }): Promise<{ ok: boolean; campaign_id: string }> {
  return obFetch('/campaigns', { method: 'POST', body: JSON.stringify(body) });
}

export async function updateCampaign(id: string, body: Partial<Campaign>): Promise<{ ok: boolean }> {
  return obFetch(`/campaigns/${id}`, { method: 'PUT', body: JSON.stringify(body) });
}

export async function fetchTasks(type?: string): Promise<OutboundTask[]> {
  const qs = type ? `?type=${type}` : '';
  const data = await obFetch<{ tasks: OutboundTask[] }>(`/tasks${qs}`);
  return data.tasks;
}

export async function fetchTask(id: string): Promise<OutboundTask> {
  return obFetch<OutboundTask>(`/tasks/${id}`);
}

export async function updateTask(id: string, body: Partial<OutboundTask>): Promise<{ ok: boolean }> {
  return obFetch(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(body) });
}

export async function fetchCallResults(taskId?: string): Promise<CallResult[]> {
  const qs = taskId ? `?task_id=${taskId}` : '';
  const data = await obFetch<{ results: CallResult[] }>(`/results/call-results${qs}`);
  return data.results;
}

export async function fetchMarketingResults(campaignId?: string): Promise<MarketingResult[]> {
  const qs = campaignId ? `?campaign_id=${campaignId}` : '';
  const data = await obFetch<{ results: MarketingResult[] }>(`/results/marketing-results${qs}`);
  return data.results;
}

export async function fetchCallbacks(): Promise<CallbackTask[]> {
  const data = await obFetch<{ callbacks: CallbackTask[] }>('/tasks/callbacks');
  return data.callbacks;
}

export async function fetchHandoffCases(): Promise<HandoffCase[]> {
  const data = await obFetch<{ items: HandoffCase[] }>('/results/handoff-cases');
  return data.items;
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
  return obFetch<DashboardStats>('/dashboard');
}
