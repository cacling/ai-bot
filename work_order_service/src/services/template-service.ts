/**
 * template-service.ts — 工单模板操作
 */
import { db, workItemTemplates, workOrders, appointments, eq } from "../db.js";
import { createWorkItem } from "./item-service.js";
import type { WorkItemType } from "../types.js";

/**
 * 列出所有活跃模板
 */
export async function listTemplates() {
  return db.select().from(workItemTemplates)
    .where(eq(workItemTemplates.active, 1))
    .all();
}

/**
 * 获取单个模板
 */
export async function getTemplate(id: string) {
  return db.select().from(workItemTemplates)
    .where(eq(workItemTemplates.id, id))
    .get();
}

/**
 * 从模板创建 work_item（§3.7）
 */
export async function createFromTemplate(templateId: string, overrides: {
  title?: string;
  summary?: string;
  customer_phone?: string;
  customer_name?: string;
  owner_id?: string;
  queue_code?: string;
  priority?: string;
  parent_id?: string;
  source_session_id?: string;
  source_skill_id?: string;
  source_step_id?: string;
  created_by?: string;
  // work_order detail overrides
  work_type?: string;
  execution_mode?: string;
  verification_mode?: string;
  // appointment detail overrides
  appointment_type?: string;
  scheduled_start_at?: string;
  scheduled_end_at?: string;
  location_text?: string;
}) {
  const tpl = await getTemplate(templateId);
  if (!tpl) return { success: false, error: `模板 ${templateId} 不存在` };

  const type = tpl.applies_to_type as WorkItemType;

  const { id, root_id } = await createWorkItem({
    type,
    subtype: tpl.subtype ?? undefined,
    title: overrides.title ?? tpl.default_title ?? tpl.name,
    summary: overrides.summary,
    customer_phone: overrides.customer_phone,
    customer_name: overrides.customer_name,
    owner_id: overrides.owner_id,
    queue_code: overrides.queue_code ?? tpl.default_queue ?? undefined,
    priority: overrides.priority ?? tpl.default_priority ?? 'medium',
    parent_id: overrides.parent_id,
    source_session_id: overrides.source_session_id,
    source_skill_id: overrides.source_skill_id,
    source_step_id: overrides.source_step_id,
    sla_deadline_at: tpl.default_sla_hours
      ? new Date(Date.now() + tpl.default_sla_hours * 3600_000).toISOString()
      : undefined,
    created_by: overrides.created_by,
  });

  // 根据类型插入对应 detail 行，保持超类型/详情表一致性
  if (type === 'work_order') {
    await db.insert(workOrders).values({
      item_id: id,
      work_type: overrides.work_type ?? 'execution',
      execution_mode: overrides.execution_mode ?? 'manual',
      verification_mode: overrides.verification_mode ?? 'none',
    }).run();
  } else if (type === 'appointment') {
    await db.insert(appointments).values({
      item_id: id,
      appointment_type: overrides.appointment_type ?? tpl.subtype ?? 'callback',
      scheduled_start_at: overrides.scheduled_start_at ?? null,
      scheduled_end_at: overrides.scheduled_end_at ?? null,
      booking_status: 'proposed',
      location_text: overrides.location_text ?? null,
    }).run();
  }

  return { success: true, id, root_id, template_name: tpl.name };
}
