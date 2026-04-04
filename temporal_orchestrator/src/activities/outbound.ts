import { SERVICE_URLS } from '../config.js';

// ─── Callback Activities ───

export async function getCallbackTask(callbackTaskId: string) {
  const resp = await fetch(
    `${SERVICE_URLS.outbound}/api/outbound/tasks/callbacks/${callbackTaskId}`,
  );
  if (!resp.ok) throw new Error(`getCallbackTask failed: ${resp.status}`);
  return await resp.json() as {
    task_id: string;
    original_task_id: string;
    customer_name: string;
    callback_phone: string;
    preferred_time: string;
    product_name: string;
    status: string;
  };
}

export async function updateCallbackStatus(
  callbackTaskId: string,
  status: 'in_progress' | 'completed' | 'cancelled' | 'rescheduled',
) {
  const resp = await fetch(
    `${SERVICE_URLS.outbound}/api/outbound/internal/callbacks/${callbackTaskId}/status`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    },
  );
  if (!resp.ok) throw new Error(`updateCallbackStatus failed: ${resp.status}`);
  return await resp.json() as { ok: boolean };
}

export async function triggerOutboundCall(callbackTaskId: string) {
  // 调 backend 内部 API 触发外呼（P2 阶段会改为调 POST /api/internal/outbound/initiate）
  // P1 阶段：通知坐席工作台有回拨到期，由坐席手动发起
  const resp = await fetch(
    `${SERVICE_URLS.backend}/api/internal/notify/workbench`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: 'callback_due',
        payload: { callback_task_id: callbackTaskId },
      }),
    },
  );
  if (!resp.ok) throw new Error(`triggerOutboundCall failed: ${resp.status}`);
  return await resp.json() as { delivered: boolean };
}

// ─── Outbound Task Activities (P2) ───

export async function getOutboundTask(taskId: string) {
  const resp = await fetch(
    `${SERVICE_URLS.outbound}/api/outbound/tasks/${taskId}`,
  );
  if (!resp.ok) throw new Error(`getOutboundTask failed: ${resp.status}`);
  return await resp.json() as {
    id: string;
    phone: string;
    task_type: 'collection' | 'marketing';
    status: string;
    data: string;
  };
}

export async function updateOutboundTaskStatus(
  taskId: string,
  status: 'in_progress' | 'completed' | 'cancelled' | 'dnd_blocked' | 'max_retry_reached',
) {
  const resp = await fetch(
    `${SERVICE_URLS.outbound}/api/outbound/internal/tasks/${taskId}/status`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    },
  );
  if (!resp.ok) throw new Error(`updateOutboundTaskStatus failed: ${resp.status}`);
  return await resp.json() as { ok: boolean };
}

export async function checkAllowedHours(taskType: string): Promise<{
  allowed: boolean;
  nextWindowAt?: string;
}> {
  const resp = await fetch(
    `${SERVICE_URLS.outbound}/api/outbound/internal/check-allowed-hours?task_type=${taskType}`,
  );
  if (!resp.ok) throw new Error(`checkAllowedHours failed: ${resp.status}`);
  return await resp.json() as { allowed: boolean; nextWindowAt?: string };
}

export async function checkDnd(phone: string): Promise<boolean> {
  const resp = await fetch(
    `${SERVICE_URLS.outbound}/api/outbound/internal/check-dnd?phone=${phone}`,
  );
  if (!resp.ok) throw new Error(`checkDnd failed: ${resp.status}`);
  const data = await resp.json() as { is_dnd: boolean };
  return data.is_dnd;
}

export async function initiateOutboundCall(taskId: string, sessionId?: string) {
  // 调 backend 内部 API 发起外呼（backend 负责创建 WS 会话和启动 GlmRealtimeController）
  const resp = await fetch(
    `${SERVICE_URLS.backend}/api/internal/outbound/initiate`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: taskId, session_id: sessionId }),
    },
  );
  if (!resp.ok) throw new Error(`initiateOutboundCall failed: ${resp.status}`);
  return await resp.json() as { session_id: string; status: string };
}

// ─── Handoff Activities ───

export async function createHandoffCase(input: {
  phone: string;
  sourceSkill: string;
  reason: string;
  queueName: string;
  priority?: string;
  idempotencyKey?: string;
}) {
  const resp = await fetch(
    `${SERVICE_URLS.outbound}/api/outbound/results/handoff-cases`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: input.phone,
        source_skill: input.sourceSkill,
        reason: input.reason,
        queue_name: input.queueName,
        priority: input.priority ?? 'medium',
        idempotency_key: input.idempotencyKey,
      }),
    },
  );
  if (!resp.ok) throw new Error(`createHandoffCase failed: ${resp.status}`);
  return await resp.json() as { ok: boolean; case_id: string };
}

export async function updateHandoffStatus(
  caseId: string,
  status: 'accepted' | 'resolved' | 'resumed_ai' | 'escalated',
) {
  const resp = await fetch(
    `${SERVICE_URLS.outbound}/api/outbound/internal/handoff-cases/${caseId}/status`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    },
  );
  if (!resp.ok) throw new Error(`updateHandoffStatus failed: ${resp.status}`);
  return await resp.json() as { ok: boolean };
}
