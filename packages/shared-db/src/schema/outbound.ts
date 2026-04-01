/**
 * outbound.ts — 外呼服务 schema
 *
 * 管理营销活动、外呼任务（催收+营销）、通话/营销结果、短信事件、转人工、回拨任务。
 * ob_test_personas 仅存引用（party_id → CDP），运行时从 CDP 拉取完整用户画像。
 */
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// ── 1. 营销活动 ← offersCampaigns ─────────────────────────────────────────

export const obCampaigns = sqliteTable('ob_campaigns', {
  campaign_id: text('campaign_id').primaryKey(),
  campaign_name: text('campaign_name').notNull(),
  offer_type: text('offer_type').notNull(),         // plan_upgrade | roaming_pack | family_bundle | retention
  status: text('status').notNull().default('active'), // active | paused | ended
  headline: text('headline').notNull(),
  benefit_summary: text('benefit_summary').notNull(),
  target_segment: text('target_segment').notNull(),
  recommended_plan_id: text('recommended_plan_id'),
  price_delta: real('price_delta'),
  valid_from: text('valid_from').notNull(),
  valid_until: text('valid_until').notNull(),
  created_at: text('created_at').$defaultFn(() => new Date().toISOString()),
  updated_at: text('updated_at').$defaultFn(() => new Date().toISOString()),
}, (t) => ({
  idxStatus: index('ob_campaigns_status').on(t.status),
  idxOfferType: index('ob_campaigns_offer_type').on(t.offer_type),
}));

// ── 2. 外呼任务 ← outboundTasks ──────────────────────────────────────────

export const obTasks = sqliteTable('ob_tasks', {
  id: text('id').primaryKey(),
  phone: text('phone').notNull(),
  task_type: text('task_type').notNull(),            // collection | marketing
  label_zh: text('label_zh').notNull(),
  label_en: text('label_en').notNull(),
  data: text('data').notNull(),                      // JSON: { zh: {...}, en: {...} }
  status: text('status').notNull().default('pending'), // pending | in_progress | completed | cancelled
  campaign_id: text('campaign_id'),                  // marketing 任务关联的活动
  created_at: text('created_at').$defaultFn(() => new Date().toISOString()),
  updated_at: text('updated_at').$defaultFn(() => new Date().toISOString()),
}, (t) => ({
  idxType: index('ob_tasks_type').on(t.task_type),
  idxStatus: index('ob_tasks_status').on(t.status),
  idxPhone: index('ob_tasks_phone').on(t.phone),
}));

// ── 3. 通话结果 ← outreachCallResults ─────────────────────────────────────

export const obCallResults = sqliteTable('ob_call_results', {
  result_id: text('result_id').primaryKey(),
  task_id: text('task_id'),
  phone: text('phone').notNull(),
  result: text('result').notNull(),                  // ptp | refusal | dispute | no_answer | busy | converted | callback | not_interested | non_owner | verify_failed | dnd
  remark: text('remark'),
  callback_time: text('callback_time'),
  ptp_date: text('ptp_date'),
  created_at: text('created_at').notNull(),
}, (t) => ({
  idxTaskId: index('ob_call_results_task_id').on(t.task_id),
  idxPhone: index('ob_call_results_phone').on(t.phone),
}));

// ── 4. 短信事件 ← outreachSmsEvents ──────────────────────────────────────

export const obSmsEvents = sqliteTable('ob_sms_events', {
  event_id: text('event_id').primaryKey(),
  phone: text('phone').notNull(),
  sms_type: text('sms_type').notNull(),              // payment_link | plan_detail | callback_reminder | product_detail
  context: text('context'),                          // collection | marketing
  status: text('status').notNull(),                  // sent | blocked_quiet_hours | blocked_invalid_type
  reason: text('reason'),
  sent_at: text('sent_at').notNull(),
}, (t) => ({
  idxPhone: index('ob_sms_events_phone').on(t.phone),
}));

// ── 5. 转人工记录 ← outreachHandoffCases ─────────────────────────────────

export const obHandoffCases = sqliteTable('ob_handoff_cases', {
  case_id: text('case_id').primaryKey(),
  phone: text('phone').notNull(),
  source_skill: text('source_skill').notNull(),
  reason: text('reason').notNull(),
  priority: text('priority').notNull().default('medium'), // low | medium | high
  queue_name: text('queue_name').notNull(),
  status: text('status').notNull().default('open'),       // open | assigned | resolved | closed
  created_at: text('created_at').notNull(),
}, (t) => ({
  idxPhone: index('ob_handoff_cases_phone').on(t.phone),
  idxStatus: index('ob_handoff_cases_status').on(t.status),
}));

// ── 6. 营销结果 ← outreachMarketingResults ────────────────────────────────

export const obMarketingResults = sqliteTable('ob_marketing_results', {
  record_id: text('record_id').primaryKey(),
  campaign_id: text('campaign_id').notNull(),
  phone: text('phone').notNull(),
  result: text('result').notNull(),                  // converted | callback | not_interested | no_answer | busy | wrong_number | dnd
  callback_time: text('callback_time'),
  is_dnd: integer('is_dnd', { mode: 'boolean' }).notNull().default(false),
  recorded_at: text('recorded_at').notNull(),
}, (t) => ({
  idxCampaign: index('ob_marketing_results_campaign').on(t.campaign_id),
  idxPhone: index('ob_marketing_results_phone').on(t.phone),
}));

// ── 7. 回拨任务 ← callbackTasks ──────────────────────────────────────────

export const obCallbackTasks = sqliteTable('ob_callback_tasks', {
  task_id: text('task_id').primaryKey(),
  original_task_id: text('original_task_id').notNull(),
  customer_name: text('customer_name').notNull(),
  callback_phone: text('callback_phone').notNull(),
  preferred_time: text('preferred_time').notNull(),
  product_name: text('product_name').notNull(),
  status: text('status').notNull().default('pending'), // pending | completed | cancelled
  created_at: text('created_at').$defaultFn(() => new Date().toISOString()),
}, (t) => ({
  idxOriginalTask: index('ob_callback_tasks_original').on(t.original_task_id),
  idxStatus: index('ob_callback_tasks_status').on(t.status),
}));

// ── 8. 测试 Persona 引用 ─────────────────────────────────────────────────

export const obTestPersonas = sqliteTable('ob_test_personas', {
  id: text('id').primaryKey(),                       // "U001", "C001", "M001"
  party_id: text('party_id').notNull(),              // 关联 CDP parties
  category: text('category').notNull(),              // inbound | outbound_collection | outbound_marketing
  task_id: text('task_id'),                          // 外呼 persona 关联 ob_tasks.id（inbound 为 null）
  sort_order: integer('sort_order').notNull().default(0),
}, (t) => ({
  idxCategory: index('ob_test_personas_category').on(t.category),
}));
