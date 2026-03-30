/**
 * materializer-service.ts — 草稿/intake → 正式工单
 *
 * 复用已有的 createTicket / createWorkItem + workOrders insert
 */
import { db, workItemDrafts, workItemIntakes, workItemRelations, issueThreads, eq } from "../db.js";

/**
 * 从已确认的 draft 创建正式工单
 */
export async function materializeDraft(draftId: string): Promise<{
  success: boolean;
  item_id?: string;
  error?: string;
}> {
  const draft = await db.select().from(workItemDrafts).where(eq(workItemDrafts.id, draftId)).get();
  if (!draft) return { success: false, error: `Draft ${draftId} 不存在` };

  const intake = await db.select().from(workItemIntakes).where(eq(workItemIntakes.id, draft.intake_id)).get();

  // 解析 structured_payload
  const structuredPayload = draft.structured_payload_json
    ? JSON.parse(draft.structured_payload_json) as Record<string, unknown>
    : {};

  let itemId: string;

  if (draft.target_type === 'ticket') {
    const { createTicket } = await import('./ticket-service.js');
    const result = await createTicket({
      title: draft.title,
      summary: draft.summary ?? undefined,
      description: draft.description ?? undefined,
      customer_phone: draft.customer_phone ?? undefined,
      customer_name: draft.customer_name ?? undefined,
      channel: intake?.source_channel ?? undefined,
      source_session_id: intake?.source_ref ?? undefined,
      priority: draft.priority ?? undefined,
      severity: draft.severity ?? undefined,
      queue_code: draft.queue_code ?? undefined,
      owner_id: draft.owner_id ?? undefined,
      ticket_category: (structuredPayload.ticket_category as string) ?? 'request',
      issue_type: structuredPayload.issue_type as string | undefined,
      intent_code: structuredPayload.intent_code as string | undefined,
      category_code: draft.category_code ?? undefined,
      created_by: 'system',
    });
    if (!result.success) return { success: false, error: `createTicket 失败` };
    itemId = result.id!;
  } else {
    // work_order
    const { createWorkItem } = await import('./item-service.js');
    const { id } = await createWorkItem({
      type: 'work_order',
      subtype: (structuredPayload.work_type as string) ?? undefined,
      category_code: draft.category_code ?? undefined,
      title: draft.title,
      summary: draft.summary ?? undefined,
      description: draft.description ?? undefined,
      customer_phone: draft.customer_phone ?? undefined,
      customer_name: draft.customer_name ?? undefined,
      channel: intake?.source_channel ?? undefined,
      source_session_id: intake?.source_ref ?? undefined,
      priority: draft.priority ?? undefined,
      severity: draft.severity ?? undefined,
      queue_code: draft.queue_code ?? undefined,
      owner_id: draft.owner_id ?? undefined,
      created_by: 'system',
    });
    itemId = id;

    // 写 work_orders 详情
    const { workOrders } = await import('../db.js');
    await db.insert(workOrders).values({
      item_id: itemId,
      work_type: (structuredPayload.work_type as string) ?? 'execution',
      execution_mode: (structuredPayload.execution_mode as string) ?? 'manual',
    }).run();

    // 启动 workflow（如果草稿或分类绑定了 workflow）
    const workflowKey = draft.workflow_key;
    if (workflowKey) {
      try {
        const { startWorkflowRun } = await import('./workflow-service.js');
        await startWorkflowRun(workflowKey, itemId);
      } catch { /* workflow 启动失败不阻塞主流程 */ }
    }
  }

  // 写来源关系
  const now = new Date().toISOString();

  // source_intake 关系
  await db.insert(workItemRelations).values({
    item_id: itemId,
    related_type: 'source_intake',
    related_id: draft.intake_id,
    relation_kind: 'source',
  }).run();

  // source_draft 关系
  await db.insert(workItemRelations).values({
    item_id: itemId,
    related_type: 'source_draft',
    related_id: draftId,
    relation_kind: 'source',
  }).run();

  // source_issue_thread 关系
  if (intake?.thread_id) {
    await db.insert(workItemRelations).values({
      item_id: itemId,
      related_type: 'source_issue_thread',
      related_id: intake.thread_id,
      relation_kind: 'source',
    }).run();

    // 更新 thread：master_ticket_id 仅在为空时设置（首个正式单作为主单），latest_item_id 始终更新
    // 注意：虽然字段名叫 master_ticket_id，但实际可存 ticket 或 work_order 的 ID，
    // followup-orchestrator 的 transitionItem() 会按 item.type 分发到正确的流转函数
    const thread = await db.select().from(issueThreads).where(eq(issueThreads.id, intake.thread_id)).get();
    await db.update(issueThreads).set({
      master_ticket_id: thread?.master_ticket_id ?? itemId,
      latest_item_id: itemId,
      last_seen_at: now,
      updated_at: now,
    }).where(eq(issueThreads.id, intake.thread_id)).run();
  }

  // 更新 draft
  await db.update(workItemDrafts).set({
    status: 'published',
    published_item_id: itemId,
    updated_at: now,
  }).where(eq(workItemDrafts.id, draftId)).run();

  // 更新 intake
  if (intake) {
    await db.update(workItemIntakes).set({
      materialized_item_id: itemId,
      status: 'materialized',
      updated_at: now,
    }).where(eq(workItemIntakes.id, intake.id)).run();
  }

  // 后续编排（启动 workflow 等）— fire-and-forget
  if (intake) {
    import('./followup-orchestrator-service.js').then(async (svc) => {
      await svc.orchestratePostMaterialization(itemId, intake);
    }).catch(() => { /* ignore */ });
  }

  return { success: true, item_id: itemId };
}

