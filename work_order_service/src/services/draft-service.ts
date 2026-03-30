/**
 * draft-service.ts — 工单草稿管理
 */
import { db, workItemIntakes, workItemDrafts, eq } from "../db.js";
import type { DraftStatus } from "../types.js";

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 从 intake 生成草稿
 */
export async function generateDraft(intakeId: string): Promise<{ success: boolean; id?: string; error?: string }> {
  const intake = await db.select().from(workItemIntakes).where(eq(workItemIntakes.id, intakeId)).get();
  if (!intake) return { success: false, error: `Intake ${intakeId} 不存在` };

  // 解析 normalized payload
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

  const id = generateId('drft');
  const now = new Date().toISOString();

  // 构建 structured_payload（类型特有字段）
  const structuredPayload: Record<string, unknown> = {};
  if (targetType === 'ticket') {
    structuredPayload.ticket_category = normalized.ticket_category ?? 'request';
    if (normalized.issue_type) structuredPayload.issue_type = normalized.issue_type;
    if (normalized.intent_code) structuredPayload.intent_code = normalized.intent_code;
  } else {
    structuredPayload.work_type = normalized.work_type ?? 'execution';
    if (normalized.execution_mode) structuredPayload.execution_mode = normalized.execution_mode;
  }

  await db.insert(workItemDrafts).values({
    id,
    intake_id: intakeId,
    target_type: targetType,
    category_code: categoryCode ?? null,
    title: intake.subject ?? (normalized.subject as string) ?? '未命名草稿',
    summary: (normalized.summary as string) ?? null,
    description: (normalized.description as string) ?? null,
    customer_phone: intake.customer_phone ?? null,
    customer_name: intake.customer_name ?? null,
    priority: intake.priority_hint ?? catDefaults?.default_priority ?? 'medium',
    queue_code: catDefaults?.default_queue_code ?? null,
    workflow_key: catDefaults?.default_workflow_key ?? null,
    structured_payload_json: JSON.stringify(structuredPayload),
    status: 'pending_review',
    review_required: 1,
    created_at: now,
    updated_at: now,
  }).run();

  // 更新 intake 状态
  await db.update(workItemIntakes).set({
    status: 'draft_created',
    updated_at: now,
  }).where(eq(workItemIntakes.id, intakeId)).run();

  return { success: true, id };
}

/**
 * 获取草稿详情
 */
export async function getDraft(id: string) {
  const draft = await db.select().from(workItemDrafts).where(eq(workItemDrafts.id, id)).get();
  if (!draft) return null;

  // 附带 intake 信息
  const intake = await db.select().from(workItemIntakes).where(eq(workItemIntakes.id, draft.intake_id)).get();

  return { ...draft, intake };
}

/**
 * 编辑草稿
 */
export async function editDraft(
  id: string,
  changes: Partial<{
    title: string;
    summary: string;
    description: string;
    category_code: string;
    priority: string;
    severity: string;
    queue_code: string;
    owner_id: string;
    target_type: string;
    structured_payload_json: string;
    appointment_plan_json: string;
  }>,
): Promise<{ success: boolean; error?: string }> {
  const draft = await db.select().from(workItemDrafts).where(eq(workItemDrafts.id, id)).get();
  if (!draft) return { success: false, error: `Draft ${id} 不存在` };
  if (draft.status !== 'draft' && draft.status !== 'pending_review') {
    return { success: false, error: `Draft 状态为 ${draft.status}，无法编辑` };
  }

  // 如果 category_code 变了，重新解析默认值
  if (changes.category_code && changes.category_code !== draft.category_code) {
    const { resolveCategoryDefaults } = await import('./category-service.js');
    const catDefaults = await resolveCategoryDefaults(changes.category_code);
    if (catDefaults) {
      if (!changes.queue_code && catDefaults.default_queue_code) {
        changes.queue_code = catDefaults.default_queue_code;
      }
      if (!changes.priority && catDefaults.default_priority) {
        changes.priority = catDefaults.default_priority;
      }
    }
  }

  const now = new Date().toISOString();
  await db.update(workItemDrafts).set({
    ...changes,
    updated_at: now,
  }).where(eq(workItemDrafts.id, id)).run();

  return { success: true };
}

/**
 * 确认草稿 → 调 materializer 正式建单
 */
export async function confirmDraft(
  id: string,
  reviewedBy?: string,
): Promise<{ success: boolean; item_id?: string; error?: string }> {
  const draft = await db.select().from(workItemDrafts).where(eq(workItemDrafts.id, id)).get();
  if (!draft) return { success: false, error: `Draft ${id} 不存在` };
  if (draft.status !== 'draft' && draft.status !== 'pending_review') {
    return { success: false, error: `Draft 状态为 ${draft.status}，无法确认` };
  }

  const now = new Date().toISOString();
  await db.update(workItemDrafts).set({
    status: 'confirmed',
    reviewed_by: reviewedBy ?? null,
    reviewed_at: now,
    updated_at: now,
  }).where(eq(workItemDrafts.id, id)).run();

  // 调 materializer 正式建单
  const { materializeDraft } = await import('./materializer-service.js');
  const result = await materializeDraft(id);

  return result;
}

/**
 * 丢弃草稿
 */
export async function discardDraft(
  id: string,
  reviewedBy?: string,
): Promise<{ success: boolean; error?: string }> {
  const draft = await db.select().from(workItemDrafts).where(eq(workItemDrafts.id, id)).get();
  if (!draft) return { success: false, error: `Draft ${id} 不存在` };
  if (draft.status !== 'draft' && draft.status !== 'pending_review') {
    return { success: false, error: `Draft 状态为 ${draft.status}，无法丢弃` };
  }

  const now = new Date().toISOString();
  await db.update(workItemDrafts).set({
    status: 'discarded',
    reviewed_by: reviewedBy ?? null,
    reviewed_at: now,
    updated_at: now,
  }).where(eq(workItemDrafts.id, id)).run();

  // 更新 intake 状态
  await db.update(workItemIntakes).set({
    status: 'discarded',
    updated_at: now,
  }).where(eq(workItemIntakes.id, draft.intake_id)).run();

  return { success: true };
}
