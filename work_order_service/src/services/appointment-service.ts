/**
 * appointment-service.ts — 预约生命周期管理
 */
import { db, workItems, workOrders, appointments, workItemEvents, eq, and } from "../db.js";
import { validateAppointmentTransition, BOOKING_TO_ITEM_STATUS } from "../policies/transition-policy.js";
import { deriveParentStatusFromAppointment, shouldRevertParentOnCancel } from "../policies/parent-sync-policy.js";
import { createWorkItem } from "./item-service.js";
import type { AppointmentAction, BookingStatus, VerificationMode } from "../types.js";

/**
 * 为 Work Order 创建预约（§7.3 POST /:id/appointments）
 */
export async function createAppointment(parentId: string, data: {
  appointment_type: string;
  category_code?: string;
  scheduled_start_at?: string;
  scheduled_end_at?: string;
  location_text?: string;
  resource_id?: string;
  created_by?: string;
}) {
  // 验证 parent 存在
  const parent = await db.select().from(workItems).where(eq(workItems.id, parentId)).get();
  if (!parent) return { success: false, error: `父工单 ${parentId} 不存在` };

  // 父子分类校验
  if (parent.category_code) {
    const { validateParentChildRelation } = await import('./category-service.js');
    const check = await validateParentChildRelation(parent.category_code, 'appointment', data.category_code);
    if (!check.valid) return { success: false, error: check.error };
  }

  // 创建 work_item
  const { id } = await createWorkItem({
    type: 'appointment',
    subtype: data.appointment_type,
    category_code: data.category_code,
    title: `预约: ${data.appointment_type}`,
    customer_phone: parent.customer_phone ?? undefined,
    customer_name: parent.customer_name ?? undefined,
    parent_id: parentId,
    priority: parent.priority ?? 'medium',
    queue_code: parent.queue_code ?? undefined,
    created_by: data.created_by,
  });

  // 更新 work_item 状态为 scheduled
  await db.update(workItems).set({
    status: 'scheduled',
    updated_at: new Date().toISOString(),
  }).where(eq(workItems.id, id)).run();

  // 插入 appointment 详情
  await db.insert(appointments).values({
    item_id: id,
    appointment_type: data.appointment_type,
    resource_id: data.resource_id ?? null,
    scheduled_start_at: data.scheduled_start_at ?? null,
    scheduled_end_at: data.scheduled_end_at ?? null,
    booking_status: 'proposed',
    location_text: data.location_text ?? null,
  }).run();

  // 推进父工单状态到 scheduled（如果当前允许）
  const parentStatus = parent.status;
  if (parentStatus === 'open' || parentStatus === 'new') {
    await db.update(workItems).set({
      status: 'scheduled',
      updated_at: new Date().toISOString(),
    }).where(eq(workItems.id, parentId)).run();
  }

  // 写 appointment_created 事件到父工单
  const now = new Date().toISOString();
  await db.insert(workItemEvents).values({
    item_id: parentId,
    event_type: 'appointment_created',
    actor_type: data.created_by ? 'user' : 'system',
    actor_id: data.created_by ?? null,
    visibility: 'internal',
    note: null,
    payload_json: JSON.stringify({ appointment_id: id, appointment_type: data.appointment_type }),
    created_at: now,
  }).run();

  return { success: true, id };
}

/**
 * 执行预约状态流转
 */
