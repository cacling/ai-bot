import { integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// ── 电信业务表 ────────────────────────────────────────────────────────────────

export const plans = sqliteTable('plans', {
  plan_id: text('plan_id').primaryKey(),
  name: text('name').notNull(),
  monthly_fee: real('monthly_fee').notNull(),
  data_gb: integer('data_gb').notNull(),     // -1 = unlimited
  voice_min: integer('voice_min').notNull(), // -1 = unlimited
  sms: integer('sms').notNull(),             // -1 = unlimited
  features: text('features').notNull().default('[]'), // JSON.stringify 存储
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
  id_type: text('id_type').notNull(),
  plan_id: text('plan_id').notNull().references(() => plans.plan_id),
  status: text('status').notNull(), // 'active' | 'suspended' | 'cancelled'
  balance: real('balance').notNull(),
  data_used_gb: real('data_used_gb').notNull(),
  voice_used_min: integer('voice_used_min').notNull(),
  activated_at: text('activated_at').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date()).notNull(),
});

// 复合主键：sqlite-core 使用对象语法（非数组）
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

export const testPersonas = sqliteTable('test_personas', {
  id:         text('id').primaryKey(),           // 'U001', 'C001', 'M001'
  label_zh:   text('label_zh').notNull(),         // 下拉框显示文本（中文）
  label_en:   text('label_en').notNull(),         // 下拉框显示文本（英文）
  category:   text('category').notNull(),         // 'inbound' | 'outbound_collection' | 'outbound_marketing'
  tag_zh:     text('tag_zh').notNull(),            // 标签："正常用户"
  tag_en:     text('tag_en').notNull(),            // 标签："Active"
  tag_color:  text('tag_color').notNull(),         // Tailwind 颜色类
  context:    text('context').notNull(),           // JSON: 业务数据包，平台不解析，透传给 agent
  sort_order: integer('sort_order').default(0),
});

export const outboundTasks = sqliteTable('outbound_tasks', {
  id:        text('id').primaryKey(),
  phone:     text('phone').notNull(),
  task_type: text('task_type').notNull(), // 'collection' | 'marketing'
  label_zh:  text('label_zh').notNull(),
  label_en:  text('label_en').notNull(),
  data:      text('data').notNull(),       // JSON string
});

// ── 回访任务 ─────────────────────────────────────────────────────────────────

export const callbackTasks = sqliteTable('callback_tasks', {
  task_id:          text('task_id').primaryKey(),
  original_task_id: text('original_task_id').notNull(),
  customer_name:    text('customer_name').notNull(),
  callback_phone:   text('callback_phone').notNull(),
  preferred_time:   text('preferred_time').notNull(),
  product_name:     text('product_name').notNull(),
  created_at:       text('created_at').$defaultFn(() => new Date().toISOString()),
  status:           text('status').notNull().default('pending'), // 'pending' | 'completed' | 'cancelled'
});

// ── 设备上下文 ───────────────────────────────────────────────────────────────

export const deviceContexts = sqliteTable('device_contexts', {
  phone:                  text('phone').primaryKey(),
  installed_app_version:  text('installed_app_version').notNull().default('3.2.1'),
  latest_app_version:     text('latest_app_version').notNull().default('3.5.0'),
  device_os:              text('device_os').notNull().default('android'),
  os_version:             text('os_version').notNull().default('Android 13'),
  device_rooted:          integer('device_rooted', { mode: 'boolean' }).notNull().default(false),
  developer_mode_on:      integer('developer_mode_on', { mode: 'boolean' }).notNull().default(false),
  running_on_emulator:    integer('running_on_emulator', { mode: 'boolean' }).notNull().default(false),
  has_vpn_active:         integer('has_vpn_active', { mode: 'boolean' }).notNull().default(false),
  has_fake_gps:           integer('has_fake_gps', { mode: 'boolean' }).notNull().default(false),
  has_remote_access_app:  integer('has_remote_access_app', { mode: 'boolean' }).notNull().default(false),
  has_screen_share_active: integer('has_screen_share_active', { mode: 'boolean' }).notNull().default(false),
  flagged_apps:           text('flagged_apps').notNull().default('[]'), // JSON array
  login_location_changed: integer('login_location_changed', { mode: 'boolean' }).notNull().default(false),
  new_device:             integer('new_device', { mode: 'boolean' }).notNull().default(false),
  otp_delivery_issue:     integer('otp_delivery_issue', { mode: 'boolean' }).notNull().default(false),
});
