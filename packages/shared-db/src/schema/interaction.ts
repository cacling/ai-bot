/**
 * Interaction Platform — 实时互动中枢领域表
 *
 * 7 张核心表：conversation, interaction, interaction_event, offer, assignment, routing_queue, agent_presence
 * 数据库文件：interaction.db
 *
 * 设计原则：
 * - conversation 是连续性容器（跨渠道、跨时间）
 * - interaction 是可路由工作对象（materialized 后才进入 ACD）
 * - 状态机: created → queued → offered → assigned → active → wrapping_up → closed
 * - 插件化的是路由策略，不是状态机
 */
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// ── 1. conversation — 私域连续性容器 ────────────────────────────────────────

export const ixConversations = sqliteTable('ix_conversations', {
  conversation_id: text('conversation_id').primaryKey(),               // uuid
  tenant_id: text('tenant_id').notNull().default('default'),
  customer_party_id: text('customer_party_id'),                       // → cdp_parties.party_id
  channel: text('channel').notNull(),                                 // web_chat | voice | outbound | email | dm | sms
  domain_scope: text('domain_scope').notNull().default('private_interaction'), // private_interaction | public_engagement
  status: text('status').notNull().default('active'),                 // active | idle | closed
  subject: text('subject'),
  metadata_json: text('metadata_json'),                               // 渠道特定扩展字段
  created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
  updated_at: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (t) => ({
  idxTenantPartyStatus: index('ix_conv_tenant_party_status').on(t.tenant_id, t.customer_party_id, t.status),
  idxTenantChannel: index('ix_conv_tenant_channel').on(t.tenant_id, t.channel, t.status),
}));

// ── 2. interaction — ACD 统一可路由工作对象 ─────────────────────────────────

export const ixInteractions = sqliteTable('ix_interactions', {
  interaction_id: text('interaction_id').primaryKey(),                 // uuid
  tenant_id: text('tenant_id').notNull().default('default'),
  conversation_id: text('conversation_id').notNull(),                 // → ix_conversations.conversation_id
  domain_scope: text('domain_scope').notNull().default('private_interaction'),
  work_model: text('work_model').notNull(),                           // live_chat | live_voice | async_thread | async_case | async_public_engagement
  source_object_type: text('source_object_type').notNull().default('conversation'), // conversation | email_thread | engagement_item | engagement_thread
  source_object_id: text('source_object_id').notNull(),
  customer_party_id: text('customer_party_id'),                       // → cdp_parties.party_id
  provider: text('provider'),                                         // internal_web | internal_voice | whatsapp | messenger_dm | ...
  queue_code: text('queue_code'),                                     // → ix_routing_queues.queue_code
  routing_mode: text('routing_mode').notNull().default('direct_assign'), // push_offer | direct_assign | pull_claim | sticky_reopen
  priority: integer('priority').notNull().default(50),                // 0(最高) – 100(最低)
  state: text('state').notNull().default('created'),
    // 状态机:
    // created → queued, abandoned, assigned(direct_assign)
    // queued  → offered, assigned, abandoned, overflow
    // offered → assigned(accepted), queued(declined/expired)
    // assigned → active
    // active  → wrapping_up, transferred, abandoned
    // transferred → queued
    // wrapping_up → closed
  assigned_agent_id: text('assigned_agent_id'),                       // → staff_accounts.id
  handoff_summary: text('handoff_summary'),                           // bot 转人工摘要
  first_response_due_at: integer('first_response_due_at', { mode: 'timestamp' }),
  next_response_due_at: integer('next_response_due_at', { mode: 'timestamp' }),
  wrap_up_code: text('wrap_up_code'),                                 // resolved | follow_up_needed | escalated
  wrap_up_note: text('wrap_up_note'),
  closed_at: integer('closed_at', { mode: 'timestamp' }),
  created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
  updated_at: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (t) => ({
  idxTenantConversation: index('ix_intr_tenant_conv').on(t.tenant_id, t.conversation_id),
  idxTenantAgentState: index('ix_intr_tenant_agent_state').on(t.tenant_id, t.assigned_agent_id, t.state),
  idxTenantQueueState: index('ix_intr_tenant_queue_state').on(t.tenant_id, t.queue_code, t.state),
  idxTenantState: index('ix_intr_tenant_state').on(t.tenant_id, t.state),
}));

// ── 3. interaction_event — append-only 审计追踪 ─────────────────────────────

export const ixInteractionEvents = sqliteTable('ix_interaction_events', {
  event_id: integer('event_id').primaryKey({ autoIncrement: true }),
  interaction_id: text('interaction_id').notNull(),                    // → ix_interactions.interaction_id
  event_type: text('event_type').notNull(),                           // created | queued | offered | assigned | active | transferred | wrapping_up | closed | message | follow_up_created | ...
  actor_type: text('actor_type').notNull(),                           // system | agent | customer | bot
  actor_id: text('actor_id'),
  from_state: text('from_state'),
  to_state: text('to_state'),
  payload_json: text('payload_json'),                                 // 事件详情
  created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (t) => ({
  idxInteraction: index('ix_ie_interaction').on(t.interaction_id, t.created_at),
  idxType: index('ix_ie_type').on(t.event_type, t.created_at),
}));

// ── 4. offer — 坐席 offer 跟踪 ────────────────────────────────────────────

export const ixOffers = sqliteTable('ix_offers', {
  offer_id: text('offer_id').primaryKey(),                            // uuid
  interaction_id: text('interaction_id').notNull(),                    // → ix_interactions.interaction_id
  agent_id: text('agent_id').notNull(),                               // → staff_accounts.id
  status: text('status').notNull().default('pending'),                // pending | accepted | declined | expired | revoked
  offered_at: integer('offered_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
  responded_at: integer('responded_at', { mode: 'timestamp' }),
  expires_at: integer('expires_at', { mode: 'timestamp' }),
}, (t) => ({
  idxInteraction: index('ix_offer_interaction').on(t.interaction_id),
  idxAgentStatus: index('ix_offer_agent_status').on(t.agent_id, t.status),
}));

// ── 5. assignment — 分配历史 ───────────────────────────────────────────────

export const ixAssignments = sqliteTable('ix_assignments', {
  assignment_id: text('assignment_id').primaryKey(),                   // uuid
  interaction_id: text('interaction_id').notNull(),                    // → ix_interactions.interaction_id
  agent_id: text('agent_id').notNull(),                               // → staff_accounts.id
  assignment_type: text('assignment_type').notNull().default('primary'), // primary | transfer | escalation
  assigned_at: integer('assigned_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
  released_at: integer('released_at', { mode: 'timestamp' }),
  release_reason: text('release_reason'),                             // completed | transferred | abandoned | timeout
}, (t) => ({
  idxInteraction: index('ix_asgn_interaction').on(t.interaction_id),
  idxAgent: index('ix_asgn_agent').on(t.agent_id, t.released_at),
}));

// ── 6. routing_queue — 路由队列配置 ─────────────────────────────────────────

export const ixRoutingQueues = sqliteTable('ix_routing_queues', {
  queue_code: text('queue_code').primaryKey(),
  tenant_id: text('tenant_id').notNull().default('default'),
  display_name_zh: text('display_name_zh').notNull(),
  display_name_en: text('display_name_en').notNull(),
  domain_scope: text('domain_scope').notNull().default('private_interaction'),
  work_model: text('work_model').notNull().default('live_chat'),      // live_chat | live_voice | async_thread | async_case | async_public_engagement
  priority: integer('priority').notNull().default(50),
  max_wait_seconds: integer('max_wait_seconds').default(300),
  overflow_queue: text('overflow_queue'),                             // → ix_routing_queues.queue_code
  status: text('status').notNull().default('active'),                 // active | paused | disabled
  config_json: text('config_json'),                                   // 队列级扩展配置
  created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (t) => ({
  idxTenantDomain: index('ix_rq_tenant_domain').on(t.tenant_id, t.domain_scope, t.status),
}));

// ── 7. agent_presence — 坐席在线状态与容量 ──────────────────────────────────

export const ixAgentPresence = sqliteTable('ix_agent_presence', {
  agent_id: text('agent_id').primaryKey(),                            // → staff_accounts.id
  tenant_id: text('tenant_id').notNull().default('default'),
  presence_status: text('presence_status').notNull().default('offline'), // online | away | dnd | offline
  max_chat_slots: integer('max_chat_slots').notNull().default(3),
  max_voice_slots: integer('max_voice_slots').notNull().default(1),
  active_chat_count: integer('active_chat_count').notNull().default(0),
  active_voice_count: integer('active_voice_count').notNull().default(0),
  queue_codes_json: text('queue_codes_json'),                         // JSON 数组：坐席所属队列列表
  last_heartbeat_at: integer('last_heartbeat_at', { mode: 'timestamp' }),
  updated_at: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (t) => ({
  idxTenantStatus: index('ix_ap_tenant_status').on(t.tenant_id, t.presence_status),
}));

// ══════════════════════════════════════════════════════════════════════════════
// Phase 4: Public Engagement Domain
// ══════════════════════════════════════════════════════════════════════════════

// ── 8. content_asset — 公开内容资产 ────────────────────────────────────────

export const ixContentAssets = sqliteTable('ix_content_assets', {
  asset_id: text('asset_id').primaryKey(),                              // uuid
  tenant_id: text('tenant_id').notNull().default('default'),
  provider: text('provider').notNull(),                                 // mock | weibo | wechat | douyin | xiaohongshu
  platform_id: text('platform_id'),                                     // 平台侧 ID
  asset_type: text('asset_type').notNull(),                             // post | story | video | article | tweet
  author_id: text('author_id'),                                         // 平台侧作者 ID
  author_name: text('author_name'),
  title: text('title'),
  body: text('body'),                                                   // 正文内容
  url: text('url'),                                                     // 原始链接
  media_urls_json: text('media_urls_json'),                             // JSON 数组
  tags_json: text('tags_json'),                                         // JSON 数组
  metrics_json: text('metrics_json'),                                   // { likes, shares, comments, views }
  published_at: integer('published_at', { mode: 'timestamp' }),
  ingested_at: integer('ingested_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (t) => ({
  idxProvider: index('ix_ca_provider').on(t.tenant_id, t.provider, t.asset_type),
  idxPlatformId: uniqueIndex('ix_ca_platform_id').on(t.provider, t.platform_id),
}));

// ── 9. engagement_item — 公开互动项 ───────────────────────────────────────

export const ixEngagementItems = sqliteTable('ix_engagement_items', {
  item_id: text('item_id').primaryKey(),                                // uuid
  tenant_id: text('tenant_id').notNull().default('default'),
  asset_id: text('asset_id'),                                           // → ix_content_assets.asset_id
  provider: text('provider').notNull(),                                 // mock | weibo | wechat | ...
  platform_id: text('platform_id'),                                     // 平台侧互动 ID
  item_type: text('item_type').notNull(),                               // comment | reply | mention | dm | review
  parent_item_id: text('parent_item_id'),                               // 父互动 ID（回复场景）
  author_id: text('author_id'),
  author_name: text('author_name'),
  author_avatar_url: text('author_avatar_url'),
  body: text('body').notNull(),
  sentiment: text('sentiment'),                                         // positive | neutral | negative | unknown
  sentiment_score: real('sentiment_score'),                             // -1.0 ~ 1.0
  language: text('language'),                                           // zh | en | ...
  url: text('url'),
  media_urls_json: text('media_urls_json'),
  metadata_json: text('metadata_json'),
  status: text('status').notNull().default('new'),                      // new | triaged | actioned | ignored
  published_at: integer('published_at', { mode: 'timestamp' }),
  ingested_at: integer('ingested_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (t) => ({
  idxAsset: index('ix_ei_asset').on(t.asset_id),
  idxTenantStatus: index('ix_ei_tenant_status').on(t.tenant_id, t.status),
  idxProvider: index('ix_ei_provider').on(t.provider, t.item_type),
}));

// ── 10. triage_result — triage 输出 ───────────────────────────────────────

export const ixTriageResults = sqliteTable('ix_triage_results', {
  triage_id: text('triage_id').primaryKey(),                            // uuid
  item_id: text('item_id').notNull(),                                   // → ix_engagement_items.item_id
  classification: text('classification').notNull(),                     // complaint | inquiry | praise | spam | crisis | general
  risk_level: text('risk_level').notNull(),                             // low | medium | high | critical
  recommendation: text('recommendation').notNull(),                     // materialize | convert_private | moderate_only | ignore
  confidence: real('confidence'),                                       // 0.0 ~ 1.0
  reason: text('reason'),                                               // 规则/模型说明
  matched_rules_json: text('matched_rules_json'),                       // JSON 数组：匹配的规则 ID
  materialized_interaction_id: text('materialized_interaction_id'),      // → ix_interactions.interaction_id（如果 materialized）
  created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (t) => ({
  idxItem: index('ix_tr_item').on(t.item_id),
  idxRecommendation: index('ix_tr_recommendation').on(t.recommendation),
}));

// ── 11. moderation_action — 审核动作 ──────────────────────────────────────

export const ixModerationActions = sqliteTable('ix_moderation_actions', {
  action_id: text('action_id').primaryKey(),                            // uuid
  item_id: text('item_id').notNull(),                                   // → ix_engagement_items.item_id
  action_type: text('action_type').notNull(),                           // reply | hide | delete | escalate | flag | approve
  actor_type: text('actor_type').notNull(),                             // agent | system | auto_rule
  actor_id: text('actor_id'),
  content: text('content'),                                             // 回复内容（action_type=reply 时）
  reason: text('reason'),
  metadata_json: text('metadata_json'),
  created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (t) => ({
  idxItem: index('ix_ma_item').on(t.item_id),
}));

// ══════════════════════════════════════════════════════════════════════════════
// Phase 5: Plugin System & Advanced Operations
// ══════════════════════════════════════════════════════════════════════════════

// ── 12. plugin_catalog — 插件注册表 ──────────────────────────────────────────

export const ixPluginCatalog = sqliteTable('ix_plugin_catalog', {
  plugin_id: text('plugin_id').primaryKey(),                              // uuid
  tenant_id: text('tenant_id').notNull().default('default'),
  name: text('name').notNull(),                                           // 唯一标识名（如 "vip_priority_scorer"）
  display_name_zh: text('display_name_zh').notNull(),
  display_name_en: text('display_name_en').notNull(),
  description: text('description'),
  plugin_type: text('plugin_type').notNull(),                             // queue_selector | candidate_scorer | offer_strategy | overflow_policy
  handler_module: text('handler_module').notNull(),                       // 模块路径或内置标识
  config_schema_json: text('config_schema_json'),                         // JSON Schema 描述插件可配项
  default_config_json: text('default_config_json'),                       // 默认配置
  timeout_ms: integer('timeout_ms').notNull().default(3000),
  fallback_behavior: text('fallback_behavior').notNull().default('use_core'), // use_core | skip | error
  status: text('status').notNull().default('active'),                     // active | disabled | deprecated
  version: text('version').notNull().default('1.0.0'),
  created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
  updated_at: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (t) => ({
  idxTenantType: index('ix_pc_tenant_type').on(t.tenant_id, t.plugin_type, t.status),
  idxName: uniqueIndex('ix_pc_name').on(t.tenant_id, t.name),
}));

// ── 13. plugin_binding — 插件绑定到队列 ─────────────────────────────────────

export const ixPluginBindings = sqliteTable('ix_plugin_bindings', {
  binding_id: text('binding_id').primaryKey(),                            // uuid
  tenant_id: text('tenant_id').notNull().default('default'),
  queue_code: text('queue_code').notNull(),                               // → ix_routing_queues.queue_code
  plugin_id: text('plugin_id').notNull(),                                 // → ix_plugin_catalog.plugin_id
  slot: text('slot').notNull(),                                           // queue_selector | candidate_scorer | offer_strategy | overflow_policy
  priority_order: integer('priority_order').notNull().default(0),         // 同 slot 多个插件时的执行顺序
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  config_override_json: text('config_override_json'),                     // 队列级覆盖配置
  shadow_mode: integer('shadow_mode', { mode: 'boolean' }).notNull().default(false), // shadow = 并行执行但不影响结果
  created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (t) => ({
  idxQueueSlot: index('ix_pb_queue_slot').on(t.queue_code, t.slot, t.priority_order),
  idxPlugin: index('ix_pb_plugin').on(t.plugin_id),
}));

// ── 14. plugin_execution_log — 插件执行审计 ──────────────────────────────────

export const ixPluginExecutionLogs = sqliteTable('ix_plugin_execution_logs', {
  log_id: integer('log_id').primaryKey({ autoIncrement: true }),
  tenant_id: text('tenant_id').notNull().default('default'),
  interaction_id: text('interaction_id').notNull(),                       // → ix_interactions.interaction_id
  plugin_id: text('plugin_id').notNull(),                                 // → ix_plugin_catalog.plugin_id
  binding_id: text('binding_id'),                                         // → ix_plugin_bindings.binding_id
  slot: text('slot').notNull(),
  shadow: integer('shadow', { mode: 'boolean' }).notNull().default(false),
  input_snapshot_json: text('input_snapshot_json'),                       // 序列化的输入快照
  output_snapshot_json: text('output_snapshot_json'),                     // 序列化的输出快照
  duration_ms: integer('duration_ms'),
  status: text('status').notNull(),                                       // success | timeout | error | fallback
  error_message: text('error_message'),
  created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (t) => ({
  idxInteraction: index('ix_pel_interaction').on(t.interaction_id),
  idxPlugin: index('ix_pel_plugin').on(t.plugin_id, t.created_at),
  idxSlot: index('ix_pel_slot').on(t.slot, t.status),
}));

// ══════════════════════════════════════════════════════════════════════════════
// Phase 6: Routing Management — 路由规则、回放任务、操作审计
// ══════════════════════════════════════════════════════════════════════════════

// ── 15. route_rule — 路由规则配置 ───────────────────────────────────────────

export const ixRouteRules = sqliteTable('ix_route_rules', {
  rule_id: text('rule_id').primaryKey(),                                     // uuid
  tenant_id: text('tenant_id').notNull().default('default'),
  rule_name: text('rule_name').notNull(),
  rule_type: text('rule_type').notNull(),                                    // condition_match | default_fallback | time_based
  queue_code: text('queue_code').notNull(),                                  // → ix_routing_queues.queue_code
  condition_json: text('condition_json'),                                    // { work_model?, channel?, priority_range?, provider?, customer_tags? }
  action_json: text('action_json'),                                          // { set_priority?, set_routing_mode?, metadata? }
  priority_order: integer('priority_order').notNull().default(0),            // 越小越先评估
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  grayscale_pct: integer('grayscale_pct').notNull().default(100),           // 0-100 灰度比例
  version: integer('version').notNull().default(1),
  effective_from: integer('effective_from', { mode: 'timestamp' }),
  effective_to: integer('effective_to', { mode: 'timestamp' }),
  created_by: text('created_by'),
  created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
  updated_at: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (t) => ({
  idxTenantEnabled: index('ix_rr_tenant_enabled').on(t.tenant_id, t.enabled, t.priority_order),
  idxTenantNameVersion: uniqueIndex('ix_rr_tenant_name_version').on(t.tenant_id, t.rule_name, t.version),
}));

// ── 16. route_replay_task — 批量回放任务 ────────────────────────────────────

export const ixRouteReplayTasks = sqliteTable('ix_route_replay_tasks', {
  task_id: text('task_id').primaryKey(),                                      // uuid
  tenant_id: text('tenant_id').notNull().default('default'),
  task_name: text('task_name'),
  interaction_ids_json: text('interaction_ids_json').notNull(),               // JSON 数组
  override_queue_code: text('override_queue_code'),
  status: text('status').notNull().default('pending'),                       // pending | running | completed | failed
  total_count: integer('total_count').notNull().default(0),
  completed_count: integer('completed_count').notNull().default(0),
  divergence_count: integer('divergence_count').notNull().default(0),
  results_json: text('results_json'),                                        // JSON 数组 ReplayResult 摘要
  error_message: text('error_message'),
  created_by: text('created_by'),
  started_at: integer('started_at', { mode: 'timestamp' }),
  completed_at: integer('completed_at', { mode: 'timestamp' }),
  created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (t) => ({
  idxTenantStatus: index('ix_rrt_tenant_status').on(t.tenant_id, t.status, t.created_at),
}));

// ── 17. route_operation_audit — 路由操作审计 ─────────────────────────────────

export const ixRouteOperationAudit = sqliteTable('ix_route_operation_audit', {
  audit_id: integer('audit_id').primaryKey({ autoIncrement: true }),
  tenant_id: text('tenant_id').notNull().default('default'),
  operator_id: text('operator_id'),
  operation_type: text('operation_type').notNull(),                          // rule_create | rule_update | rule_delete | binding_change | queue_config | manual_assign | manual_retry | manual_transfer | replay_trigger
  target_type: text('target_type').notNull(),                                // route_rule | plugin_binding | queue | interaction | replay_task
  target_id: text('target_id').notNull(),
  before_snapshot_json: text('before_snapshot_json'),
  after_snapshot_json: text('after_snapshot_json'),
  metadata_json: text('metadata_json'),
  created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (t) => ({
  idxTenantOpType: index('ix_roa_tenant_op_type').on(t.tenant_id, t.operation_type, t.created_at),
  idxTarget: index('ix_roa_target').on(t.target_type, t.target_id),
}));
