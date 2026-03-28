/**
 * 工单系统表 — work_order_service 拥有
 *
 * 统一 work_item 超类型 + 类型化详情表（work_orders / appointments）
 * + 事件时间线 + 关系 + 模板 + 队列
 */
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// ── 统一超类型：work_items ──────────────────────────────────────────────────

export const workItems = sqliteTable('work_items', {
  id: text('id').primaryKey(),
  root_id: text('root_id').notNull(),
  parent_id: text('parent_id'),
  type: text('type').notNull(),                   // 'case' | 'work_order' | 'appointment' | 'task'
  subtype: text('subtype'),                        // 如 'callback' | 'store_visit' | 'password_reset'（兼容字段，逐步迁移到 category_code）
  category_code: text('category_code'),             // 业务分类编码，如 'ticket.incident.app_login'
  title: text('title').notNull(),
  summary: text('summary').notNull().default(''),
  description: text('description'),
  channel: text('channel'),                        // 'online' | 'voice' | 'outbound' | 'internal'
  source_session_id: text('source_session_id'),
  source_skill_id: text('source_skill_id'),
  source_skill_version: integer('source_skill_version'),
  source_step_id: text('source_step_id'),
  source_instance_id: text('source_instance_id'),
  customer_phone: text('customer_phone'),
  customer_name: text('customer_name'),
  requester_id: text('requester_id'),
  owner_id: text('owner_id'),
  queue_code: text('queue_code'),
  priority: text('priority').notNull().default('medium'),   // 'low' | 'medium' | 'high' | 'urgent'
  severity: text('severity'),                               // 'low' | 'medium' | 'high' | 'critical'
  status: text('status').notNull().default('new'),
  lifecycle_stage: text('lifecycle_stage'),
  is_blocked: integer('is_blocked').notNull().default(0),
  blocked_reason: text('blocked_reason'),
  waiting_on_type: text('waiting_on_type'),        // 'customer' | 'internal' | 'vendor' | 'system'
  due_at: text('due_at'),
  next_action_at: text('next_action_at'),
  sla_deadline_at: text('sla_deadline_at'),
  closed_at: text('closed_at'),
  cancelled_at: text('cancelled_at'),
  created_by: text('created_by'),
  created_at: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updated_at: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

// ── Work Order 详情 ─────────────────────────────────────────────────────────

export const workOrders = sqliteTable('work_orders', {
  item_id: text('item_id').primaryKey().references(() => workItems.id, { onDelete: 'cascade' }),
  work_type: text('work_type').notNull(),          // 'execution' | 'followup' | 'review' | 'field'
  execution_mode: text('execution_mode').notNull(), // 'manual' | 'assisted' | 'system' | 'external'
  required_role: text('required_role'),
  required_capability: text('required_capability'),
  result_code: text('result_code'),
  verification_mode: text('verification_mode'),    // 'none' | 'customer_confirm' | 'system_check' | 'agent_review'
  verification_status: text('verification_status'),
  external_ref_no: text('external_ref_no'),
  location_text: text('location_text'),
  metadata_json: text('metadata_json'),
});

// ── Appointment 详情 ────────────────────────────────────────────────────────

export const appointments = sqliteTable('appointments', {
  item_id: text('item_id').primaryKey().references(() => workItems.id, { onDelete: 'cascade' }),
  appointment_type: text('appointment_type').notNull(), // 'callback' | 'store_visit' | 'onsite' | 'video_verify'
  resource_id: text('resource_id'),
  scheduled_start_at: text('scheduled_start_at'),
  scheduled_end_at: text('scheduled_end_at'),
  actual_start_at: text('actual_start_at'),
  actual_end_at: text('actual_end_at'),
  booking_status: text('booking_status').notNull().default('proposed'),
  location_text: text('location_text'),
  timezone: text('timezone'),
  no_show_reason: text('no_show_reason'),
  reschedule_count: integer('reschedule_count').notNull().default(0),
  metadata_json: text('metadata_json'),
});

// ── Ticket 详情 ────────────────────────────────────────────────────────────

export const tickets = sqliteTable('tickets', {
  item_id: text('item_id').primaryKey().references(() => workItems.id, { onDelete: 'cascade' }),
  ticket_category: text('ticket_category').notNull(), // 'inquiry' | 'complaint' | 'incident' | 'request'
  issue_type: text('issue_type'),
  intent_code: text('intent_code'),
  customer_visible_status: text('customer_visible_status'),
  resolution_summary: text('resolution_summary'),
  resolution_code: text('resolution_code'),
  satisfaction_status: text('satisfaction_status'),
  can_reopen_until: text('can_reopen_until'),
  metadata_json: text('metadata_json'),
});

// ── Task 详情 ──────────────────────────────────────────────────────────────

export const tasks = sqliteTable('tasks', {
  item_id: text('item_id').primaryKey().references(() => workItems.id, { onDelete: 'cascade' }),
  task_type: text('task_type').notNull(),              // 'verify' | 'collect' | 'notify' | 'review'
  checklist_json: text('checklist_json'),
  depends_on_item_id: text('depends_on_item_id'),
  auto_complete_on_event: text('auto_complete_on_event'),
  completed_by: text('completed_by'),
  completed_at: text('completed_at'),
  metadata_json: text('metadata_json'),
});

// ── 时间线事件 ──────────────────────────────────────────────────────────────

export const workItemEvents = sqliteTable('work_item_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  item_id: text('item_id').notNull().references(() => workItems.id, { onDelete: 'cascade' }),
  event_type: text('event_type').notNull(),
  actor_type: text('actor_type').notNull(),        // 'user' | 'agent' | 'system' | 'workflow' | 'customer'
  actor_id: text('actor_id'),
  visibility: text('visibility').notNull().default('internal'), // 'internal' | 'customer'
  note: text('note'),
  payload_json: text('payload_json'),
  created_at: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

// ── 关系 ────────────────────────────────────────────────────────────────────

export const workItemRelations = sqliteTable('work_item_relations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  item_id: text('item_id').notNull().references(() => workItems.id, { onDelete: 'cascade' }),
  related_type: text('related_type').notNull(),    // 'session' | 'message' | 'skill_instance' | 'execution_record' | 'outbound_task'
  related_id: text('related_id').notNull(),
  relation_kind: text('relation_kind').notNull(),  // 'source' | 'context' | 'child' | 'blocking' | 'derived_from'
  metadata_json: text('metadata_json'),
});

// ── 模板 ────────────────────────────────────────────────────────────────────

export const workItemTemplates = sqliteTable('work_item_templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  applies_to_type: text('applies_to_type').notNull(), // 'case' | 'work_order' | 'appointment' | 'task'
  subtype: text('subtype'),
  category_code: text('category_code'),
  default_title: text('default_title'),
  default_queue: text('default_queue'),
  default_priority: text('default_priority'),
  default_severity: text('default_severity'),
  default_sla_hours: integer('default_sla_hours'),
  workflow_key: text('workflow_key'),
  closure_policy_json: text('closure_policy_json'),
  field_schema_json: text('field_schema_json'),
  active: integer('active').notNull().default(1),
  created_at: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updated_at: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

// ── 队列 ────────────────────────────────────────────────────────────────────

export const workQueues = sqliteTable('work_queues', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  queue_type: text('queue_type').notNull(),        // 'frontline' | 'specialist' | 'store' | 'field' | 'system'
  owner_team: text('owner_team'),
  routing_policy_json: text('routing_policy_json'),
  sla_policy_json: text('sla_policy_json'),
  active: integer('active').notNull().default(1),
});

// ── 分类目录 ──────────────────────────────────────────────────────────────

export const workItemCategories = sqliteTable('work_item_categories', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  display_name: text('display_name').notNull(),
  type: text('type').notNull(),                        // 'ticket' | 'work_order' | 'appointment' | 'task'
  level: integer('level').notNull(),                   // 1 | 2 | 3
  parent_code: text('parent_code'),
  status: text('status').notNull(),                    // 'active' | 'inactive' | 'retired'
  description: text('description'),
  domain_code: text('domain_code'),
  scene_code: text('scene_code'),
  default_template_code: text('default_template_code'),
  default_workflow_key: text('default_workflow_key'),
  default_queue_code: text('default_queue_code'),
  default_sla_policy_code: text('default_sla_policy_code'),
  default_priority: text('default_priority'),
  required_fields_schema: text('required_fields_schema'),
  customer_visible_name: text('customer_visible_name'),
  customer_visible_status_map: text('customer_visible_status_map'),
  allowed_parent_rules_json: text('allowed_parent_rules_json'),
  allowed_child_rules_json: text('allowed_child_rules_json'),
  close_policy_json: text('close_policy_json'),
  routing_policy_json: text('routing_policy_json'),
  metadata_json: text('metadata_json'),
  created_at: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updated_at: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

// ── Workflow 定义 ──────────────────────────────────────────────────────────

export const workflowDefinitions = sqliteTable('workflow_definitions', {
  id: text('id').primaryKey(),
  key: text('key').notNull(),
  name: text('name').notNull(),
  target_type: text('target_type').notNull(),      // 'ticket' | 'work_order' | 'appointment' | 'task'
  version_no: integer('version_no').notNull().default(1),
  status: text('status').notNull().default('active'), // 'draft' | 'active' | 'retired'
  spec_json: text('spec_json').notNull(),
  created_at: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updated_at: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

// ── Workflow Run ──────────────────────────────────────────────────────────

export const workflowRuns = sqliteTable('workflow_runs', {
  id: text('id').primaryKey(),
  definition_id: text('definition_id').notNull().references(() => workflowDefinitions.id, { onDelete: 'cascade' }),
  item_id: text('item_id').notNull().references(() => workItems.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('running'), // 'running' | 'waiting_signal' | 'waiting_child' | 'completed' | 'failed' | 'cancelled'
  current_node_id: text('current_node_id'),
  waiting_signal: text('waiting_signal'),
  context_json: text('context_json'),
  started_at: text('started_at').notNull().$defaultFn(() => new Date().toISOString()),
  updated_at: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  finished_at: text('finished_at'),
});

// ── Workflow Run 事件 ──────────────────────────────────────────────────────

export const workflowRunEvents = sqliteTable('workflow_run_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  run_id: text('run_id').notNull().references(() => workflowRuns.id, { onDelete: 'cascade' }),
  seq: integer('seq').notNull(),
  event_type: text('event_type').notNull(),
  node_id: text('node_id'),
  payload_json: text('payload_json'),
  created_at: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});