/**
 * 直接从 intake 创建正式工单（跳过 draft 步骤，用于 auto_create 模式）
 */
export async function materializeIntakeDirectly(intakeId: string): Promise<{
  success: boolean;
  item_id?: string;
  error?: string;
}> {
  const intake = await db.select().from(workItemIntakes).where(eq(workItemIntakes.id, intakeId)).get();
  if (!intake) return { success: false, error: `Intake ${intakeId} 不存在` };

  const normalized = intake.normalized_payload_json
    ? JSON.parse(intake.normalized_payload_json) as Record<string, unknown>
    : {};

  // 推断 target_type
  const targetType = normalized.work_type ? 'work_order' : 'ticket';

  // 解析分类默认值
  const categoryCode = normalized.category_code as string | undefined;
  let catDefaults: { default_queue_code?: string | null; default_priority?: string | null; default_workflow_key?: string | null } | null = null;
  if (categoryCode) {
    const { resolveCategoryDefaults } = await import('./category-service.js');
    catDefaults = await resolveCategoryDefaults(categoryCode);
  }

  let itemId: string;

  if (targetType === 'ticket') {
    const { createTicket } = await import('./ticket-service.js');
    const ticketCategory = (normalized.ticket_category as string) ?? 'request';
    const result = await createTicket({
      title: intake.subject ?? '自动创建工单',
      summary: (normalized.summary as string) ?? undefined,
      description: (normalized.description as string) ?? undefined,
      customer_phone: intake.customer_phone ?? undefined,
      customer_name: intake.customer_name ?? undefined,
      channel: intake.source_channel ?? undefined,
      source_session_id: intake.source_ref ?? undefined,
      priority: intake.priority_hint ?? catDefaults?.default_priority ?? 'medium',
      queue_code: catDefaults?.default_queue_code ?? undefined,
      ticket_category: ticketCategory,
      category_code: categoryCode,
      created_by: 'system',
    });
    if (!result.success) return { success: false, error: 'createTicket 失败' };
    itemId = result.id!;
  } else {
    const { createWorkItem } = await import('./item-service.js');
    const { id } = await createWorkItem({
      type: 'work_order',
      subtype: (normalized.work_type as string) ?? undefined,
      category_code: categoryCode,
      title: intake.subject ?? '自动创建工单',
      summary: (normalized.summary as string) ?? undefined,
      customer_phone: intake.customer_phone ?? undefined,
      customer_name: intake.customer_name ?? undefined,
      channel: intake.source_channel ?? undefined,
      source_session_id: intake.source_ref ?? undefined,
      priority: intake.priority_hint ?? catDefaults?.default_priority ?? 'medium',
      queue_code: catDefaults?.default_queue_code ?? undefined,
      created_by: 'system',
    });
    itemId = id;

    const { workOrders } = await import('../db.js');
    await db.insert(workOrders).values({
      item_id: itemId,
      work_type: (normalized.work_type as string) ?? 'execution',
      execution_mode: (normalized.execution_mode as string) ?? 'manual',
    }).run();

    // 启动 workflow（如果分类绑定了 workflow）
    if (catDefaults?.default_workflow_key) {
      try {
        const { startWorkflowRun } = await import('./workflow-service.js');
        await startWorkflowRun(catDefaults.default_workflow_key, itemId);
      } catch { /* workflow 启动失败不阻塞主流程 */ }
    }
  }

  const now = new Date().toISOString();

  // 写来源关系
  await db.insert(workItemRelations).values({
    item_id: itemId,
    related_type: 'source_intake',
    related_id: intakeId,
    relation_kind: 'source',
  }).run();

  if (intake.thread_id) {
    await db.insert(workItemRelations).values({
      item_id: itemId,
      related_type: 'source_issue_thread',
      related_id: intake.thread_id,
      relation_kind: 'source',
    }).run();

    // master_ticket_id 仅在为空时设置（首个正式单作为主单），latest_item_id 始终更新
    // 虽然字段名叫 master_ticket_id，实际可存 ticket 或 work_order，transitionItem() 按类型分发
    const thread = await db.select().from(issueThreads).where(eq(issueThreads.id, intake.thread_id)).get();
    await db.update(issueThreads).set({
      master_ticket_id: thread?.master_ticket_id ?? itemId,
      latest_item_id: itemId,
      last_seen_at: now,
      updated_at: now,
    }).where(eq(issueThreads.id, intake.thread_id)).run();
  }

  // 更新 intake
  await db.update(workItemIntakes).set({
    materialized_item_id: itemId,
    status: 'materialized',
    updated_at: now,
  }).where(eq(workItemIntakes.id, intakeId)).run();

  // 后续编排（传递 decision_mode 和 normalized_payload_json 以支持 auto_create_and_schedule）
  import('./followup-orchestrator-service.js').then(async (svc) => {
    await svc.orchestratePostMaterialization(itemId, {
      ...intake,
      normalized_payload_json: intake.normalized_payload_json,
    });
  }).catch(() => { /* ignore */ });

  return { success: true, item_id: itemId };
}
