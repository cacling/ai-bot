/**
 * 平台管理表 — Backend 拥有
 *
 * 这些表由 backend 读写，MCP Server 不访问。
 * 包括：对话、用户、技能注册、知识管理、MCP 配置、测试/运营辅助。
 */
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ── 对话管理 ─────────────────────────────────────────────────────────────────

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
  role: text('role').notNull(),
  content: text('content').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date()).notNull(),
});

// ── 用户与权限 ──────────────────────────────────────────────────────────────

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  role: text('role').notNull(),
  created_at: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// ── 技能注册表 ──────────────────────────────────────────────────────────────

export const skillRegistry = sqliteTable('skill_registry', {
  id: text('id').primaryKey(),
  published_version: integer('published_version'),
  latest_version: integer('latest_version').notNull().default(0),
  description: text('description').notNull().default(''),
  channels: text('channels'),
  mode: text('mode'),
  trigger_keywords: text('trigger_keywords'),
  tool_names: text('tool_names'),
  mermaid: text('mermaid'),
  tags: text('tags'),
  reference_files: text('reference_files'),
  created_at: text('created_at').$defaultFn(() => new Date().toISOString()),
  updated_at: text('updated_at').$defaultFn(() => new Date().toISOString()),
});

// ── 技能版本控制 ────────────────────────────────────────────────────────────

