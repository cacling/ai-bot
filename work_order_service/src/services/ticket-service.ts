/**
 * ticket-service.ts — Ticket 生命周期管理
 */
import { db, workItems, tickets, workItemEvents, eq } from "../db.js";
import { validateTicketTransition } from "../policies/transition-policy.js";
import { createWorkItem } from "./item-service.js";
import type { TicketAction, WorkItemStatus } from "../types.js";

/**
 * 创建 Ticket
 */
export async function createTicket(data: {
  title: string;
  summary?: string;
  description?: string;
  customer_phone?: string;
  customer_name?: string;
  channel?: string;
  source_session_id?: string;
  source_skill_id?: string;
  source_step_id?: string;
  source_instance_id?: string;
  priority?: string;
  severity?: string;
  queue_code?: string;
  owner_id?: string;
  ticket_category: string;
  issue_type?: string;
  intent_code?: string;
  category_code?: string;
  created_by?: string;
}) {
  // 分类默认值解析
  let catDefaults: { default_queue_code?: string | null; default_priority?: string | null; default_workflow_key?: string | null } | null = null;
  if (data.category_code) {
    const { resolveCategoryDefaults } = await import('./category-service.js');
    catDefaults = await resolveCategoryDefaults(data.category_code);
  }

  const { id, root_id } = await createWorkItem({
    type: 'ticket',
    subtype: data.ticket_category,
    category_code: data.category_code,
    title: data.title,
    summary: data.summary,
    description: data.description,
    customer_phone: data.customer_phone,
    customer_name: data.customer_name,
    channel: data.channel,
    source_session_id: data.source_session_id,
    source_skill_id: data.source_skill_id,
    source_step_id: data.source_step_id,
    source_instance_id: data.source_instance_id,
    priority: data.priority ?? catDefaults?.default_priority ?? undefined,
    severity: data.severity,
    queue_code: data.queue_code ?? catDefaults?.default_queue_code ?? undefined,
    owner_id: data.owner_id,
    created_by: data.created_by,
  });

  await db.insert(tickets).values({
    item_id: id,
    ticket_category: data.ticket_category,
    issue_type: data.issue_type ?? null,
    intent_code: data.intent_code ?? null,
  }).run();

  // 分类绑定的 workflow 自动启动
  if (catDefaults?.default_workflow_key) {
    const { startWorkflowRun } = await import('./workflow-service.js');
    await startWorkflowRun(catDefaults.default_workflow_key, id);
  }

  return { success: true, id, root_id };
}

/**
 * Ticket 状态流转
 */
export async function transitionTicket(
  itemId: string,
  action: TicketAction,
  actor?: string,
  note?: string,
): Promise<{ success: boolean; error?: string; from?: string; to?: string }> {
  const item = await db.select().from(workItems).where(eq(workItems.id, itemId)).get();
  if (!item) return { success: false, error: `Ticket ${itemId} 不存在` };
  if (item.type !== 'ticket') return { success: false, error: `${itemId} 不是 Ticket` };

  const result = validateTicketTransition(item.status as WorkItemStatus, action);
  if (!result.valid || !result.toStatus) {
    return { success: false, error: result.error };
  }

  const now = new Date().toISOString();

  await db.update(workItems).set({
    status: result.toStatus,
    waiting_on_type: result.toStatus.startsWith('waiting_') ? result.toStatus.replace('waiting_', '') : null,
    closed_at: result.toStatus === 'closed' ? now : undefined,
    cancelled_at: result.toStatus === 'cancelled' ? now : undefined,
    updated_at: now,
  }).where(eq(workItems.id, itemId)).run();

  // resolve 时写 resolution 到 ticket detail
  if (action === 'resolve' && note) {
    await db.update(tickets).set({
      resolution_summary: note,
    }).where(eq(tickets.item_id, itemId)).run();
  }

  await db.insert(workItemEvents).values({
    item_id: itemId,
    event_type: action === 'reopen' ? 'reopened' : action === 'close' ? 'closed' : 'status_changed',
    actor_type: actor ? 'user' : 'system',
    actor_id: actor ?? null,
    visibility: 'internal',
    note: note ?? null,
    payload_json: JSON.stringify({ action, from: item.status, to: result.toStatus }),
    created_at: now,
  }).run();

  return { success: true, from: item.status, to: result.toStatus };
}

/**
 * 从 Ticket 创建子项（子工单或子任务）
 */
export async function createChildFromTicket(
  ticketId: string,
  childData: {
    type: 'work_order' | 'task';
    subtype?: string;
    category_code?: string;
    title: string;
    queue_code?: string;
    owner_id?: string;
    priority?: string;
    created_by?: string;
  },
) {
  const parent = await db.select().from(workItems).where(eq(workItems.id, ticketId)).get();
  if (!parent) return { success: false, error: `Ticket ${ticketId} 不存在` };

  // 父子分类校验
  if (parent.category_code) {
    const { validateParentChildRelation } = await import('./category-service.js');
    const check = await validateParentChildRelation(parent.category_code, childData.type, childData.category_code);
    if (!check.valid) return { success: false, error: check.error };
  }

  const { id } = await createWorkItem({
    type: childData.type,
    subtype: childData.subtype,
    category_code: childData.category_code,
    title: childData.title,
    customer_phone: parent.customer_phone ?? undefined,
    customer_name: parent.customer_name ?? undefined,
    parent_id: ticketId,
    priority: childData.priority ?? parent.priority ?? 'medium',
    queue_code: childData.queue_code,
    owner_id: childData.owner_id,
    created_by: childData.created_by,
  });

  // 写 child_created 事件
  const now = new Date().toISOString();
  await db.insert(workItemEvents).values({
    item_id: ticketId,
    event_type: 'child_created',
    actor_type: childData.created_by ? 'user' : 'system',
    actor_id: childData.created_by ?? null,
    visibility: 'internal',
    note: null,
    payload_json: JSON.stringify({ child_id: id, child_type: childData.type }),
    created_at: now,
  }).run();

  return { success: true, id };
}
