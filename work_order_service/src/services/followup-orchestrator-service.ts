/**
 * followup-orchestrator-service.ts — 正式建单后的后续编排
 *
 * 启动 workflow、追加跟进、重开事项
 */
import { db, issueThreads, workItemIntakes, workItemEvents, workItemRelations, workItems, eq } from "../db.js";

/**
 * 正式建单后编排（启动 workflow 等）
 */
export async function orchestratePostMaterialization(
  itemId: string,
  intake: { id: string; thread_id?: string | null; source_kind?: string | null; decision_mode?: string | null; normalized_payload_json?: string | null },
) {
  // 如果 decision_mode 是 auto_create_and_schedule 且有预约计划，自动建预约
  if (intake.decision_mode === 'auto_create_and_schedule' && intake.normalized_payload_json) {
    try {
      const normalized = JSON.parse(intake.normalized_payload_json) as Record<string, unknown>;
      const appointmentPlan = normalized.appointment_plan as Record<string, unknown> | undefined;

      if (appointmentPlan) {
        const { createAppointment } = await import('./appointment-service.js');
        await createAppointment(itemId, {
          appointment_type: (appointmentPlan.appointment_type as string) ?? 'onsite',
          scheduled_start_at: appointmentPlan.preferred_time as string | undefined,
          location_text: appointmentPlan.location as string | undefined,
          created_by: 'system',
        });
      }
    } catch { /* 预约创建失败不阻塞主流程 */ }
  }
}

/**
 * 按 item 类型调用正确的状态流转函数
 */
async function transitionItem(
  itemId: string,
  action: 'reopen' | 'close',
  actor?: string,
  note?: string,
): Promise<{ success: boolean; error?: string }> {
  const item = await db.select().from(workItems).where(eq(workItems.id, itemId)).get();
  if (!item) return { success: false, error: `Item ${itemId} 不存在` };

  if (item.type === 'ticket') {
    const { transitionTicket } = await import('./ticket-service.js');
    return transitionTicket(itemId, action, actor, note);
  }
  if (item.type === 'work_order') {
    const { transitionWorkOrder } = await import('./transition-service.js');
    return transitionWorkOrder(itemId, action, actor, note);
  }
  return { success: false, error: `Item ${itemId} 类型 ${item.type} 不支持 ${action}` };
}

/**
 * 追加跟进 — 将 intake 绑定到已有 thread，更新时间线
 */
export async function appendFollowup(
  threadId: string,
  intakeId: string,
): Promise<{ success: boolean; error?: string }> {
  const thread = await db.select().from(issueThreads).where(eq(issueThreads.id, threadId)).get();
  if (!thread) return { success: false, error: `Thread ${threadId} 不存在` };

  const now = new Date().toISOString();

  // 更新 thread 时间
  await db.update(issueThreads).set({
    last_seen_at: now,
    updated_at: now,
  }).where(eq(issueThreads.id, threadId)).run();

  // 更新 intake 关联 — 仅在主单存在时标记为 materialized，
  // 否则标记为 matched（等待主单确认后再物化）
  const hasMaster = !!thread.master_ticket_id;
  await db.update(workItemIntakes).set({
    thread_id: threadId,
    status: hasMaster ? 'materialized' : 'matched',
    materialized_item_id: hasMaster ? thread.master_ticket_id : null,
    updated_at: now,
  }).where(eq(workItemIntakes.id, intakeId)).run();

  // 在主单上追加事件
  if (thread.master_ticket_id) {
    await db.insert(workItemEvents).values({
      item_id: thread.master_ticket_id,
      event_type: 'note_added',
      actor_type: 'system',
      visibility: 'internal',
      note: '同事项再次触达（intake 追加跟进）',
      payload_json: JSON.stringify({ intake_id: intakeId, thread_id: threadId }),
      created_at: now,
    }).run();

    // 写关系
    await db.insert(workItemRelations).values({
      item_id: thread.master_ticket_id,
      related_type: 'source_intake',
      related_id: intakeId,
      relation_kind: 'source',
    }).run();
  }

  return { success: true };
}

/**
 * 重开 thread — 将已关闭的 thread 重新打开
 */
