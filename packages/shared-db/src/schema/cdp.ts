/**
 * CDP (Customer Data Platform) — Phase 1 核心表
 *
 * 客户语义层：party-centric 模型，替代 phone-centric 模型。
 * 6 张表：party, party_identity, contact_point, customer_account, service_subscription, party_subscription_relation
 */
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ── 1. party — 统一客户主体根 ──────────────────────────────────────────────

export const cdpParties = sqliteTable('cdp_parties', {
  party_id: text('party_id').primaryKey(),                          // uuid
  tenant_id: text('tenant_id').notNull().default('default'),
  party_type: text('party_type').notNull(),                         // customer | anonymous | business | household | external_actor
  display_name: text('display_name'),
  canonical_name: text('canonical_name'),
  status: text('status').notNull().default('active'),               // active | inactive | merged | deleted
  primary_household_id: text('primary_household_id'),
  primary_account_id: text('primary_account_id'),
  primary_subscription_id: text('primary_subscription_id'),
  merged_into_party_id: text('merged_into_party_id'),
  created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
  updated_at: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (t) => ({
  idxTenantTypeStatus: index('cdp_parties_tenant_type_status').on(t.tenant_id, t.party_type, t.status),
}));

// ── 2. party_identity — 外部标识与主体归属 ─────────────────────────────────

export const cdpPartyIdentities = sqliteTable('cdp_party_identities', {
  party_identity_id: text('party_identity_id').primaryKey(),        // uuid
  tenant_id: text('tenant_id').notNull().default('default'),
  party_id: text('party_id').notNull().references(() => cdpParties.party_id),
  identity_type: text('identity_type').notNull(),                   // phone | email | subscriber_id | wa_id | psid | device_id ...
  identity_value: text('identity_value').notNull(),                 // 原始值
  identity_value_norm: text('identity_value_norm').notNull(),       // 规范化值（用于匹配）
  source_system: text('source_system').notNull().default('seed'),
  verified_flag: integer('verified_flag', { mode: 'boolean' }).notNull().default(false),
  primary_flag: integer('primary_flag', { mode: 'boolean' }).notNull().default(false),
  status: text('status').notNull().default('active'),               // active | inactive | revoked
  confidence_score: real('confidence_score'),
  valid_from: integer('valid_from', { mode: 'timestamp' }),
  valid_to: integer('valid_to', { mode: 'timestamp' }),
  created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
  updated_at: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (t) => ({
  uniqIdentity: uniqueIndex('cdp_pi_tenant_type_norm_source').on(t.tenant_id, t.identity_type, t.identity_value_norm, t.source_system),
  idxParty: index('cdp_pi_tenant_party').on(t.tenant_id, t.party_id),
  idxResolve: index('cdp_pi_tenant_type_norm').on(t.tenant_id, t.identity_type, t.identity_value_norm),
}));

// ── 3. contact_point — 可联系地址 ──────────────────────────────────────────

export const cdpContactPoints = sqliteTable('cdp_contact_points', {
  contact_point_id: text('contact_point_id').primaryKey(),          // uuid
  tenant_id: text('tenant_id').notNull().default('default'),
  party_id: text('party_id').notNull().references(() => cdpParties.party_id),
  contact_type: text('contact_type').notNull(),                     // phone | email | whatsapp | messenger | telegram ...
  contact_value: text('contact_value').notNull(),
  contact_value_norm: text('contact_value_norm').notNull(),
  label: text('label'),                                             // home | work | personal | billing
  preferred_flag: integer('preferred_flag', { mode: 'boolean' }).notNull().default(false),
  reachable_flag: integer('reachable_flag', { mode: 'boolean' }).notNull().default(true),
  verified_flag: integer('verified_flag', { mode: 'boolean' }).notNull().default(false),
  status: text('status').notNull().default('active'),               // active | inactive | blocked
  valid_from: integer('valid_from', { mode: 'timestamp' }),
  valid_to: integer('valid_to', { mode: 'timestamp' }),
  created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
  updated_at: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (t) => ({
  uniqContact: uniqueIndex('cdp_cp_tenant_type_norm_party').on(t.tenant_id, t.contact_type, t.contact_value_norm, t.party_id),
  idxPartyPreferred: index('cdp_cp_tenant_party_preferred').on(t.tenant_id, t.party_id, t.preferred_flag),
}));

// ── 4. customer_account — 账户镜像 ────────────────────────────────────────

export const cdpCustomerAccounts = sqliteTable('cdp_customer_accounts', {
  customer_account_id: text('customer_account_id').primaryKey(),    // uuid
  tenant_id: text('tenant_id').notNull().default('default'),
  account_no: text('account_no').notNull(),
  account_type: text('account_type').notNull().default('personal'), // personal | family | business
  account_status: text('account_status').notNull().default('active'), // active | suspended | closed | delinquent
  billing_status: text('billing_status').notNull().default('normal'), // normal | overdue | disputed
  currency_code: text('currency_code').notNull().default('CNY'),
  risk_level: text('risk_level'),
  source_system: text('source_system').notNull().default('seed'),
  snapshot_json: text('snapshot_json'),                              // JSON 摘要
  created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
  updated_at: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (t) => ({
  uniqAccount: uniqueIndex('cdp_ca_tenant_accno_source').on(t.tenant_id, t.account_no, t.source_system),
}));

// ── 5. service_subscription — 服务订阅镜像 ────────────────────────────────

export const cdpServiceSubscriptions = sqliteTable('cdp_service_subscriptions', {
  service_subscription_id: text('service_subscription_id').primaryKey(), // uuid
  tenant_id: text('tenant_id').notNull().default('default'),
  customer_account_id: text('customer_account_id').notNull()
    .references(() => cdpCustomerAccounts.customer_account_id),
  subscription_no: text('subscription_no').notNull(),
  subscription_type: text('subscription_type').notNull().default('mobile'), // mobile | broadband | tv | app | wallet
  service_identifier: text('service_identifier'),                   // e.g. 手机号、线路 id
  plan_code: text('plan_code'),
  service_status: text('service_status').notNull().default('active'), // active | suspended | terminated | pending
  start_at: integer('start_at', { mode: 'timestamp' }),
  end_at: integer('end_at', { mode: 'timestamp' }),
  source_system: text('source_system').notNull().default('seed'),
  snapshot_json: text('snapshot_json'),                              // JSON 摘要
  created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
  updated_at: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (t) => ({
  uniqSubscription: uniqueIndex('cdp_ss_tenant_subno_source').on(t.tenant_id, t.subscription_no, t.source_system),
  idxServiceId: index('cdp_ss_tenant_service_id').on(t.tenant_id, t.service_identifier),
}));

// ── 6. party_subscription_relation — 主体与订阅关系 ───────────────────────

export const cdpPartySubscriptionRelations = sqliteTable('cdp_party_subscription_relations', {
  relation_id: text('relation_id').primaryKey(),                    // uuid
  tenant_id: text('tenant_id').notNull().default('default'),
  party_id: text('party_id').notNull().references(() => cdpParties.party_id),
  service_subscription_id: text('service_subscription_id').notNull()
    .references(() => cdpServiceSubscriptions.service_subscription_id),
  relation_type: text('relation_type').notNull().default('owner'),  // owner | payer | user | authorized_contact | beneficiary
  primary_flag: integer('primary_flag', { mode: 'boolean' }).notNull().default(true),
  effective_from: integer('effective_from', { mode: 'timestamp' }),
  effective_to: integer('effective_to', { mode: 'timestamp' }),
  status: text('status').notNull().default('active'),               // active | inactive
  created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (t) => ({
  uniqRelation: uniqueIndex('cdp_psr_tenant_party_sub_type').on(t.tenant_id, t.party_id, t.service_subscription_id, t.relation_type),
  idxParty: index('cdp_psr_tenant_party_status').on(t.tenant_id, t.party_id, t.status),
  idxSubscription: index('cdp_psr_tenant_sub_status').on(t.tenant_id, t.service_subscription_id, t.status),
}));

// ══════════════════════════════════════════════════════════════════════════
// Phase 2: Identity Graph 治理
// ══════════════════════════════════════════════════════════════════════════

// ── 7. identity_link — identity 间关联证据 ────────────────────────────────

export const cdpIdentityLinks = sqliteTable('cdp_identity_links', {
  identity_link_id: text('identity_link_id').primaryKey(),          // uuid
  tenant_id: text('tenant_id').notNull().default('default'),
  left_party_identity_id: text('left_party_identity_id').notNull()
    .references(() => cdpPartyIdentities.party_identity_id),
  right_party_identity_id: text('right_party_identity_id').notNull()
    .references(() => cdpPartyIdentities.party_identity_id),
  link_type: text('link_type').notNull(),                           // match | alias | migrated | merged
  match_method: text('match_method').notNull(),                     // exact_phone | exact_email | manual_review | rule_engine ...
  match_score: real('match_score'),
  link_status: text('link_status').notNull().default('proposed'),   // proposed | confirmed | rejected | expired
  evidence_json: text('evidence_json'),                             // JSON 证据链
  approved_by: text('approved_by'),
  approved_at: integer('approved_at', { mode: 'timestamp' }),
  created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (t) => ({
  idxLeft: index('cdp_il_tenant_left').on(t.tenant_id, t.left_party_identity_id),
  idxRight: index('cdp_il_tenant_right').on(t.tenant_id, t.right_party_identity_id),
  idxStatus: index('cdp_il_tenant_status').on(t.tenant_id, t.link_status),
}));

// ── 8. source_record_link — CDP 实体与源系统记录映射 ──────────────────────

export const cdpSourceRecordLinks = sqliteTable('cdp_source_record_links', {
  source_record_link_id: text('source_record_link_id').primaryKey(), // uuid
  tenant_id: text('tenant_id').notNull().default('default'),
  source_system: text('source_system').notNull(),                   // crm | billing | app | order | workorder | interaction
  source_entity_type: text('source_entity_type').notNull(),         // contact | subscriber | account | order | case ...
  source_entity_id: text('source_entity_id').notNull(),
  target_entity_type: text('target_entity_type').notNull(),         // party | party_identity | contact_point | service_subscription
  target_entity_id: text('target_entity_id').notNull(),
  link_type: text('link_type').notNull().default('imported'),       // asserted | mirrored | projected | imported
  active_flag: integer('active_flag', { mode: 'boolean' }).notNull().default(true),
  created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
  updated_at: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (t) => ({
  uniqSourceTarget: uniqueIndex('cdp_srl_tenant_source_target').on(
    t.tenant_id, t.source_system, t.source_entity_type, t.source_entity_id, t.target_entity_type,
  ),
  idxTarget: index('cdp_srl_tenant_target').on(t.tenant_id, t.target_entity_type, t.target_entity_id),
}));

// ── 9. identity_resolution_case — merge/split 审核工单 ───────────────────

export const cdpIdentityResolutionCases = sqliteTable('cdp_identity_resolution_cases', {
  resolution_case_id: text('resolution_case_id').primaryKey(),      // uuid
  tenant_id: text('tenant_id').notNull().default('default'),
  left_entity_type: text('left_entity_type').notNull(),             // party_identity | party
  left_entity_id: text('left_entity_id').notNull(),
  right_entity_type: text('right_entity_type').notNull(),           // party_identity | party
  right_entity_id: text('right_entity_id').notNull(),
  suggested_action: text('suggested_action').notNull(),             // merge | split | relink | reject
  match_score: real('match_score'),
  status: text('status').notNull().default('open'),                 // open | approved | rejected | executed | cancelled
  review_reason: text('review_reason'),
  evidence_json: text('evidence_json'),                             // JSON 证据
  reviewed_by: text('reviewed_by'),
  reviewed_at: integer('reviewed_at', { mode: 'timestamp' }),
  created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (t) => ({
  idxStatus: index('cdp_irc_tenant_status').on(t.tenant_id, t.status),
  idxLeft: index('cdp_irc_tenant_left').on(t.tenant_id, t.left_entity_type, t.left_entity_id),
  idxRight: index('cdp_irc_tenant_right').on(t.tenant_id, t.right_entity_type, t.right_entity_id),
}));

// ══════════════════════════════════════════════════════════════════════════
// Phase 3: 联系治理
// ══════════════════════════════════════════════════════════════════════════

// ── 10. communication_preference — 客户沟通偏好 ──────────────────────────

export const cdpCommunicationPreferences = sqliteTable('cdp_communication_preferences', {
  communication_preference_id: text('communication_preference_id').primaryKey(), // uuid
  tenant_id: text('tenant_id').notNull().default('default'),
  party_id: text('party_id').notNull().references(() => cdpParties.party_id),
  preference_type: text('preference_type').notNull(),               // channel_preference | language | contact_time | contact_frequency
  channel_type: text('channel_type'),                               // sms | email | phone | whatsapp | messenger
  preference_value: text('preference_value').notNull(),
  priority_order: integer('priority_order'),
  source_system: text('source_system').notNull().default('seed'),
  effective_from: integer('effective_from', { mode: 'timestamp' }),
  effective_to: integer('effective_to', { mode: 'timestamp' }),
  created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
  updated_at: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (t) => ({
  idxParty: index('cdp_cpref_tenant_party').on(t.tenant_id, t.party_id),
  idxType: index('cdp_cpref_tenant_party_type').on(t.tenant_id, t.party_id, t.preference_type),
}));

// ── 11. consent_record — 客户同意/授权记录 ───────────────────────────────

export const cdpConsentRecords = sqliteTable('cdp_consent_records', {
  consent_record_id: text('consent_record_id').primaryKey(),        // uuid
  tenant_id: text('tenant_id').notNull().default('default'),
  party_id: text('party_id').notNull().references(() => cdpParties.party_id),
  contact_point_id: text('contact_point_id')
    .references(() => cdpContactPoints.contact_point_id),
  channel_type: text('channel_type').notNull(),                     // sms | email | phone | whatsapp | messenger | analytics
  purpose_type: text('purpose_type').notNull(),                     // service | marketing | notification | analytics
  consent_status: text('consent_status').notNull().default('pending'), // granted | revoked | expired | pending
  jurisdiction: text('jurisdiction'),
  captured_at: integer('captured_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
  effective_from: integer('effective_from', { mode: 'timestamp' }),
  expires_at: integer('expires_at', { mode: 'timestamp' }),
  evidence_ref: text('evidence_ref'),                               // 证据引用 URL/ID
  source_system: text('source_system').notNull().default('seed'),
  updated_at: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (t) => ({
  idxPartyChannel: index('cdp_cr_tenant_party_channel_purpose').on(
    t.tenant_id, t.party_id, t.channel_type, t.purpose_type, t.consent_status,
  ),
  idxContactPoint: index('cdp_cr_tenant_cp').on(t.tenant_id, t.contact_point_id),
}));

// ══════════════════════════════════════════════════════════════════════════
// Phase 4: 消费视图
// ══════════════════════════════════════════════════════════════════════════

// ── 12. customer_profile — 统一客户画像消费视图 ──────────────────────────

export const cdpCustomerProfiles = sqliteTable('cdp_customer_profiles', {
  customer_profile_id: text('customer_profile_id').primaryKey(),    // uuid
  tenant_id: text('tenant_id').notNull().default('default'),
  party_id: text('party_id').notNull().references(() => cdpParties.party_id),
  profile_version: integer('profile_version').notNull().default(1),
  profile_status: text('profile_status').notNull().default('active'), // active | stale | rebuilding
  basic_profile_json: text('basic_profile_json'),                   // 基础信息
  contact_profile_json: text('contact_profile_json'),               // 联系摘要
  preference_profile_json: text('preference_profile_json'),         // 偏好摘要
  risk_profile_json: text('risk_profile_json'),                     // 风险摘要
  value_profile_json: text('value_profile_json'),                   // 价值摘要
  service_profile_json: text('service_profile_json'),               // 服务摘要引用
  computed_at: integer('computed_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
  updated_at: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (t) => ({
  uniqParty: uniqueIndex('cdp_profile_tenant_party').on(t.tenant_id, t.party_id),
}));

// ── 13. service_summary — 面向客服/Bot/路由的服务摘要 ────────────────────

export const cdpServiceSummaries = sqliteTable('cdp_service_summaries', {
  service_summary_id: text('service_summary_id').primaryKey(),      // uuid
  tenant_id: text('tenant_id').notNull().default('default'),
  party_id: text('party_id').notNull().references(() => cdpParties.party_id),
  primary_account_id: text('primary_account_id'),
  active_subscription_count: integer('active_subscription_count').notNull().default(0),
  primary_subscription_id: text('primary_subscription_id'),
  service_status: text('service_status').notNull().default('normal'), // normal | partially_suspended | suspended
  billing_status: text('billing_status').notNull().default('normal'), // normal | overdue | disputed
  delinquent_flag: integer('delinquent_flag', { mode: 'boolean' }).notNull().default(false),
  contract_summary_json: text('contract_summary_json'),
  device_summary_json: text('device_summary_json'),
  balance_summary_json: text('balance_summary_json'),
  updated_at: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (t) => ({
  uniqParty: uniqueIndex('cdp_svc_summary_tenant_party').on(t.tenant_id, t.party_id),
}));

// ── 14. interaction_summary — 面向 ACD/Bot/Inbox 的交互摘要 ─────────────

export const cdpInteractionSummaries = sqliteTable('cdp_interaction_summaries', {
  interaction_summary_id: text('interaction_summary_id').primaryKey(), // uuid
  tenant_id: text('tenant_id').notNull().default('default'),
  party_id: text('party_id').notNull().references(() => cdpParties.party_id),
  last_contact_at: integer('last_contact_at', { mode: 'timestamp' }),
  last_channel: text('last_channel'),
  contact_count_7d: integer('contact_count_7d').notNull().default(0),
  contact_count_30d: integer('contact_count_30d').notNull().default(0),
  open_work_order_count: integer('open_work_order_count').notNull().default(0),
  open_interaction_count: integer('open_interaction_count').notNull().default(0),
  last_sentiment: text('last_sentiment'),                           // positive | neutral | negative
  last_escalation_at: integer('last_escalation_at', { mode: 'timestamp' }),
  priority_hint: integer('priority_hint'),
  preferred_channel: text('preferred_channel'),
  summary_json: text('summary_json'),                               // 详细摘要
  updated_at: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (t) => ({
  uniqParty: uniqueIndex('cdp_int_summary_tenant_party').on(t.tenant_id, t.party_id),
}));

// ══════════════════════════════════════════════════════════════════════════
// Phase 5: household + customer_event
// ══════════════════════════════════════════════════════════════════════════

// ── 15. household — 家庭/共享关系容器 ────────────────────────────────────

export const cdpHouseholds = sqliteTable('cdp_households', {
  household_id: text('household_id').primaryKey(),                  // uuid
  tenant_id: text('tenant_id').notNull().default('default'),
  household_name: text('household_name'),
  status: text('status').notNull().default('active'),               // active | inactive
  primary_party_id: text('primary_party_id'),
  address_json: text('address_json'),                               // JSON 地址摘要
  created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
  updated_at: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (t) => ({
  idxTenant: index('cdp_hh_tenant_status').on(t.tenant_id, t.status),
}));

// ── 16. customer_event — append-only 客户事实骨架 ────────────────────────

export const cdpCustomerEvents = sqliteTable('cdp_customer_events', {
  customer_event_id: text('customer_event_id').primaryKey(),        // uuid
  tenant_id: text('tenant_id').notNull().default('default'),
  party_id: text('party_id'),                                       // nullable: 未解析主体时可为空
  event_type: text('event_type').notNull(),                         // identity_verified | login | otp_success | subscription_created | bill_overdue ...
  event_category: text('event_category').notNull(),                 // identity | service | billing | interaction | work_order | engagement
  event_time: integer('event_time', { mode: 'timestamp' }).notNull(),
  source_system: text('source_system').notNull(),
  source_event_id: text('source_event_id'),                         // 上游事件 id
  channel_type: text('channel_type'),
  subscription_id: text('subscription_id'),
  account_id: text('account_id'),
  severity: text('severity'),                                       // low | medium | high
  event_payload_json: text('event_payload_json'),                   // JSON 事件载荷
  identity_refs_json: text('identity_refs_json'),                   // JSON 原始 identity 引用
  created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (t) => ({
  idxPartyTime: index('cdp_ce_tenant_party_time').on(t.tenant_id, t.party_id, t.event_time),
  idxTypeTime: index('cdp_ce_tenant_type_time').on(t.tenant_id, t.event_type, t.event_time),
  idxSource: index('cdp_ce_tenant_source').on(t.tenant_id, t.source_system, t.source_event_id),
}));

// ── 17. audit_log — 操作审计日志 ──────────────────────────────────────────

export const cdpAuditLogs = sqliteTable('cdp_audit_logs', {
  audit_log_id: text('audit_log_id').primaryKey(),                   // uuid
  tenant_id: text('tenant_id').notNull().default('default'),
  object_type: text('object_type').notNull(),                        // party | tag | segment | lifecycle | consent | import_task
  object_id: text('object_id').notNull(),
  action: text('action').notNull(),                                  // create | update | delete | merge | split | blacklist | import | export
  operator_id: text('operator_id'),                                  // staff_accounts.id
  operator_name: text('operator_name'),
  before_value: text('before_value'),                                // JSON snapshot
  after_value: text('after_value'),                                  // JSON snapshot
  ip: text('ip'),
  created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (t) => ({
  idxObject: index('cdp_al_tenant_object').on(t.tenant_id, t.object_type, t.object_id),
  idxOperator: index('cdp_al_tenant_operator').on(t.tenant_id, t.operator_id),
  idxTime: index('cdp_al_tenant_time').on(t.tenant_id, t.created_at),
}));

// ── 18. tag — 标签定义 ───────────────────────────────────────────────────

export const cdpTags = sqliteTable('cdp_tags', {
  tag_id: text('tag_id').primaryKey(),                                 // uuid
  tenant_id: text('tenant_id').notNull().default('default'),
  tag_name: text('tag_name').notNull(),
  tag_category: text('tag_category'),                                  // 业务标签 | 行为标签 | 模型标签
  tag_type: text('tag_type').notNull(),                                // manual | rule | model
  description: text('description'),
  rule_config: text('rule_config'),                                    // JSON: 规则型标签的条件配置
  status: text('status').notNull().default('active'),                  // active | disabled
  cover_count: integer('cover_count').notNull().default(0),            // 命中人数缓存
  created_by: text('created_by'),
  created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
  updated_at: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (t) => ({
  uniqName: uniqueIndex('cdp_tag_tenant_name').on(t.tenant_id, t.tag_name),
  idxCategory: index('cdp_tag_tenant_category').on(t.tenant_id, t.tag_category),
}));

// ── 19. party_tag — 客户-标签关系 ────────────────────────────────────────

export const cdpPartyTags = sqliteTable('cdp_party_tags', {
  party_tag_id: text('party_tag_id').primaryKey(),                     // uuid
  tenant_id: text('tenant_id').notNull().default('default'),
  party_id: text('party_id').notNull().references(() => cdpParties.party_id),
  tag_id: text('tag_id').notNull().references(() => cdpTags.tag_id),
  tag_value: text('tag_value'),                                        // 标签值（如等级标签的具体值）
  source: text('source').notNull().default('manual'),                  // manual | rule | model | import
  start_time: integer('start_time', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  end_time: integer('end_time', { mode: 'timestamp' }),                // NULL = 永久
  created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (t) => ({
  uniqPartyTag: uniqueIndex('cdp_pt_tenant_party_tag').on(t.tenant_id, t.party_id, t.tag_id),
  idxTag: index('cdp_pt_tenant_tag').on(t.tenant_id, t.tag_id),
}));

// ── 20. blacklist — 黑名单 ──────────────────────────────────────────────

export const cdpBlacklist = sqliteTable('cdp_blacklist', {
  blacklist_id: text('blacklist_id').primaryKey(),                     // uuid
  tenant_id: text('tenant_id').notNull().default('default'),
  party_id: text('party_id').notNull().references(() => cdpParties.party_id),
  reason: text('reason').notNull(),
  source: text('source').notNull().default('manual'),                  // manual | import | system
  operator_id: text('operator_id'),
  operator_name: text('operator_name'),
  status: text('status').notNull().default('active'),                  // active | removed
  created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
  removed_at: integer('removed_at', { mode: 'timestamp' }),
  removed_by: text('removed_by'),
}, (t) => ({
  idxPartyStatus: index('cdp_bl_tenant_party_status').on(t.tenant_id, t.party_id, t.status),
  idxStatus: index('cdp_bl_tenant_status').on(t.tenant_id, t.status),
}));

// ── 21. segment — 客户分群定义 ──────────────────────────────────────────

export const cdpSegments = sqliteTable('cdp_segments', {
  segment_id: text('segment_id').primaryKey(),                         // uuid
  tenant_id: text('tenant_id').notNull().default('default'),
  segment_name: text('segment_name').notNull(),
  segment_type: text('segment_type').notNull(),                        // dynamic | static
  description: text('description'),
  conditions: text('conditions'),                                      // JSON: 条件编排配置
  estimated_count: integer('estimated_count').notNull().default(0),
  status: text('status').notNull().default('draft'),                   // draft | active | disabled
  created_by: text('created_by'),
  created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
  updated_at: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (t) => ({
  idxTenantStatus: index('cdp_seg_tenant_status').on(t.tenant_id, t.status),
}));

// ── 22. segment_member — 分群成员（静态分群） ─────────────────────────────

export const cdpSegmentMembers = sqliteTable('cdp_segment_members', {
  member_id: text('member_id').primaryKey(),                           // uuid
  tenant_id: text('tenant_id').notNull().default('default'),
  segment_id: text('segment_id').notNull().references(() => cdpSegments.segment_id),
  party_id: text('party_id').notNull().references(() => cdpParties.party_id),
  added_at: integer('added_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (t) => ({
  idxSegment: index('cdp_sm_tenant_segment').on(t.tenant_id, t.segment_id),
  idxParty: index('cdp_sm_tenant_party').on(t.tenant_id, t.party_id),
  uniqMember: uniqueIndex('cdp_sm_tenant_segment_party').on(t.tenant_id, t.segment_id, t.party_id),
}));

// ── 23. lifecycle_stage — 生命周期阶段定义 ──────────────────────────────

export const cdpLifecycleStages = sqliteTable('cdp_lifecycle_stages', {
  stage_id: text('stage_id').primaryKey(),                             // uuid
  tenant_id: text('tenant_id').notNull().default('default'),
  stage_name: text('stage_name').notNull(),
  stage_order: integer('stage_order').notNull(),
  description: text('description'),
  rule_config: text('rule_config'),                                    // JSON: 进入/退出条件
  color: text('color'),                                                // 前端渲染用色
  status: text('status').notNull().default('active'),                  // active | disabled
  created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
  updated_at: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (t) => ({
  idxTenantOrder: index('cdp_ls_tenant_order').on(t.tenant_id, t.stage_order),
}));

// ── 24. party_lifecycle — 客户当前生命周期阶段 ──────────────────────────

export const cdpPartyLifecycle = sqliteTable('cdp_party_lifecycle', {
  party_lifecycle_id: text('party_lifecycle_id').primaryKey(),          // uuid
  tenant_id: text('tenant_id').notNull().default('default'),
  party_id: text('party_id').notNull().references(() => cdpParties.party_id),
  stage_id: text('stage_id').notNull().references(() => cdpLifecycleStages.stage_id),
  entered_at: integer('entered_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
  exited_at: integer('exited_at', { mode: 'timestamp' }),
}, (t) => ({
  idxParty: index('cdp_pl_tenant_party').on(t.tenant_id, t.party_id),
  idxStage: index('cdp_pl_tenant_stage').on(t.tenant_id, t.stage_id),
}));

// ── 25. import_export_task — 导入导出任务 ───────────────────────────────

export const cdpImportExportTasks = sqliteTable('cdp_import_export_tasks', {
  task_id: text('task_id').primaryKey(),                               // uuid
  tenant_id: text('tenant_id').notNull().default('default'),
  task_type: text('task_type').notNull(),                              // import | export
  task_name: text('task_name'),
  status: text('status').notNull().default('pending'),                 // pending | running | success | partial_fail | failed
  file_name: text('file_name'),
  total_count: integer('total_count').notNull().default(0),
  success_count: integer('success_count').notNull().default(0),
  fail_count: integer('fail_count').notNull().default(0),
  fail_detail: text('fail_detail'),                                    // JSON: 失败行及原因
  field_mapping: text('field_mapping'),                                // JSON: 字段映射配置
  operator_id: text('operator_id'),
  operator_name: text('operator_name'),
  created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
  finished_at: integer('finished_at', { mode: 'timestamp' }),
}, (t) => ({
  idxTenantStatus: index('cdp_iet_tenant_status').on(t.tenant_id, t.status),
  idxTenantType: index('cdp_iet_tenant_type').on(t.tenant_id, t.task_type),
}));