export const skillVersions = sqliteTable('skill_versions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  skill_id: text('skill_id').notNull(),
  version_no: integer('version_no').notNull(),
  status: text('status').notNull().default('draft'),
  snapshot_path: text('snapshot_path'),
  change_description: text('change_description'),
  created_by: text('created_by').default('system'),
  created_at: text('created_at').notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// ── 高风险变更审批 ──────────────────────────────────────────────────────────

export const changeRequests = sqliteTable('change_requests', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  skill_path: text('skill_path').notNull(),
  old_content: text('old_content').notNull(),
  new_content: text('new_content').notNull(),
  description: text('description'),
  requester: text('requester').notNull(),
  status: text('status').notNull().default('pending'),
  reviewer: text('reviewer'),
  reviewed_at: text('reviewed_at'),
  risk_reason: text('risk_reason'),
  created_at: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// ── 回归测试用例 ────────────────────────────────────────────────────────────

export const testCases = sqliteTable('test_cases', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  skill_name: text('skill_name').notNull(),
  input_message: text('input_message').notNull(),
  expected_keywords: text('expected_keywords').notNull(),
  assertions: text('assertions'),
  persona_id: text('persona_id'),
  created_at: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// ── 测试角色（从 business 迁移：运营/测试辅助数据，非客户主数据） ────────

export const testPersonas = sqliteTable('test_personas', {
  id: text('id').primaryKey(),
  label_zh: text('label_zh').notNull(),
  label_en: text('label_en').notNull(),
  category: text('category').notNull(),
  tag_zh: text('tag_zh').notNull(),
  tag_en: text('tag_en').notNull(),
  tag_color: text('tag_color').notNull(),
  context: text('context').notNull(),
  sort_order: integer('sort_order').default(0),
});

// ── 外呼任务配置（从 business 迁移：运营配置数据） ────────────────────────

export const outboundTasks = sqliteTable('outbound_tasks', {
  id: text('id').primaryKey(),
  phone: text('phone').notNull(),
  task_type: text('task_type').notNull(),
  label_zh: text('label_zh').notNull(),
  label_en: text('label_en').notNull(),
  data: text('data').notNull(),
});

// ── 知识管理 ─────────────────────────────────────────────────────────────────

export const kmDocuments = sqliteTable('km_documents', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  source: text('source').notNull().default('upload'),
  classification: text('classification').notNull().default('internal'),
  owner: text('owner'),
  status: text('status').notNull().default('active'),
  created_at: text('created_at').$defaultFn(() => new Date().toISOString()),
  updated_at: text('updated_at').$defaultFn(() => new Date().toISOString()),
});

export const kmDocVersions = sqliteTable('km_doc_versions', {
  id: text('id').primaryKey(),
  document_id: text('document_id').notNull().references(() => kmDocuments.id, { onDelete: 'cascade' }),
  version_no: integer('version_no').notNull().default(1),
  file_path: text('file_path'),
  scope_json: text('scope_json'),
  effective_from: text('effective_from'),
  effective_to: text('effective_to'),
  diff_summary: text('diff_summary'),
  status: text('status').notNull().default('draft'),
  created_at: text('created_at').$defaultFn(() => new Date().toISOString()),
});

export const kmPipelineJobs = sqliteTable('km_pipeline_jobs', {
  id: text('id').primaryKey(),
  doc_version_id: text('doc_version_id').notNull().references(() => kmDocVersions.id, { onDelete: 'cascade' }),
  stage: text('stage').notNull(),
  status: text('status').notNull().default('pending'),
  error_code: text('error_code'),
  error_message: text('error_message'),
  candidate_count: integer('candidate_count').default(0),
  started_at: text('started_at'),
  finished_at: text('finished_at'),
  created_at: text('created_at').$defaultFn(() => new Date().toISOString()),
});

export const kmCandidates = sqliteTable('km_candidates', {
  id: text('id').primaryKey(),
  source_type: text('source_type').notNull(),
  source_ref_id: text('source_ref_id'),
  normalized_q: text('normalized_q').notNull(),
  draft_answer: text('draft_answer'),
  variants_json: text('variants_json'),
  category: text('category'),
  scene_code: text('scene_code'),
  retrieval_tags_json: text('retrieval_tags_json'),
  structured_json: text('structured_json'),
  risk_level: text('risk_level').notNull().default('low'),
  gate_evidence: text('gate_evidence').notNull().default('pending'),
  gate_conflict: text('gate_conflict').notNull().default('pending'),
  gate_ownership: text('gate_ownership').notNull().default('pending'),
  target_asset_id: text('target_asset_id'),
  merge_target_id: text('merge_target_id'),
  status: text('status').notNull().default('draft'),
  review_pkg_id: text('review_pkg_id'),
  created_by: text('created_by'),
  created_at: text('created_at').$defaultFn(() => new Date().toISOString()),
  updated_at: text('updated_at').$defaultFn(() => new Date().toISOString()),
});

export const kmEvidenceRefs = sqliteTable('km_evidence_refs', {
  id: text('id').primaryKey(),
  candidate_id: text('candidate_id'),
  asset_id: text('asset_id'),
  doc_version_id: text('doc_version_id'),
  locator: text('locator'),
  status: text('status').notNull().default('pending'),
  fail_reason: text('fail_reason'),
  rule_version: text('rule_version'),
  reviewed_by: text('reviewed_by'),
  reviewed_at: text('reviewed_at'),
  created_at: text('created_at').$defaultFn(() => new Date().toISOString()),
});

export const kmConflictRecords = sqliteTable('km_conflict_records', {
  id: text('id').primaryKey(),
  conflict_type: text('conflict_type').notNull(),
  item_a_id: text('item_a_id').notNull(),
  item_b_id: text('item_b_id').notNull(),
  overlap_scope: text('overlap_scope'),
  blocking_policy: text('blocking_policy').notNull().default('block_submit'),
  resolution: text('resolution'),
  arbiter: text('arbiter'),
  status: text('status').notNull().default('pending'),
  resolved_at: text('resolved_at'),
  created_at: text('created_at').$defaultFn(() => new Date().toISOString()),
});

export const kmReviewPackages = sqliteTable('km_review_packages', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  status: text('status').notNull().default('draft'),
  risk_level: text('risk_level').notNull().default('low'),
  impact_summary: text('impact_summary'),
  candidate_ids_json: text('candidate_ids_json'),
  approval_policy: text('approval_policy'),
  approval_snapshot: text('approval_snapshot'),
  submitted_by: text('submitted_by'),
  submitted_at: text('submitted_at'),
  approved_by: text('approved_by'),
  approved_at: text('approved_at'),
  created_by: text('created_by'),
  created_at: text('created_at').$defaultFn(() => new Date().toISOString()),
  updated_at: text('updated_at').$defaultFn(() => new Date().toISOString()),
});

export const kmActionDrafts = sqliteTable('km_action_drafts', {
  id: text('id').primaryKey(),
  action_type: text('action_type').notNull(),
  target_asset_id: text('target_asset_id'),
  review_pkg_id: text('review_pkg_id'),
  status: text('status').notNull().default('draft'),
  change_summary: text('change_summary'),
  rollback_point_id: text('rollback_point_id'),
  regression_window_id: text('regression_window_id'),
  executed_by: text('executed_by'),
  executed_at: text('executed_at'),
  created_by: text('created_by'),
  created_at: text('created_at').$defaultFn(() => new Date().toISOString()),
  updated_at: text('updated_at').$defaultFn(() => new Date().toISOString()),
});

export const kmAssets = sqliteTable('km_assets', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  asset_type: text('asset_type').notNull().default('qa'),
  status: text('status').notNull().default('online'),
  current_version: integer('current_version').notNull().default(1),
  scope_json: text('scope_json'),
  owner: text('owner'),
  next_review_date: text('next_review_date'),
  created_at: text('created_at').$defaultFn(() => new Date().toISOString()),
  updated_at: text('updated_at').$defaultFn(() => new Date().toISOString()),
});