export async function reopenThread(
  threadId: string,
  intakeId: string,
): Promise<{ success: boolean; error?: string }> {
  const thread = await db.select().from(issueThreads).where(eq(issueThreads.id, threadId)).get();
  if (!thread) return { success: false, error: `Thread ${threadId} 不存在` };

  if (thread.status !== 'closed' && thread.status !== 'resolved') {
    return { success: false, error: `Thread 状态为 ${thread.status}，无需重开` };
  }

  // 检查 reopen_until
  if (thread.reopen_until && new Date(thread.reopen_until) < new Date()) {
    return { success: false, error: `Thread 已超过可重开窗口` };
  }

  const now = new Date().toISOString();

  await db.update(issueThreads).set({
    status: 'open',
    last_seen_at: now,
    updated_at: now,
  }).where(eq(issueThreads.id, threadId)).run();

  // 如果主单存在，尝试重开（按 item 类型走不同流转）
  if (thread.master_ticket_id) {
    try {
      await transitionItem(thread.master_ticket_id, 'reopen', undefined, '同事项再次触达，自动重开');
    } catch { /* 主单可能不在可重开状态，忽略 */ }

    await db.insert(workItemEvents).values({
      item_id: thread.master_ticket_id,
      event_type: 'reopened',
      actor_type: 'system',
      visibility: 'internal',
      note: '同事项再次触达，thread 自动重开',
      payload_json: JSON.stringify({ intake_id: intakeId, thread_id: threadId }),
      created_at: now,
    }).run();
  }

  // 更新 intake
  await db.update(workItemIntakes).set({
    thread_id: threadId,
    updated_at: now,
  }).where(eq(workItemIntakes.id, intakeId)).run();

  return { success: true };
}

/**
 * 合并主单 — 将源 thread 合并到目标 thread
 */
export async function mergeMaster(
  targetThreadId: string,
  sourceThreadId: string,
  mergedBy?: string,
): Promise<{ success: boolean; error?: string }> {
  const target = await db.select().from(issueThreads).where(eq(issueThreads.id, targetThreadId)).get();
  if (!target) return { success: false, error: `目标 Thread ${targetThreadId} 不存在` };

  const source = await db.select().from(issueThreads).where(eq(issueThreads.id, sourceThreadId)).get();
  if (!source) return { success: false, error: `来源 Thread ${sourceThreadId} 不存在` };

  const now = new Date().toISOString();

  // 关闭源 thread
  await db.update(issueThreads).set({
    status: 'closed',
    updated_at: now,
  }).where(eq(issueThreads.id, sourceThreadId)).run();

  // 更新目标 thread 时间
  await db.update(issueThreads).set({
    last_seen_at: now,
    updated_at: now,
  }).where(eq(issueThreads.id, targetThreadId)).run();

  // 将源 thread 的 intake 重新关联到目标 thread
  await db.update(workItemIntakes).set({
    thread_id: targetThreadId,
    updated_at: now,
  }).where(eq(workItemIntakes.thread_id, sourceThreadId)).run();

  // 写关系记录 + 关闭源主单
  if (target.master_ticket_id && source.master_ticket_id) {
    // 标记源主单关联到目标主单（duplicate_of）
    await db.insert(workItemRelations).values({
      item_id: source.master_ticket_id,
      related_type: 'work_item',
      related_id: target.master_ticket_id,
      relation_kind: 'duplicate_of',
    }).run();

    await db.insert(workItemRelations).values({
      item_id: target.master_ticket_id,
      related_type: 'source_issue_thread',
      related_id: sourceThreadId,
      relation_kind: 'merged_into',
    }).run();

    // 关闭源主单 — 按 item 类型走不同流转
    try {
      await transitionItem(
        source.master_ticket_id,
        'close',
        mergedBy,
        `合并到主单 ${target.master_ticket_id}（thread ${sourceThreadId} → ${targetThreadId}）`,
      );
    } catch { /* 源主单可能已关闭，忽略 */ }

    await db.insert(workItemEvents).values({
      item_id: target.master_ticket_id,
      event_type: 'note_added',
      actor_type: mergedBy ? 'user' : 'system',
      actor_id: mergedBy ?? undefined,
      visibility: 'internal',
      note: `Thread ${sourceThreadId} 已合并到当前事项主线，源主单 ${source.master_ticket_id} 已关闭`,
      payload_json: JSON.stringify({ source_thread_id: sourceThreadId, target_thread_id: targetThreadId, source_ticket_id: source.master_ticket_id }),
      created_at: now,
    }).run();
  }

  return { success: true };
}
