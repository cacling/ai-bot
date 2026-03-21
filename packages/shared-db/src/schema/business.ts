/**
 * 电信业务表 — MCP Server 拥有
 *
 * 这些表由 MCP Server 读写，backend 不直接访问（通过 MCP tool 间接获取）。
 */
import { integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const plans = sqliteTable('plans', {
  plan_id: text('plan_id').primaryKey(),
  name: text('name').notNull(),
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

export const subscribers = sqliteTable('subscribers', {
  phone: text('phone').primaryKey(),
  name: text('name').notNull(),
  gender: text('gender').notNull().default('unknown'), // 'male' | 'female' | 'unknown'
  id_type: text('id_type').notNull(),
  id_last4: text('id_last4'), // 证件号后四位（脱敏）
  plan_id: text('plan_id').notNull().references(() => plans.plan_id),
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