export const kmAssetVersions = sqliteTable('km_asset_versions', {
  id: text('id').primaryKey(),
  asset_id: text('asset_id').notNull().references(() => kmAssets.id, { onDelete: 'cascade' }),
  version_no: integer('version_no').notNull(),
  content_snapshot: text('content_snapshot'),
  scope_snapshot: text('scope_snapshot'),
  evidence_summary: text('evidence_summary'),
  structured_snapshot_json: text('structured_snapshot_json'),
  rollback_point_id: text('rollback_point_id'),
  action_draft_id: text('action_draft_id'),
  effective_from: text('effective_from'),
  created_at: text('created_at').$defaultFn(() => new Date().toISOString()),
});

export const kmGovernanceTasks = sqliteTable('km_governance_tasks', {
  id: text('id').primaryKey(),
  task_type: text('task_type').notNull(),
  source_type: text('source_type'),
  source_ref_id: text('source_ref_id'),
  priority: text('priority').notNull().default('medium'),
  assignee: text('assignee'),
  status: text('status').notNull().default('open'),
  due_date: text('due_date'),
  conclusion: text('conclusion'),
  created_at: text('created_at').$defaultFn(() => new Date().toISOString()),
  updated_at: text('updated_at').$defaultFn(() => new Date().toISOString()),
});

export const kmRegressionWindows = sqliteTable('km_regression_windows', {
  id: text('id').primaryKey(),
  linked_type: text('linked_type').notNull(),
  linked_id: text('linked_id').notNull(),
  metrics_json: text('metrics_json'),
  threshold_json: text('threshold_json'),
  verdict: text('verdict').notNull().default('observing'),
  observe_from: text('observe_from'),
  observe_until: text('observe_until'),
  concluded_at: text('concluded_at'),
  created_at: text('created_at').$defaultFn(() => new Date().toISOString()),
});

export const kmAuditLogs = sqliteTable('km_audit_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  action: text('action').notNull(),
  object_type: text('object_type').notNull(),
  object_id: text('object_id').notNull(),
  operator: text('operator').notNull().default('system'),
  risk_level: text('risk_level'),
  detail_json: text('detail_json'),
  created_at: text('created_at').$defaultFn(() => new Date().toISOString()),
});

