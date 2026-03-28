/**
 * item-service.ts — work_items 通用 CRUD
 */
import { db, workItems, workOrders, appointments, workItemEvents, workItemRelations, eq, and, desc } from "../db.js";
import type { WorkItemStatus, WorkItemType } from "../types.js";

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface ListFilters {
  type?: WorkItemType;
  status?: WorkItemStatus;
  queue_code?: string;
  owner_id?: string;
  customer_phone?: string;
  root_id?: string;
  parent_id?: string;
  source_session_id?: string;
  page?: number;
  size?: number;
}

/**
 * 列表查询（§7.1 GET /api/work-items）
 */
export async function listWorkItems(filters: ListFilters) {
  const page = filters.page ?? 1;
  const size = filters.size ?? 20;
  const offset = (page - 1) * size;

  const conditions = [];
  if (filters.type) conditions.push(eq(workItems.type, filters.type));
  if (filters.status) conditions.push(eq(workItems.status, filters.status));
  if (filters.queue_code) conditions.push(eq(workItems.queue_code, filters.queue_code));
  if (filters.owner_id) conditions.push(eq(workItems.owner_id, filters.owner_id));
  if (filters.customer_phone) conditions.push(eq(workItems.customer_phone, filters.customer_phone));
  if (filters.root_id) conditions.push(eq(workItems.root_id, filters.root_id));
  if (filters.parent_id) conditions.push(eq(workItems.parent_id, filters.parent_id));
  if (filters.source_session_id) conditions.push(eq(workItems.source_session_id, filters.source_session_id));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const items = await db.select().from(workItems)
    .where(where)
    .orderBy(desc(workItems.created_at))
    .limit(size)
    .offset(offset)
    .all();

  const countResult = await db.select().from(workItems).where(where).all();
  const total = countResult.length;

  return { items, total, page, size };
}

/**
 * 聚合详情（§7.1 GET /api/work-items/:id）
 */
export async function getWorkItemDetail(id: string) {
  const item = await db.select().from(workItems).where(eq(workItems.id, id)).get();
  if (!item) return null;

  const detail = item.type === 'work_order'
    ? await db.select().from(workOrders).where(eq(workOrders.item_id, id)).get()
    : item.type === 'appointment'
      ? await db.select().from(appointments).where(eq(appointments.item_id, id)).get()
      : null;

  const children = await db.select().from(workItems).where(eq(workItems.parent_id, id)).all();

  // 子预约：join appointments 详情表，前端需要 booking_status / scheduled_start_at 等字段
  const childAppointmentRows = await db.select()
    .from(workItems)
    .leftJoin(appointments, eq(workItems.id, appointments.item_id))
    .where(and(eq(workItems.parent_id, id), eq(workItems.type, 'appointment')))
    .all();
  const childAppointments = childAppointmentRows.map(r => ({
    ...r.work_items,
    detail: r.appointments,
  }));

  const events = await db.select().from(workItemEvents)
    .where(eq(workItemEvents.item_id, id))
    .orderBy(desc(workItemEvents.created_at))
    .all();

  const relations = await db.select().from(workItemRelations)
    .where(eq(workItemRelations.item_id, id))
    .all();

  return { item, detail, children, appointments: childAppointments, events, relations };
}

/**
 * 创建 work_item + 写 created 事件
 */
export async function createWorkItem(data: {
  type: WorkItemType;
  subtype?: string;
  title: string;
  summary?: string;
  description?: string;
  channel?: string;
  source_session_id?: string;
  source_skill_id?: string;
  source_skill_version?: number;
  source_step_id?: string;
  source_instance_id?: string;
  customer_phone?: string;
  customer_name?: string;
  requester_id?: string;
  owner_id?: string;
  queue_code?: string;
  priority?: string;
  severity?: string;
  parent_id?: string;
  due_at?: string;
  next_action_at?: string;
  sla_deadline_at?: string;
  created_by?: string;
}) {
  const id = generateId('wi');
  const now = new Date().toISOString();
  const root_id = data.parent_id
    ? (await db.select({ root_id: workItems.root_id }).from(workItems).where(eq(workItems.id, data.parent_id)).get())?.root_id ?? id
    : id;

  await db.insert(workItems).values({
    id,
    root_id,
    parent_id: data.parent_id ?? null,
    type: data.type,
    subtype: data.subtype ?? null,
    title: data.title,
    summary: data.summary ?? '',
    description: data.description ?? null,
    channel: data.channel ?? null,
    source_session_id: data.source_session_id ?? null,
    source_skill_id: data.source_skill_id ?? null,
    source_skill_version: data.source_skill_version ?? null,
    source_step_id: data.source_step_id ?? null,
    source_instance_id: data.source_instance_id ?? null,
    customer_phone: data.customer_phone ?? null,
    customer_name: data.customer_name ?? null,
    requester_id: data.requester_id ?? null,
    owner_id: data.owner_id ?? null,
    queue_code: data.queue_code ?? null,
    priority: data.priority ?? 'medium',
    severity: data.severity ?? null,
    status: 'new',
    due_at: data.due_at ?? null,
    next_action_at: data.next_action_at ?? null,
    sla_deadline_at: data.sla_deadline_at ?? null,
    created_by: data.created_by ?? null,
    created_at: now,
    updated_at: now,
  }).run();

  // 写 created 事件
  await db.insert(workItemEvents).values({
    item_id: id,
    event_type: 'created',
    actor_type: data.created_by ? 'user' : 'system',
    actor_id: data.created_by ?? null,
    visibility: 'internal',
    note: null,
    payload_json: null,
    created_at: now,
  }).run();

  return { id, root_id };
}

/**
 * 添加事件/备注（§7.6）
 */
export async function addEvent(data: {
  item_id: string;
  event_type: string;
  actor_type?: string;
  actor_id?: string;
  visibility?: string;
  note?: string;
  payload?: Record<string, unknown>;
}) {
  await db.insert(workItemEvents).values({
    item_id: data.item_id,
    event_type: data.event_type,
    actor_type: data.actor_type ?? 'system',
    actor_id: data.actor_id ?? null,
    visibility: data.visibility ?? 'internal',
    note: data.note ?? null,
    payload_json: data.payload ? JSON.stringify(data.payload) : null,
    created_at: new Date().toISOString(),
  }).run();
}
