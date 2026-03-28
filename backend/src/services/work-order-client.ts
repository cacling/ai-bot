/**
 * work-order-client.ts — Work Order Service 轻量 HTTP 适配器
 *
 * 封装对 work_order_service 的调用，被 skill-runtime 和 chat-ws 使用。
 * Fire-and-forget 模式：调用失败只记日志不阻塞主流程。
 */
import { logger } from './logger';

const WO_URL = process.env.WORK_ORDER_URL ?? 'http://127.0.0.1:18009';

async function postJSON(path: string, body: Record<string, unknown>): Promise<{ ok: boolean; data?: any; error?: string }> {
  try {
    const res = await fetch(`${WO_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      logger.warn('work-order-client', 'api_error', { path, status: res.status, error: data?.error });
      return { ok: false, error: data?.error ?? `HTTP ${res.status}` };
    }
    return { ok: true, data };
  } catch (err) {
    logger.error('work-order-client', 'fetch_failed', { path, error: String(err) });
    return { ok: false, error: String(err) };
  }
}

/**
 * 从 Skill 的 human 步骤创建 Ticket
 */
export async function createTicketFromSkill(opts: {
  session_id: string;
  phone: string;
  customer_name?: string;
  skill_id: string;
  skill_version?: number;
  step_id: string;
  instance_id: string;
  title: string;
  summary?: string;
  ticket_category: string;
  category_code?: string;
  channel?: string;
  queue_code?: string;
  priority?: string;
}) {
  const result = await postJSON('/api/tickets', {
    title: opts.title,
    summary: opts.summary,
    customer_phone: opts.phone,
    customer_name: opts.customer_name,
    ticket_category: opts.ticket_category,
    category_code: opts.category_code,
    channel: opts.channel ?? 'online',
    source_session_id: opts.session_id,
    source_skill_id: opts.skill_id,
    queue_code: opts.queue_code,
    priority: opts.priority,
    created_by: 'system',
  });

  if (result.ok) {
    logger.info('work-order-client', 'ticket_created', {
      session: opts.session_id,
      skill: opts.skill_id,
      step: opts.step_id,
      ticket_id: result.data?.id,
    });
  }
  return result;
}

/**
 * 从 Skill 创建 Work Order
 */
export async function createWorkOrderFromSkill(opts: {
  session_id: string;
  phone: string;
  customer_name?: string;
  skill_id: string;
  skill_version?: number;
  step_id: string;
  instance_id: string;
  title: string;
  summary?: string;
  work_type: string;
  execution_mode?: string;
  category_code?: string;
  channel?: string;
  queue_code?: string;
  priority?: string;
  parent_id?: string;
}) {
  const result = await postJSON('/api/work-orders', {
    title: opts.title,
    summary: opts.summary,
    customer_phone: opts.phone,
    customer_name: opts.customer_name,
    work_type: opts.work_type,
    execution_mode: opts.execution_mode ?? 'manual',
    category_code: opts.category_code,
    channel: opts.channel ?? 'online',
    source_session_id: opts.session_id,
    source_skill_id: opts.skill_id,
    queue_code: opts.queue_code,
    priority: opts.priority,
    parent_id: opts.parent_id,
    created_by: 'system',
  });

  if (result.ok) {
    logger.info('work-order-client', 'work_order_created', {
      session: opts.session_id,
      skill: opts.skill_id,
      step: opts.step_id,
      work_order_id: result.data?.id,
    });
  }
  return result;
}

/**
 * 为已有工单创建预约
 */
export async function createAppointmentFromSkill(
  parentId: string,
  opts: {
    appointment_type: string;
    category_code?: string;
    scheduled_start_at?: string;
    location_text?: string;
  },
) {
  const result = await postJSON(`/api/work-orders/${parentId}/appointments`, {
    appointment_type: opts.appointment_type,
    category_code: opts.category_code,
    scheduled_start_at: opts.scheduled_start_at,
    location_text: opts.location_text,
    created_by: 'system',
  });

  if (result.ok) {
    logger.info('work-order-client', 'appointment_created', {
      parent_id: parentId,
      appointment_id: result.data?.id,
    });
  }
  return result;
}

/**
 * 向等待中的 Workflow 发送信号
 */
export async function signalWorkflow(runId: string, signal: string, payload?: Record<string, unknown>) {
  const result = await postJSON(`/api/workflows/runs/${runId}/signal`, {
    signal,
    payload,
  });

  if (result.ok) {
    logger.info('work-order-client', 'workflow_signaled', { run_id: runId, signal });
  }
  return result;
}