export const kmReplyFeedback = sqliteTable('km_reply_feedback', {
  id: text('id').primaryKey(),
  session_id: text('session_id'),
  phone: text('phone'),
  message_id: text('message_id'),
  asset_version_id: text('asset_version_id'),
  event_type: text('event_type').notNull(), // 'shown' | 'use' | 'copy' | 'edit' | 'dismiss'
  detail_json: text('detail_json'),
  created_at: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// ── MCP 服务管理 ─────────────────────────────────────────────────────────────

export const mcpServers = sqliteTable('mcp_servers', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description').notNull().default(''),
  transport: text('transport').notNull().default('http'),
  status: text('status').notNull().default('active'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  url: text('url'),
  headers_json: text('headers_json'),
  command: text('command'),
  args_json: text('args_json'),
  cwd: text('cwd'),
  env_json: text('env_json'),
  env_prod_json: text('env_prod_json'),
  env_test_json: text('env_test_json'),
  tools_json: text('tools_json'),
  disabled_tools: text('disabled_tools'),
  mocked_tools: text('mocked_tools'),
  mock_rules: text('mock_rules'),
  last_connected_at: text('last_connected_at'),
  /** Server capabilities JSON（严格 MCP 对齐：记录 server 支持的 capabilities） */
  capabilities: text('capabilities'),
  /** 最近一次 discover 时间 */
  last_discovered_at: text('last_discovered_at'),
  created_at: text('created_at').$defaultFn(() => new Date().toISOString()),
  updated_at: text('updated_at').$defaultFn(() => new Date().toISOString()),
});

// ── @deprecated 迁移到 connectors 表。保留期间仍可读写，待 Phase 9 清理完成后删除 ──

/** @deprecated Use `connectors` table instead. See docs/glossary.md */
export const mcpResources = sqliteTable('mcp_resources', {
  id: text('id').primaryKey(),
  server_id: text('server_id').notNull(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  status: text('status').notNull().default('active'),
  mcp_transport: text('mcp_transport'),
  mcp_url: text('mcp_url'),
  mcp_headers: text('mcp_headers'),
  mcp_tool_name: text('mcp_tool_name'),
  db_mode: text('db_mode'),
  db_table: text('db_table'),
  db_operation: text('db_operation'),
  db_where: text('db_where'),
  db_columns: text('db_columns'),
  db_set_columns: text('db_set_columns'),
  db_set_fixed: text('db_set_fixed'),
  api_base_url: text('api_base_url'),
  api_method: text('api_method'),
  api_path: text('api_path'),
  api_headers: text('api_headers'),
  api_body_template: text('api_body_template'),
  api_timeout: integer('api_timeout'),
  env_json: text('env_json'),
  env_prod_json: text('env_prod_json'),
  env_test_json: text('env_test_json'),
  description: text('description'),
  created_at: text('created_at').$defaultFn(() => new Date().toISOString()),
  updated_at: text('updated_at').$defaultFn(() => new Date().toISOString()),
});

// ── MCP 工具（独立管理）─────────────────────────────────────────────────────

export const mcpTools = sqliteTable('mcp_tools', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  /** 可读标题（严格 MCP 对齐） */
  title: text('title'),
  description: text('description').notNull().default(''),
  server_id: text('server_id'),
  /** @deprecated 迁移到 tool_implementations.adapter_type，过渡期保留 */
  impl_type: text('impl_type'),
  input_schema: text('input_schema'),
  output_schema: text('output_schema'),
  /** @deprecated 迁移到 tool_implementations.config，过渡期保留 */
  execution_config: text('execution_config'),
  /** @deprecated 迁移到 tool_implementations.handler_key，过渡期保留 */
  handler_key: text('handler_key'),
  mock_rules: text('mock_rules'),
  mocked: integer('mocked', { mode: 'boolean' }).notNull().default(false),
  disabled: integer('disabled', { mode: 'boolean' }).notNull().default(false),
  response_example: text('response_example'),
  /** Tool 语义标注 JSON（readOnlyHint, idempotentHint, openWorldHint） */
  annotations: text('annotations'),
  /** 来源：'discovered' = 从 MCP Server 发现 | 'local_managed' = 本地管理 */
  origin: text('origin'),
  created_at: text('created_at').$defaultFn(() => new Date().toISOString()),
  updated_at: text('updated_at').$defaultFn(() => new Date().toISOString()),
});

// ══════════════════════════════════════════════════════════════════════════════
// 严格 MCP 对齐：新增三层架构表
// 参考：docs/glossary.md
// ══════════════════════════════════════════════════════════════════════════════

// ── 实现层：连接器（原 mcp_resources 中的 DB/API/Remote MCP 连接）──────────

export const connectors = sqliteTable('connectors', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  /** 'db' | 'api' | 'remote_mcp' */
  type: text('type').notNull(),
  /** 统一配置 JSON（取代 mcp_resources 中的 db/api/mcp 字段） */
  config: text('config'),
  status: text('status').notNull().default('active'),
  description: text('description'),
  env_json: text('env_json'),
  env_prod_json: text('env_prod_json'),
  env_test_json: text('env_test_json'),
  /** 可选：归属哪个本地 runtime 域 */
  server_id: text('server_id'),
  /** 迁移追踪：原 mcp_resources.id */
  migrated_from: text('migrated_from'),
  created_at: text('created_at').$defaultFn(() => new Date().toISOString()),
  updated_at: text('updated_at').$defaultFn(() => new Date().toISOString()),
});

// ── 实现层：工具实现（从 mcp_tools.execution_config 拆出）─────────────────

export const toolImplementations = sqliteTable('tool_implementations', {
  id: text('id').primaryKey(),
  /** 对应 mcp_tools.id */
  tool_id: text('tool_id').notNull(),
  /** 托管此工具的本地 MCP Server */
  host_server_id: text('host_server_id'),
  /** 'script' | 'db_binding' | 'api_proxy' */
  adapter_type: text('adapter_type').notNull(),
  /** 依赖的 connector */
  connector_id: text('connector_id'),
  /** 实现配置 JSON */
  config: text('config'),
  /** 脚本模式：handler key */
  handler_key: text('handler_key'),
  status: text('status').notNull().default('active'),
  created_at: text('created_at').$defaultFn(() => new Date().toISOString()),
  updated_at: text('updated_at').$defaultFn(() => new Date().toISOString()),
});

// ── Skill 编排层：技能-工具绑定（显式化 Skill→Tool 关系）──────────────────

export const skillToolBindings = sqliteTable('skill_tool_bindings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  skill_id: text('skill_id').notNull(),
  tool_name: text('tool_name').notNull(),
  /** 在 Tool Call Plan 中的顺序 */
  call_order: integer('call_order'),
  /** 'query' | 'action' | 'check' */
  purpose: text('purpose'),
  /** 触发条件描述 */
  trigger_condition: text('trigger_condition'),
  /** 参数映射规则 JSON：{ skill_param → tool_param } */
  arg_mapping: text('arg_mapping'),
  /** 结果后处理规则 JSON */
  result_mapping: text('result_mapping'),
  created_at: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// ── MCP 协议层：Prompt 目录（来自 prompts/list 发现）─────────────────────

export const mcpPrompts = sqliteTable('mcp_prompts', {
  id: text('id').primaryKey(),
  server_id: text('server_id').notNull(),
  name: text('name').notNull(),
  title: text('title'),
  description: text('description'),
  /** Prompt 参数定义 JSON Schema */
  arguments_schema: text('arguments_schema'),
  /** 可选元数据 JSON */
  annotations: text('annotations'),
  discovered_at: text('discovered_at'),
  created_at: text('created_at').$defaultFn(() => new Date().toISOString()),
  updated_at: text('updated_at').$defaultFn(() => new Date().toISOString()),
});

// ── MCP 协议层：Server 同步记录 ──────────────────────────────────────────

export const mcpServerSyncRuns = sqliteTable('mcp_server_sync_runs', {
  id: text('id').primaryKey(),
  server_id: text('server_id').notNull(),
  /** 'discover' | 'health' */
  kind: text('kind').notNull(),
  /** 'success' | 'error' | 'running' */
  status: text('status').notNull(),
  /** 摘要 JSON（tools_count, resources_count, prompts_count 等） */
  summary: text('summary'),
  error_message: text('error_message'),
  started_at: text('started_at'),
  finished_at: text('finished_at'),
});

// ── Skill Workflow Specs ────────────────────────────────────────────

export const skillWorkflowSpecs = sqliteTable('skill_workflow_specs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  skill_id: text('skill_id').notNull(),
  version_no: integer('version_no').notNull(),
  status: text('status').notNull(),
  mermaid_checksum: text('mermaid_checksum'),
  spec_json: text('spec_json').notNull(),
  created_at: text('created_at').default(sql`(datetime('now'))`),
  updated_at: text('updated_at').default(sql`(datetime('now'))`),
}, (t) => ({
  uniqSkillVersion: uniqueIndex('skill_workflow_specs_skill_id_version_no_unique').on(t.skill_id, t.version_no),
}));
