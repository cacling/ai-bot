import { integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date()).notNull(),
});

export const messages = sqliteTable('messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // 'user' | 'assistant'
  content: text('content').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date()).notNull(),
});

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

export const mockUsers = sqliteTable('mock_users', {
  id:         text('id').primaryKey(),
  phone:      text('phone').notNull().unique(),
  name:       text('name').notNull(),
  plan_zh:    text('plan_zh').notNull(),
  plan_en:    text('plan_en').notNull(),
  status:     text('status').notNull(),    // 'active' | 'suspended'
  tag_zh:     text('tag_zh').notNull(),
  tag_en:     text('tag_en').notNull(),
  tag_color:  text('tag_color').notNull(),
  type:       text('type').notNull(),      // 'inbound' | 'outbound'
});

export const outboundTasks = sqliteTable('outbound_tasks', {
  id:        text('id').primaryKey(),
  phone:     text('phone').notNull(),
  task_type: text('task_type').notNull(), // 'collection' | 'marketing' | 'bank-marketing'
  label_zh:  text('label_zh').notNull(),
  label_en:  text('label_en').notNull(),
  data:      text('data').notNull(),       // JSON string
});
