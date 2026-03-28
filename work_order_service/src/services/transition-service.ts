/**
 * transition-service.ts — 状态流转 + 事件写入
 */
import { db, workItems, workItemEvents, eq } from "../db.js";
import { validateWorkOrderTransition } from "../policies/transition-policy.js";
import type { WorkItemStatus, WorkOrderAction } from "../types.js";

/**
 * 执行 Work Order 状态流转（§7.3 POST /:id/transition）
 */
export async function transitionWorkOrder(
  itemId: string,
  action: WorkOrderAction,
  actor?: string,
  note?: string,
): Promise<{ success: boolean; from?: WorkItemStatus; to?: WorkItemStatus; error?: string }> {
  const item = await db.select().from(workItems).where(eq(workItems.id, itemId)).get();
  if (!item) return { success: false, error: `工单 ${itemId} 不存在` };

  const currentStatus = item.status as WorkItemStatus;
  const result = validateWorkOrderTransition(currentStatus, action);
  if (!result.valid || !result.toStatus) {
    return { success: false, error: result.error };
  }

  const now = new Date().toISOString();
  const toStatus = result.toStatus;

  // 更新状态
  const updates: Record<string, unknown> = {
    status: toStatus,
    updated_at: now,
  };
  if (toStatus === 'closed') updates.closed_at = now;
  if (toStatus === 'cancelled') updates.cancelled_at = now;
  if (toStatus.startsWith('waiting_')) {
    updates.waiting_on_type = toStatus.replace('waiting_', '');
  } else {
    updates.waiting_on_type = null;
  }

  await db.update(workItems).set(updates).where(eq(workItems.id, itemId)).run();

  // 写事件
  await db.insert(workItemEvents).values({
    item_id: itemId,
    event_type: 'status_changed',
    actor_type: actor ? 'user' : 'system',
    actor_id: actor ?? null,
    visibility: 'internal',
    note: note ?? null,
    payload_json: JSON.stringify({ action, from: currentStatus, to: toStatus }),
    created_at: now,
  }).run();

  return { success: true, from: currentStatus, to: toStatus };
}