async function transitionAppointment(
  itemId: string,
  action: AppointmentAction,
  extra?: { actor?: string; note?: string; payload?: Record<string, unknown> },
): Promise<{ success: boolean; error?: string }> {
  const apt = await db.select().from(appointments).where(eq(appointments.item_id, itemId)).get();
  if (!apt) return { success: false, error: `预约 ${itemId} 不存在` };

  const result = validateAppointmentTransition(apt.booking_status as BookingStatus, action);
  if (!result.valid || !result.toBookingStatus || !result.toStatus) {
    return { success: false, error: result.error };
  }

  const now = new Date().toISOString();

  // 更新 appointment 详情
  const aptUpdates: Record<string, unknown> = { booking_status: result.toBookingStatus };
  if (action === 'check_in') aptUpdates.actual_start_at = now;
  if (action === 'complete') aptUpdates.actual_end_at = now;
  if (action === 'reschedule') aptUpdates.reschedule_count = (apt.reschedule_count ?? 0) + 1;
  if (action === 'no_show') aptUpdates.no_show_reason = extra?.payload?.reason as string ?? 'unknown';

  await db.update(appointments).set(aptUpdates).where(eq(appointments.item_id, itemId)).run();

  // 同步更新 work_items 主状态
  await db.update(workItems).set({
    status: result.toStatus,
    updated_at: now,
  }).where(eq(workItems.id, itemId)).run();

  // 写事件
  await db.insert(workItemEvents).values({
    item_id: itemId,
    event_type: action === 'reschedule' ? 'appointment_rescheduled'
      : action === 'no_show' ? 'customer_no_show'
      : 'status_changed',
    actor_type: extra?.actor ? 'user' : 'system',
    actor_id: extra?.actor ?? null,
    visibility: 'internal',
    note: extra?.note ?? null,
    payload_json: JSON.stringify({ action, from: apt.booking_status, to: result.toBookingStatus, ...extra?.payload }),
    created_at: now,
  }).run();

  // 预约状态变更驱动父工单状态
  const item = await db.select().from(workItems).where(eq(workItems.id, itemId)).get();
  if (item?.parent_id) {
    let parentStatusUpdate: string | null;

    if (action === 'cancel') {
      // cancel 时检查兄弟预约
      const siblings = await db.select({ booking_status: appointments.booking_status })
        .from(appointments)
        .innerJoin(workItems, eq(appointments.item_id, workItems.id))
        .where(and(eq(workItems.parent_id, item.parent_id), eq(workItems.type, 'appointment')))
        .all();
      const siblingStatuses = siblings
        .filter(s => s.booking_status !== null)
        .map(s => s.booking_status as BookingStatus);
      parentStatusUpdate = shouldRevertParentOnCancel(siblingStatuses);
    } else if (action === 'complete') {
      // complete 时读父单 verification_mode
      const parentDetail = await db.select().from(workOrders).where(eq(workOrders.item_id, item.parent_id)).get();
      const vMode = (parentDetail?.verification_mode ?? 'none') as VerificationMode;
      parentStatusUpdate = deriveParentStatusFromAppointment(action, result.toBookingStatus!, vMode);
    } else {
      parentStatusUpdate = deriveParentStatusFromAppointment(action, result.toBookingStatus!);
    }

    // 通知 workflow 引擎子项状态变更（完成/取消/爽约均视为"子项终结"）
    if (['complete', 'cancel', 'no_show'].includes(action)) {
      const { onChildCompleted } = await import('./workflow-service.js');
      await onChildCompleted(item.parent_id);
    }

    if (parentStatusUpdate) {
      await db.update(workItems).set({
        status: parentStatusUpdate,
        waiting_on_type: parentStatusUpdate.startsWith('waiting_') ? parentStatusUpdate.replace('waiting_', '') : null,
        updated_at: now,
      }).where(eq(workItems.id, item.parent_id)).run();

      // 写事件到父工单
      await db.insert(workItemEvents).values({
        item_id: item.parent_id,
        event_type: 'status_changed',
        actor_type: 'system',
        visibility: 'internal',
        note: `预约 ${action} 触发父工单状态变更`,
        payload_json: JSON.stringify({
          triggered_by: 'appointment',
          appointment_id: itemId,
          appointment_action: action,
          to: parentStatusUpdate,
        }),
        created_at: now,
      }).run();
    }
  }

  return { success: true };
}

export async function confirmAppointment(id: string, data?: { resource_id?: string; actor?: string }) {
  if (data?.resource_id) {
    await db.update(appointments).set({ resource_id: data.resource_id }).where(eq(appointments.item_id, id)).run();
  }
  return transitionAppointment(id, 'confirm', { actor: data?.actor });
}

export async function rescheduleAppointment(id: string, data: {
  scheduled_start_at: string;
  scheduled_end_at?: string;
  reason?: string;
  actor?: string;
}) {
  await db.update(appointments).set({
    scheduled_start_at: data.scheduled_start_at,
    scheduled_end_at: data.scheduled_end_at ?? null,
  }).where(eq(appointments.item_id, id)).run();

  return transitionAppointment(id, 'reschedule', {
    actor: data.actor,
    payload: { reason: data.reason },
  });
}

export async function checkInAppointment(id: string, actor?: string) {
  return transitionAppointment(id, 'check_in', { actor });
}

export async function startAppointment(id: string, actor?: string) {
  return transitionAppointment(id, 'start', { actor });
}

export async function completeAppointment(id: string, actor?: string) {
  return transitionAppointment(id, 'complete', { actor });
}

export async function noShowAppointment(id: string, data?: { reason?: string; actor?: string }) {
  return transitionAppointment(id, 'no_show', {
    actor: data?.actor,
    payload: { reason: data?.reason },
  });
}

export async function cancelAppointment(id: string, actor?: string) {
  return transitionAppointment(id, 'cancel', { actor });
}
