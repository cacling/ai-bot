/**
 * wfm.ts — 排班相关 Activity（P4）
 *
 * 所有 Activity 通过 HTTP 调 wfm_service API，不直接碰业务库。
 */
import { SERVICE_URLS } from '../config.js';

const WFM_BASE = `${SERVICE_URLS.wfm}/api/wfm`;

export async function createPlan(
  date: string,
  planName: string,
  groupId?: string,
): Promise<{ id: number; name: string; status: string }> {
  // Use date as both start and end for a single-day plan
  const resp = await fetch(`${WFM_BASE}/plans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: planName,
      startDate: date,
      endDate: date,
      groupId,
    }),
  });
  if (!resp.ok) throw new Error(`createPlan failed: ${resp.status}`);
  return resp.json();
}

export async function generateSchedule(
  planId: number,
): Promise<{ planId: number; status: string; entries?: unknown }> {
  const resp = await fetch(`${WFM_BASE}/plans/${planId}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!resp.ok) throw new Error(`generateSchedule failed: ${resp.status}`);
  return resp.json();
}

export async function validatePublish(
  planId: number,
): Promise<{ results: Array<{ date: string; valid: boolean; errors: string[] }> }> {
  const resp = await fetch(`${WFM_BASE}/plans/${planId}/publish/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!resp.ok) throw new Error(`validatePublish failed: ${resp.status}`);
  return resp.json();
}

export async function publishPlan(
  planId: number,
  publishedBy?: string,
): Promise<{ planId: number; status: string; versionNo: number }> {
  const resp = await fetch(`${WFM_BASE}/plans/${planId}/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publishedBy }),
  });
  if (!resp.ok) throw new Error(`publishPlan failed: ${resp.status}`);
  return resp.json();
}

export async function notifyAgents(
  planId: number,
): Promise<{ ok: boolean }> {
  // P4 mock: notify endpoint doesn't exist yet
  // In the future, this would call POST /api/wfm/internal/notify-agents
  console.log(`[wfm] notifyAgents mock: planId=${planId}`);
  return { ok: true };
}
