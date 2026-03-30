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

// ── 员工账号 ──────────────────────────────────────────────────────────────

export const staffAccounts = sqliteTable('staff_accounts', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  display_name: text('display_name').notNull(),
  password_hash: text('password_hash').notNull(),
  /** 默认落地页视角：'agent' | 'operations' */
  primary_staff_role: text('primary_staff_role').notNull(),
  /** 可访问的业务角色集合 JSON：["agent"] 或 ["agent","operations"] */
  staff_roles: text('staff_roles').notNull(),
  /** 映射到现有 requireRole 层级：auditor, reviewer, config_editor, flow_manager, admin */
  platform_role: text('platform_role').notNull(),
  team_code: text('team_code'),
  seat_code: text('seat_code'),
  default_queue_code: text('default_queue_code'),
  lang: text('lang').notNull().default('zh'),
  /** 'active' | 'disabled' */
  status: text('status').notNull().default('active'),
  /** 演示账号标记 */
  is_demo: integer('is_demo', { mode: 'boolean' }).notNull().default(false),
  created_at: text('created_at').$defaultFn(() => new Date().toISOString()),
  last_login_at: text('last_login_at'),
});

// ── 员工会话 ──────────────────────────────────────────────────────────────

export const staffSessions = sqliteTable('staff_sessions', {
  id: text('id').primaryKey(),
  staff_id: text('staff_id').notNull().references(() => staffAccounts.id, { onDelete: 'cascade' }),
  token_hash: text('token_hash').notNull(),
  expires_at: text('expires_at').notNull(),
  created_at: text('created_at').$defaultFn(() => new Date().toISOString()),
  last_seen_at: text('last_seen_at'),
  user_agent: text('user_agent'),
  ip: text('ip'),
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

// ── 知识管理（从 km.ts re-export，向后兼容）────────────────────────────────
export {
  kmDocuments,
  kmDocVersions,
  kmDocChunks,
  kmPipelineJobs,
  kmCandidates,
  kmEvidenceRefs,
  kmConflictRecords,
  kmReviewPackages,
  kmActionDrafts,
  kmAssets,
  kmAssetVersions,
  kmGovernanceTasks,
  kmRegressionWindows,
  kmAuditLogs,
  kmReplyFeedback,
  kmRetrievalEvalCases,
} from './km';

// ── MCP 服务管理 ─────────────────────────────────────────────────────────────

export const mcpServers = sqliteTable('mcp_servers', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description').notNull().default(''),
  transport: text('transport').notNull().default('http'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  /** 'internal' = 自研内部服务 | 'external' = 外部第三方 | 'planned' = 计划接入 */
  kind: text('kind').notNull().default('internal'),
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

// ── MCP 工具（独立管理）─────────────────────────────────────────────────────

export const mcpTools = sqliteTable('mcp_tools', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  /** 可读标题（严格 MCP 对齐） */
  title: text('title'),
  description: text('description').notNull().default(''),
  server_id: text('server_id'),
  input_schema: text('input_schema'),
  output_schema: text('output_schema'),
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

// ── 实现层：连接器（MCP Server 的下游后端依赖）──────────────────────────────

export const connectors = sqliteTable('connectors', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  /** 'db' | 'api' */
  type: text('type').notNull(),
  /** 统一配置 JSON */
  config: text('config'),
  status: text('status').notNull().default('active'),
  description: text('description'),
  env_json: text('env_json'),
  env_prod_json: text('env_prod_json'),
  env_test_json: text('env_test_json'),
  /** 可选：归属哪个本地 runtime 域 */
  server_id: text('server_id'),
  created_at: text('created_at').$defaultFn(() => new Date().toISOString()),
  updated_at: text('updated_at').$defaultFn(() => new Date().toISOString()),
});

// ── 实现层：工具实现（Tool → Adapter → Connector 绑定）──────────────────────

export const toolImplementations = sqliteTable('tool_implementations', {
  id: text('id').primaryKey(),
  /** 对应 mcp_tools.id */
  tool_id: text('tool_id').notNull(),
  /** 托管此工具的本地 MCP Server */
  host_server_id: text('host_server_id'),
  /** 'script' | 'db_binding' | 'api_proxy' | 'remote_mcp' | 'mock' */
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

// ── Skill 实例（运行时状态快照）────────────────────────────────────────────

export const skillInstances = sqliteTable('skill_instances', {
  id: text('id').primaryKey(),
  session_id: text('session_id').notNull(),
  skill_id: text('skill_id').notNull(),
  skill_version: integer('skill_version').notNull(),
  status: text('status').notNull(),
  current_step_id: text('current_step_id'),
  pending_confirm: integer('pending_confirm').default(0),
  branch_context: text('branch_context'),
  last_tool_result: text('last_tool_result'),
  revision: integer('revision').default(1),
  started_at: text('started_at').default(sql`(datetime('now'))`),
  updated_at: text('updated_at').default(sql`(datetime('now'))`),
  finished_at: text('finished_at'),
});

// ── Skill 实例事件日志（不可变追加）────────────────────────────────────────

export const skillInstanceEvents = sqliteTable('skill_instance_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  instance_id: text('instance_id').notNull(),
  seq: integer('seq').notNull(),
  event_type: text('event_type').notNull(),
  step_id: text('step_id'),
  tool_name: text('tool_name'),
  payload_json: text('payload_json'),
  created_at: text('created_at').default(sql`(datetime('now'))`),
});

// ── Tool Runtime：执行记录（统一审计链路）──────────────────────────────────

export const executionRecords = sqliteTable('execution_records', {
  id: text('id').primaryKey(),
  trace_id: text('trace_id').notNull(),
  tool_name: text('tool_name').notNull(),
  channel: text('channel').notNull(),
  adapter_type: text('adapter_type').notNull(),
  session_id: text('session_id'),
  user_phone: text('user_phone'),
  skill_name: text('skill_name'),
  success: integer('success', { mode: 'boolean' }).notNull(),
  has_data: integer('has_data', { mode: 'boolean' }).notNull(),
  error_code: text('error_code'),
  latency_ms: integer('latency_ms').notNull(),
  input_json: text('input_json'),
  output_preview: text('output_preview'),
  created_at: text('created_at').$defaultFn(() => new Date().toISOString()),
});
