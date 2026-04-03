/**
 * cdp-client.ts — HTTP client for cdp_service
 *
 * Proxies calls to the standalone CDP microservice (port 18020).
 * Replaces direct businessDb queries for subscriber/customer data.
 */

import { logger } from './logger';

const CDP_BASE = process.env.CDP_SERVICE_URL ?? `http://localhost:${process.env.CDP_SERVICE_PORT ?? 18020}`;

async function cdpFetch<T>(path: string, options?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`${CDP_BASE}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options?.headers },
    });
    if (!res.ok) {
      logger.warn('cdp-client', 'fetch_error', { path, status: res.status });
      return null;
    }
    return await res.json() as T;
  } catch (e) {
    logger.warn('cdp-client', 'fetch_failed', { path, error: String(e) });
    return null;
  }
}

// ── Identity Resolve ──────────────────────────────────────────────────────

interface ResolveResult {
  resolved: boolean;
  party_id?: string;
  party_type?: string;
  display_name?: string;
}

export async function resolveIdentity(phone: string): Promise<ResolveResult | null> {
  return cdpFetch<ResolveResult>('/api/cdp/identity/resolve', {
    method: 'POST',
    body: JSON.stringify({ identity_type: 'phone', identity_value: phone }),
  });
}

// ── Subscriber Info (兼容 chat-ws / voice 使用) ──────────────────────────

export interface SubscriberInfo {
  name: string;
  gender: string;
  planName: string;
  partyId: string;
}

interface CustomerContext {
  party: { party_id: string; display_name: string | null };
  identities: Array<{ identity_type: string; identity_value: string }>;
  contact_points: Array<{ contact_type: string; contact_value: string }>;
  subscriptions: Array<{
    plan_code: string | null;
    subscription_type: string;
    service_status: string;
    account_no: string;
  }>;
  profile: {
    basic_profile_json: string | null;
    service_profile_json: string | null;
  } | null;
}

/**
 * 获取订户信息 — 替代直接读 businessDb subscribers + plans 表
 *
 * 通过 CDP identity resolve → customer context API 获取。
 * 为兼容现有调用方，返回 { name, gender, planName } 格式。
 */
export async function getSubscriberInfo(phone: string): Promise<SubscriberInfo | null> {
  // 1. resolve identity
  const resolved = await resolveIdentity(phone);
  if (!resolved?.resolved || !resolved.party_id) return null;

  // 2. get full context
  const ctx = await cdpFetch<CustomerContext>(`/api/cdp/party/${resolved.party_id}/context`);
  if (!ctx) return null;

  // 3. extract gender from profile
  let gender = '';
  let planName = ctx.subscriptions[0]?.plan_code ?? '';
  if (ctx.profile?.basic_profile_json) {
    try {
      const basic = JSON.parse(ctx.profile.basic_profile_json);
      gender = basic.gender ?? '';
    } catch { /* ignore parse error */ }
  }
  if (ctx.profile?.service_profile_json) {
    try {
      const svc = JSON.parse(ctx.profile.service_profile_json);
      if (svc.plan_name) planName = svc.plan_name;
    } catch { /* ignore parse error */ }
  }

  return {
    name: ctx.party.display_name ?? '',
    gender,
    planName,
    partyId: resolved.party_id,
  };
}

/**
 * 获取客户等级 — 用于路由优先级决策
 *
 * 返回 customer_tier: 'vip' | 'premium' | 'standard' | 'delinquent' | null
 */
export async function getCustomerTier(partyId: string): Promise<string | null> {
  const ctx = await cdpFetch<CustomerContext>(`/api/cdp/party/${partyId}/context`);
  if (!ctx?.profile?.basic_profile_json) return null;
  try {
    const basic = JSON.parse(ctx.profile.basic_profile_json);
    return basic.customer_tier ?? null;
  } catch {
    return null;
  }
}
