/**
 * 电信业务表 — MCP Server 拥有
 *
 * 这些表由 MCP Server 读写，backend 不直接访问（通过 MCP tool 间接获取）。
 */
import { integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const plans = sqliteTable('plans', {
  plan_id: text('plan_id').primaryKey(),
  name: text('name').notNull(),
  plan_type: text('plan_type').notNull().default('mobile'), // mobile | family | business | broadband
  speed_tier: text('speed_tier').notNull().default('4G'),
  is_shareable: integer('is_shareable', { mode: 'boolean' }).notNull().default(false),
  is_marketable: integer('is_marketable', { mode: 'boolean' }).notNull().default(true),
  monthly_fee: real('monthly_fee').notNull(),
  data_gb: integer('data_gb').notNull(),     // -1 = unlimited
  voice_min: integer('voice_min').notNull(), // -1 = unlimited
  sms: integer('sms').notNull(),             // -1 = unlimited
  features: text('features').notNull().default('[]'),
  description: text('description').notNull(),
});

export const valueAddedServices = sqliteTable('value_added_services', {
  service_id: text('service_id').primaryKey(),
  name: text('name').notNull(),
  monthly_fee: real('monthly_fee').notNull(),
  effective_end: text('effective_end').notNull(),
});

export const customerHouseholds = sqliteTable('customer_households', {
  household_id: text('household_id').primaryKey(),
  household_name: text('household_name').notNull(),
  household_type: text('household_type').notNull().default('individual'),
  primary_phone: text('primary_phone'),
  billing_group: text('billing_group').notNull().default('independent'),
  notes: text('notes').notNull().default(''),
});

export const subscribers = sqliteTable('subscribers', {
  phone: text('phone').primaryKey(),
  name: text('name').notNull(),
  gender: text('gender').notNull().default('unknown'), // 'male' | 'female' | 'unknown'
  customer_tier: text('customer_tier').notNull().default('standard'), // standard | vip | premium | delinquent
  preferred_language: text('preferred_language').notNull().default('zh-CN'),
  id_type: text('id_type').notNull(),
  id_last4: text('id_last4'), // 证件号后四位（脱敏）
  plan_id: text('plan_id').notNull().references(() => plans.plan_id),
  household_id: text('household_id').references(() => customerHouseholds.household_id),
  status: text('status').notNull(), // 'active' | 'suspended' | 'cancelled'
  balance: real('balance').notNull(),
  data_used_gb: real('data_used_gb').notNull(),
  voice_used_min: integer('voice_used_min').notNull(),
  sms_used: integer('sms_used').notNull().default(0),
  activated_at: text('activated_at').notNull(),
  contract_end_date: text('contract_end_date'), // 合约到期日 YYYY-MM-DD，null=无合约
  overdue_days: integer('overdue_days').notNull().default(0),
  email: text('email'),
  region: text('region'), // 归属地区（如"广州"）
  createdAt: integer('created_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date()).notNull(),
});

export const subscriberSubscriptions = sqliteTable('subscriber_subscriptions', {
  phone: text('phone').notNull().references(() => subscribers.phone, { onDelete: 'cascade' }),
  service_id: text('service_id').notNull().references(() => valueAddedServices.service_id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('active'),
  channel: text('channel').notNull().default('app'),
  subscribed_at: text('subscribed_at').notNull().$defaultFn(() => new Date().toISOString()),
  effective_start: text('effective_start'),
  effective_end: text('effective_end'),
  auto_renew: integer('auto_renew', { mode: 'boolean' }).notNull().default(true),
  order_id: text('order_id'),
}, (table) => ({
  pk: primaryKey({ columns: [table.phone, table.service_id] }),
}));

export const bills = sqliteTable('bills', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  phone: text('phone').notNull().references(() => subscribers.phone, { onDelete: 'cascade' }),
  month: text('month').notNull(),
  total: real('total').notNull(),
  plan_fee: real('plan_fee').notNull(),
  data_fee: real('data_fee').notNull(),
  voice_fee: real('voice_fee').notNull(),
  sms_fee: real('sms_fee').notNull(),
  value_added_fee: real('value_added_fee').notNull(),
  tax: real('tax').notNull(),
  status: text('status').notNull(), // 'paid' | 'unpaid' | 'overdue'
});

export const billingBillItems = sqliteTable('billing_bill_items', {
  line_id: text('line_id').primaryKey(),
  phone: text('phone').notNull().references(() => subscribers.phone, { onDelete: 'cascade' }),
  month: text('month').notNull(),
  bill_id: integer('bill_id').references(() => bills.id, { onDelete: 'cascade' }),
  item_type: text('item_type').notNull(),
  item_name: text('item_name').notNull(),
  amount: real('amount').notNull(),
  service_id: text('service_id'),
  occurred_at: text('occurred_at').notNull(),
  source_system: text('source_system').notNull().default('mock_billing'),
  disputable: integer('disputable', { mode: 'boolean' }).notNull().default(false),
});

export const billingDisputeCases = sqliteTable('billing_dispute_cases', {
  case_id: text('case_id').primaryKey(),
  phone: text('phone').notNull().references(() => subscribers.phone, { onDelete: 'cascade' }),
  month: text('month').notNull(),
  bill_id: integer('bill_id').references(() => bills.id, { onDelete: 'set null' }),
  issue_category: text('issue_category').notNull(),
  description: text('description').notNull(),
  claimed_amount: real('claimed_amount').notNull().default(0),
  status: text('status').notNull().default('open'),
  resolution_summary: text('resolution_summary'),
  created_at: text('created_at').notNull(),
  resolved_at: text('resolved_at'),
});

export const callbackTasks = sqliteTable('callback_tasks', {
  task_id: text('task_id').primaryKey(),
  original_task_id: text('original_task_id').notNull(),
  customer_name: text('customer_name').notNull(),
  callback_phone: text('callback_phone').notNull(),
  preferred_time: text('preferred_time').notNull(),
  product_name: text('product_name').notNull(),
  created_at: text('created_at').$defaultFn(() => new Date().toISOString()),
  status: text('status').notNull().default('pending'),
});

export const contracts = sqliteTable('contracts', {
  contract_id: text('contract_id').primaryKey(),
  phone: text('phone').notNull().references(() => subscribers.phone, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  start_date: text('start_date').notNull(),
  end_date: text('end_date').notNull(),
  penalty: real('penalty').notNull().default(0),
  risk_level: text('risk_level').notNull().default('low'), // 'low' | 'medium' | 'high'
  status: text('status').notNull().default('active'), // 'active' | 'expired' | 'terminated'
  created_at: text('created_at').$defaultFn(() => new Date().toISOString()),
});

export const deviceContexts = sqliteTable('device_contexts', {
  phone: text('phone').primaryKey(),
  installed_app_version: text('installed_app_version').notNull().default('3.2.1'),
  latest_app_version: text('latest_app_version').notNull().default('3.5.0'),
  device_os: text('device_os').notNull().default('android'),
  os_version: text('os_version').notNull().default('Android 13'),
  device_rooted: integer('device_rooted', { mode: 'boolean' }).notNull().default(false),
  developer_mode_on: integer('developer_mode_on', { mode: 'boolean' }).notNull().default(false),
  running_on_emulator: integer('running_on_emulator', { mode: 'boolean' }).notNull().default(false),
  has_vpn_active: integer('has_vpn_active', { mode: 'boolean' }).notNull().default(false),
  has_fake_gps: integer('has_fake_gps', { mode: 'boolean' }).notNull().default(false),
  has_remote_access_app: integer('has_remote_access_app', { mode: 'boolean' }).notNull().default(false),
  has_screen_share_active: integer('has_screen_share_active', { mode: 'boolean' }).notNull().default(false),
  flagged_apps: text('flagged_apps').notNull().default('[]'),
  login_location_changed: integer('login_location_changed', { mode: 'boolean' }).notNull().default(false),
  new_device: integer('new_device', { mode: 'boolean' }).notNull().default(false),
  otp_delivery_issue: integer('otp_delivery_issue', { mode: 'boolean' }).notNull().default(false),
});

export const customerPreferences = sqliteTable('customer_preferences', {
  phone: text('phone').primaryKey().references(() => subscribers.phone, { onDelete: 'cascade' }),
  marketing_opt_in: integer('marketing_opt_in', { mode: 'boolean' }).notNull().default(true),
  sms_opt_in: integer('sms_opt_in', { mode: 'boolean' }).notNull().default(true),
  dnd: integer('dnd', { mode: 'boolean' }).notNull().default(false),
  preferred_channel: text('preferred_channel').notNull().default('voice'),
  contact_window_start: text('contact_window_start').notNull().default('09:00'),
  contact_window_end: text('contact_window_end').notNull().default('20:30'),
  notes: text('notes').notNull().default(''),
});

export const identityOtpRequests = sqliteTable('identity_otp_requests', {
  request_id: text('request_id').primaryKey(),
  phone: text('phone').notNull().references(() => subscribers.phone, { onDelete: 'cascade' }),
  otp: text('otp').notNull(),
  channel: text('channel').notNull().default('sms'),
  delivery_status: text('delivery_status').notNull().default('sent'),
  status: text('status').notNull().default('pending'),
  requested_at: text('requested_at').notNull(),
  expires_at: text('expires_at').notNull(),
  trace_id: text('trace_id'),
});

export const identityLoginEvents = sqliteTable('identity_login_events', {
  event_id: text('event_id').primaryKey(),
  phone: text('phone').notNull().references(() => subscribers.phone, { onDelete: 'cascade' }),
  event_type: text('event_type').notNull(), // login_success | login_failed | account_locked | otp_challenge
  result: text('result').notNull(), // success | failed | blocked
  failure_reason: text('failure_reason'),
  device_label: text('device_label'),
  ip_region: text('ip_region'),
  occurred_at: text('occurred_at').notNull(),
});

export const paymentsTransactions = sqliteTable('payments_transactions', {
  payment_id: text('payment_id').primaryKey(),
  phone: text('phone').notNull().references(() => subscribers.phone, { onDelete: 'cascade' }),
  month: text('month').notNull(),
  amount: real('amount').notNull(),
  channel: text('channel').notNull(),
  status: text('status').notNull(),
  posted: integer('posted', { mode: 'boolean' }).notNull().default(false),
  paid_at: text('paid_at').notNull(),
});

export const networkIncidents = sqliteTable('network_incidents', {
  incident_id: text('incident_id').primaryKey(),
  region: text('region').notNull(),
  incident_type: text('incident_type').notNull(),
  severity: text('severity').notNull(),
  status: text('status').notNull(),
  affected_services: text('affected_services').notNull().default('[]'),
  start_time: text('start_time').notNull(),
  end_time: text('end_time'),
  description: text('description').notNull(),
});

export const offersCampaigns = sqliteTable('offers_campaigns', {
  campaign_id: text('campaign_id').primaryKey(),
  campaign_name: text('campaign_name').notNull(),
  offer_type: text('offer_type').notNull(),
  status: text('status').notNull().default('active'),
  headline: text('headline').notNull(),
  benefit_summary: text('benefit_summary').notNull(),
  target_segment: text('target_segment').notNull(),
  recommended_plan_id: text('recommended_plan_id').references(() => plans.plan_id),
  price_delta: real('price_delta'),
  valid_from: text('valid_from').notNull(),
  valid_until: text('valid_until').notNull(),
});

export const invoiceRecords = sqliteTable('invoice_records', {
  invoice_no: text('invoice_no').primaryKey(),
  phone: text('phone').notNull().references(() => subscribers.phone, { onDelete: 'cascade' }),
  month: text('month').notNull(),
  total: real('total').notNull(),
  email: text('email').notNull(),
  status: text('status').notNull().default('issued'),
  requested_at: text('requested_at').notNull(),
});

export const ordersServiceOrders = sqliteTable('orders_service_orders', {
  order_id: text('order_id').primaryKey(),
  order_type: text('order_type').notNull(),
  phone: text('phone').notNull().references(() => subscribers.phone, { onDelete: 'cascade' }),
  service_id: text('service_id'),
  service_name: text('service_name').notNull(),
  reason: text('reason').notNull(),
  status: text('status').notNull(),
  effective_at: text('effective_at'),
  requires_manual_review: integer('requires_manual_review', { mode: 'boolean' }).notNull().default(false),
  message: text('message').notNull(),
  created_at: text('created_at').$defaultFn(() => new Date().toISOString()),
});

export const ordersRefundRequests = sqliteTable('orders_refund_requests', {
  refund_id: text('refund_id').primaryKey(),
  phone: text('phone').notNull().references(() => subscribers.phone, { onDelete: 'cascade' }),
  service_id: text('service_id'),
  month: text('month'),
  reason: text('reason').notNull(),
  amount: real('amount').notNull().default(0),
  status: text('status').notNull().default('pending_review'),
  requested_at: text('requested_at').notNull(),
  resolved_at: text('resolved_at'),
});

export const outreachCallResults = sqliteTable('outreach_call_results', {
  result_id: text('result_id').primaryKey(),
  task_id: text('task_id'),
  phone: text('phone').notNull(),
  result: text('result').notNull(),
  remark: text('remark'),
  callback_time: text('callback_time'),
  ptp_date: text('ptp_date'),
  created_at: text('created_at').notNull(),
});

export const outreachSmsEvents = sqliteTable('outreach_sms_events', {
  event_id: text('event_id').primaryKey(),
  phone: text('phone').notNull(),
  sms_type: text('sms_type').notNull(),
  context: text('context'),
  status: text('status').notNull(),
  reason: text('reason'),
  sent_at: text('sent_at').notNull(),
});

export const outreachHandoffCases = sqliteTable('outreach_handoff_cases', {
  case_id: text('case_id').primaryKey(),
  phone: text('phone').notNull(),
  source_skill: text('source_skill').notNull(),
  reason: text('reason').notNull(),
  priority: text('priority').notNull().default('medium'),
  queue_name: text('queue_name').notNull(),
  status: text('status').notNull().default('open'),
  created_at: text('created_at').notNull(),
});

export const outreachMarketingResults = sqliteTable('outreach_marketing_results', {
  record_id: text('record_id').primaryKey(),
  campaign_id: text('campaign_id').notNull(),
  phone: text('phone').notNull(),
  result: text('result').notNull(),
  callback_time: text('callback_time'),
  is_dnd: integer('is_dnd', { mode: 'boolean' }).notNull().default(false),
  recorded_at: text('recorded_at').notNull(),
});
