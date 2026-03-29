/**
 * task-service.ts — Task 生命周期管理
 */
import { db, workItems, tasks, workItemEvents, eq, and } from "../db.js";
import { validateTaskTransition } from "../policies/transition-policy.js";
import { shouldAutoAdvanceParent } from "../policies/parent-sync-policy.js";
import { createWorkItem } from "./item-service.js";
import type { TaskAction, WorkItemStatus } from "../types.js";

/**
 * 创建 Task（必须挂到父单）
 */
export async function createTask(parentId: string, data: {
  task_type: string;
  title: string;
  category_code?: string;
  owner_id?: string;
  due_at?: string;
  checklist_json?: string;
  depends_on_item_id?: string;
  auto_complete_on_event?: string;
  created_by?: string;
}) {
  const parent = await db.select().from(workItems).where(eq(workItems.id, parentId)).get();
  if (!parent) return { success: false, error: `父项 ${parentId} 不存在` };

  // 父子分类校验
  if (parent.category_code) {
    const { validateParentChildRelation } = await import('./category-service.js');
    const check = await validateParentChildRelation(parent.category_code, 'task', data.category_code);
    if (!check.valid) return { success: false, error: check.error };
  }

  const { id } = await createWorkItem({
    type: 'task',
    subtype: data.task_type,
    category_code: data.category_code,
    title: data.title,
    customer_phone: parent.customer_phone ?? undefined,
    customer_name: parent.customer_name ?? undefined,
    parent_id: parentId,
    priority: parent.priority ?? 'medium',
    queue_code: parent.queue_code ?? undefined,
    owner_id: data.owner_id,
    due_at: data.due_at,
    created_by: data.created_by,
  });

  await db.insert(tasks).values({
    item_id: id,
    task_type: data.task_type,
    checklist_json: data.checklist_json ?? null,
    depends_on_item_id: data.depends_on_item_id ?? null,
    auto_complete_on_event: data.auto_complete_on_event ?? null,
  }).run();

  // 写 child_created 事件到父单
  const now = new Date().toISOString();
  await db.insert(workItemEvents).values({
    item_id: parentId,
    event_type: 'child_created',
    actor_type: data.created_by ? 'user' : 'system',
    actor_id: data.created_by ?? null,
    visibility: 'internal',
    note: null,
    payload_json: JSON.stringify({ child_id: id, child_type: 'task', task_type: data.task_type }),
    created_at: now,
  }).run();

  return { success: true, id };
}

/**
 * 执行 Task 状态流转
 */
async function transitionTask(
  itemId: string,
  action: TaskAction,
  extra?: { actor?: string; note?: string },
): Promise<{ success: boolean; error?: string; from?: string; to?: string }> {
  const item = await db.select().from(workItems).where(eq(workItems.id, itemId)).get();
  if (!item) return { success: false, error: `Task ${itemId} 不存在` };
  if (item.type !== 'task') return { success: false, error: `${itemId} 不是 Task` };

  const result = validateTaskTransition(item.status as WorkItemStatus, action);
  if (!result.valid || !result.toStatus) {
    return { success: false, error: result.error };
  }

  const now = new Date().toISOString();

  // 更新 work_items 状态
  await db.update(workItems).set({
    status: result.toStatus,
    waiting_on_type: result.toStatus === 'waiting_internal' ? 'internal' : null,
    updated_at: now,
  }).where(eq(workItems.id, itemId)).run();

  // 完成时写 task detail
  if (action === 'complete') {
    await db.update(tasks).set({
      completed_by: extra?.actor ?? null,
      completed_at: now,
    }).where(eq(tasks.item_id, itemId)).run();
  }

  // 阻塞时写 blocked_reason
  if (action === 'block') {
    await db.update(workItems).set({
      is_blocked: 1,
      blocked_reason: extra?.note ?? null,
    }).where(eq(workItems.id, itemId)).run();
  }
  if (action === 'unblock') {
    await db.update(workItems).set({
      is_blocked: 0,
      blocked_reason: null,
    }).where(eq(workItems.id, itemId)).run();
  }

  // 写事件
  await db.insert(workItemEvents).values({
    item_id: itemId,
    event_type: 'status_changed',
    actor_type: extra?.actor ? 'user' : 'system',
    actor_id: extra?.actor ?? null,
    visibility: 'internal',
    note: extra?.note ?? null,
    payload_json: JSON.stringify({ action, from: item.status, to: result.toStatus }),
    created_at: now,
  }).run();

  // Task 完成后检查是否应自动推进父单
  if (action === 'complete' && item.parent_id) {
    await checkParentAutoAdvance(item.parent_id);
    // 通知 workflow 引擎子项已完成
    const { onChildCompleted } = await import('./workflow-service.js');
    await onChildCompleted(item.parent_id);
  }

  return { success: true, from: item.status, to: result.toStatus };
}

/**
 * 检查父单所有 task 子项是否都已终结，若是则推进父单
 */
async function checkParentAutoAdvance(parentId: string) {
  const siblingTasks = await db.select({ status: workItems.status })
    .from(workItems)
    .where(and(eq(workItems.parent_id, parentId), eq(workItems.type, 'task')))
    .all();

  const statuses = siblingTasks.map(t => t.status as WorkItemStatus);
  if (shouldAutoAdvanceParent(statuses)) {
    const parent = await db.select().from(workItems).where(eq(workItems.id, parentId)).get();
    if (parent && parent.status === 'waiting_internal') {
      const now = new Date().toISOString();
      await db.update(workItems).set({
        status: 'in_progress',
        waiting_on_type: null,
        updated_at: now,
      }).where(eq(workItems.id, parentId)).run();

      await db.insert(workItemEvents).values({
        item_id: parentId,
        event_type: 'status_changed',
        actor_type: 'system',
        visibility: 'internal',
        note: '所有子任务已完成，父单自动推进',
        payload_json: JSON.stringify({
          triggered_by: 'task_auto_advance',
          from: parent.status,
          to: 'in_progress',
        }),
        created_at: now,
      }).run();
    }
  }
}

export async function startTask(id: string, actor?: string) {
  return transitionTask(id, 'start', { actor });
}

export async function completeTask(id: string, actor?: string) {
  return transitionTask(id, 'complete', { actor });
}

export async function blockTask(id: string, reason?: string, actor?: string) {
  return transitionTask(id, 'block', { actor, note: reason });
}

export async function unblockTask(id: string, actor?: string) {
  return transitionTask(id, 'unblock', { actor });
}

export async function cancelTask(id: string, actor?: string) {
  return transitionTask(id, 'cancel', { actor });
}
