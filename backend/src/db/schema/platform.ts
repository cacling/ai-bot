import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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
  role: text('role').notNull(), // 'user' | 'assistant'
  content: text('content').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date()).notNull(),
});

// ── 用户与权限 ──────────────────────────────────────────────────────────────

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  role: text('role').notNull(),  // 'config_editor' | 'flow_manager' | 'admin' | 'reviewer' | 'auditor'
  created_at: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// ── 技能注册表 ──────────────────────────────────────────────────────────────

export const skillRegistry = sqliteTable('skill_registry', {
  id:                text('id').primaryKey(),                // skill 目录名，如 "bill-inquiry"
  published_version: integer('published_version'),          // 当前发布的版本号
  latest_version:    integer('latest_version').notNull().default(0),
  description:       text('description').notNull().default(''),
  // ── 技能元数据（从 SKILL.md frontmatter + 正文提取）────────────────────────
  channels:          text('channels'),                       // JSON: ["online","voice"]
  mode:              text('mode'),                           // "inbound" | "outbound"
  trigger_keywords:  text('trigger_keywords'),               // JSON: ["停机保号","暂停服务"]
  tool_names:        text('tool_names'),                     // JSON: ["verify_identity","check_account_balance"]
  mermaid:           text('mermaid'),                        // Mermaid 状态图原文（不含 ```mermaid 围栏）
  tags:              text('tags'),                           // JSON: ["停机","保号"]
  reference_files:   text('reference_files'),                // JSON: ["suspend-rules.md"]
  created_at:        text('created_at').$defaultFn(() => new Date().toISOString()),
  updated_at:        text('updated_at').$defaultFn(() => new Date().toISOString()),
});

// ── 技能版本控制 ────────────────────────────────────────────────────────────

export const skillVersions = sqliteTable('skill_versions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  skill_id: text('skill_id').notNull(),                    // FK → skill_registry.id
  version_no: integer('version_no').notNull(),             // 每个 skill 独立编号: 1, 2, 3...
  status: text('status').notNull().default('draft'),       // 'draft' | 'saved' | 'published'
  snapshot_path: text('snapshot_path'),                     // 版本快照目录相对路径
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
  status: text('status').notNull().default('pending'), // 'pending' | 'approved' | 'rejected'
  reviewer: text('reviewer'),
  reviewed_at: text('reviewed_at'),
  risk_reason: text('risk_reason'), // why flagged as high risk
  created_at: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// ── 回归测试用例 ────────────────────────────────────────────────────────────

export const testCases = sqliteTable('test_cases', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  skill_name: text('skill_name').notNull(),
  input_message: text('input_message').notNull(),
  expected_keywords: text('expected_keywords').notNull(), // JSON array of strings（兼容旧格式）
  assertions: text('assertions'),                        // JSON array of Assertion objects（新格式）
  persona_id: text('persona_id'),  // 引用 test_personas.id，可为空（用默认）
  created_at: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// ── 知识管理 ─────────────────────────────────────────────────────────────────

export const kmDocuments = sqliteTable('km_documents', {
  id:             text('id').primaryKey(),
  title:          text('title').notNull(),
  source:         text('source').notNull().default('upload'), // 'upload' | 'connector'
  classification: text('classification').notNull().default('internal'), // 'public'|'internal'|'sensitive'
  owner:          text('owner'),
  status:         text('status').notNull().default('active'),
  created_at:     text('created_at').$defaultFn(() => new Date().toISOString()),
  updated_at:     text('updated_at').$defaultFn(() => new Date().toISOString()),
});

export const kmDocVersions = sqliteTable('km_doc_versions', {
  id:             text('id').primaryKey(),
  document_id:    text('document_id').notNull().references(() => kmDocuments.id, { onDelete: 'cascade' }),
  version_no:     integer('version_no').notNull().default(1),
  file_path:      text('file_path'),
  scope_json:     text('scope_json'),         // JSON: {tenant,region,channel,segment}
  effective_from: text('effective_from'),
  effective_to:   text('effective_to'),
  diff_summary:   text('diff_summary'),
  status:         text('status').notNull().default('draft'), // 'draft'|'parsing'|'parsed'|'failed'
  created_at:     text('created_at').$defaultFn(() => new Date().toISOString()),
});

export const kmPipelineJobs = sqliteTable('km_pipeline_jobs', {
  id:              text('id').primaryKey(),
  doc_version_id:  text('doc_version_id').notNull().references(() => kmDocVersions.id, { onDelete: 'cascade' }),
  stage:           text('stage').notNull(),     // 'parse'|'chunk'|'generate'|'validate'
  status:          text('status').notNull().default('pending'), // 'pending'|'running'|'success'|'failed'
  error_code:      text('error_code'),
  error_message:   text('error_message'),
  candidate_count: integer('candidate_count').default(0),
  started_at:      text('started_at'),
  finished_at:     text('finished_at'),
  created_at:      text('created_at').$defaultFn(() => new Date().toISOString()),
});

export const kmCandidates = sqliteTable('km_candidates', {
  id:              text('id').primaryKey(),
  source_type:     text('source_type').notNull(), // 'parsing'|'feedback'|'manual'
  source_ref_id:   text('source_ref_id'),
  normalized_q:    text('normalized_q').notNull(),
  draft_answer:    text('draft_answer'),
  variants_json:   text('variants_json'),       // JSON array
  category:        text('category'),
  risk_level:      text('risk_level').notNull().default('low'), // 'high'|'medium'|'low'
  gate_evidence:   text('gate_evidence').notNull().default('pending'), // 'pending'|'pass'|'fail'
  gate_conflict:   text('gate_conflict').notNull().default('pending'),
  gate_ownership:  text('gate_ownership').notNull().default('pending'),
  target_asset_id: text('target_asset_id'),
  merge_target_id: text('merge_target_id'),
  status:          text('status').notNull().default('draft'), // 'draft'|'validating'|'gate_pass'|'in_review'|'published'|'rejected'
  review_pkg_id:   text('review_pkg_id'),
  created_by:      text('created_by'),
  created_at:      text('created_at').$defaultFn(() => new Date().toISOString()),
  updated_at:      text('updated_at').$defaultFn(() => new Date().toISOString()),
});

export const kmEvidenceRefs = sqliteTable('km_evidence_refs', {
  id:              text('id').primaryKey(),
  candidate_id:    text('candidate_id'),
  asset_id:        text('asset_id'),
  doc_version_id:  text('doc_version_id'),
  locator:         text('locator'),             // 页码/条款/片段
  status:          text('status').notNull().default('pending'), // 'pending'|'pass'|'fail'
  fail_reason:     text('fail_reason'),
  rule_version:    text('rule_version'),
  reviewed_by:     text('reviewed_by'),
  reviewed_at:     text('reviewed_at'),
  created_at:      text('created_at').$defaultFn(() => new Date().toISOString()),
});

export const kmConflictRecords = sqliteTable('km_conflict_records', {
  id:              text('id').primaryKey(),
  conflict_type:   text('conflict_type').notNull(), // 'wording'|'scope'|'version'|'replacement'
  item_a_id:       text('item_a_id').notNull(),
  item_b_id:       text('item_b_id').notNull(),
  overlap_scope:   text('overlap_scope'),
  blocking_policy: text('blocking_policy').notNull().default('block_submit'), // 'block_submit'|'block_publish'|'warn'
  resolution:      text('resolution'),         // 'keep_a'|'keep_b'|'coexist'|'split'
  arbiter:         text('arbiter'),
  status:          text('status').notNull().default('pending'), // 'pending'|'resolved'|'closed'
  resolved_at:     text('resolved_at'),
  created_at:      text('created_at').$defaultFn(() => new Date().toISOString()),
});

export const kmReviewPackages = sqliteTable('km_review_packages', {
  id:                text('id').primaryKey(),
  title:             text('title').notNull(),
  status:            text('status').notNull().default('draft'), // 'draft'|'submitted'|'reviewing'|'approved'|'rejected'|'published'
  risk_level:        text('risk_level').notNull().default('low'),
  impact_summary:    text('impact_summary'),
  candidate_ids_json: text('candidate_ids_json'), // JSON array
  approval_policy:   text('approval_policy'),
  approval_snapshot: text('approval_snapshot'),   // JSON
  submitted_by:      text('submitted_by'),
  submitted_at:      text('submitted_at'),
  approved_by:       text('approved_by'),
  approved_at:       text('approved_at'),
  created_by:        text('created_by'),
  created_at:        text('created_at').$defaultFn(() => new Date().toISOString()),
  updated_at:        text('updated_at').$defaultFn(() => new Date().toISOString()),
});

export const kmActionDrafts = sqliteTable('km_action_drafts', {
  id:                   text('id').primaryKey(),
  action_type:          text('action_type').notNull(), // 'publish'|'rollback'|'rescope'|'unpublish'|'downgrade'|'renew'
  target_asset_id:      text('target_asset_id'),
  review_pkg_id:        text('review_pkg_id'),
  status:               text('status').notNull().default('draft'), // 'draft'|'submitted'|'reviewed'|'executing'|'done'|'failed'
  change_summary:       text('change_summary'),
  rollback_point_id:    text('rollback_point_id'),
  regression_window_id: text('regression_window_id'),
  executed_by:          text('executed_by'),
  executed_at:          text('executed_at'),
  created_by:           text('created_by'),
  created_at:           text('created_at').$defaultFn(() => new Date().toISOString()),
  updated_at:           text('updated_at').$defaultFn(() => new Date().toISOString()),
});

export const kmAssets = sqliteTable('km_assets', {
  id:               text('id').primaryKey(),
  title:            text('title').notNull(),
  asset_type:       text('asset_type').notNull().default('qa'), // 'qa'|'card'|'skill'
  status:           text('status').notNull().default('online'), // 'online'|'canary'|'downgraded'|'unpublished'
  current_version:  integer('current_version').notNull().default(1),
  scope_json:       text('scope_json'),
  owner:            text('owner'),
  next_review_date: text('next_review_date'),
  created_at:       text('created_at').$defaultFn(() => new Date().toISOString()),
  updated_at:       text('updated_at').$defaultFn(() => new Date().toISOString()),
});

export const kmAssetVersions = sqliteTable('km_asset_versions', {
  id:               text('id').primaryKey(),
  asset_id:         text('asset_id').notNull().references(() => kmAssets.id, { onDelete: 'cascade' }),
  version_no:       integer('version_no').notNull(),
  content_snapshot: text('content_snapshot'),
  scope_snapshot:   text('scope_snapshot'),
  evidence_summary: text('evidence_summary'),
  rollback_point_id: text('rollback_point_id'),
  action_draft_id:  text('action_draft_id'),
  effective_from:   text('effective_from'),
  created_at:       text('created_at').$defaultFn(() => new Date().toISOString()),
});

export const kmGovernanceTasks = sqliteTable('km_governance_tasks', {
  id:            text('id').primaryKey(),
  task_type:     text('task_type').notNull(), // 'review_expiry'|'content_gap'|'conflict_arb'|'failure_fix'|'regression_fail'|'evidence_gap'
  source_type:   text('source_type'),
  source_ref_id: text('source_ref_id'),
  priority:      text('priority').notNull().default('medium'), // 'urgent'|'high'|'medium'|'low'
  assignee:      text('assignee'),
  status:        text('status').notNull().default('open'), // 'open'|'in_progress'|'done'|'closed'
  due_date:      text('due_date'),
  conclusion:    text('conclusion'),
  created_at:    text('created_at').$defaultFn(() => new Date().toISOString()),
  updated_at:    text('updated_at').$defaultFn(() => new Date().toISOString()),
});

export const kmRegressionWindows = sqliteTable('km_regression_windows', {
  id:             text('id').primaryKey(),
  linked_type:    text('linked_type').notNull(), // 'action_draft'|'strategy_change'
  linked_id:      text('linked_id').notNull(),
  metrics_json:   text('metrics_json'),
  threshold_json: text('threshold_json'),
  verdict:        text('verdict').notNull().default('observing'), // 'observing'|'pass'|'fail'
  observe_from:   text('observe_from'),
  observe_until:  text('observe_until'),
  concluded_at:   text('concluded_at'),
  created_at:     text('created_at').$defaultFn(() => new Date().toISOString()),
});

export const kmAuditLogs = sqliteTable('km_audit_logs', {
  id:          integer('id').primaryKey({ autoIncrement: true }),
  action:      text('action').notNull(),
  object_type: text('object_type').notNull(),
  object_id:   text('object_id').notNull(),
  operator:    text('operator').notNull().default('system'),
  risk_level:  text('risk_level'),
  detail_json: text('detail_json'),
  created_at:  text('created_at').$defaultFn(() => new Date().toISOString()),
});

// ── MCP 服务管理 ─────────────────────────────────────────────────────────────

export const mcpServers = sqliteTable('mcp_servers', {
  id:              text('id').primaryKey(),
  name:            text('name').notNull().unique(),
  description:     text('description').notNull().default(''),
  transport:       text('transport').notNull().default('http'),   // 'http' | 'stdio' | 'sse'
  status:          text('status').notNull().default('active'),    // 'active' | 'planned'
  enabled:         integer('enabled', { mode: 'boolean' }).notNull().default(true),
  // HTTP / SSE 配置
  url:             text('url'),
  headers_json:    text('headers_json'),           // JSON object
  // stdio 配置
  command:         text('command'),
  args_json:       text('args_json'),              // JSON array
  cwd:             text('cwd'),
  // 环境变量（公共 / prod 覆盖 / test 覆盖）
  env_json:        text('env_json'),               // JSON object
  env_prod_json:   text('env_prod_json'),           // JSON object
  env_test_json:   text('env_test_json'),           // JSON object
  // 工具元数据
  tools_json:      text('tools_json'),              // JSON: [{name, description, inputSchema?, parameters?, responseExample?}]
  disabled_tools:  text('disabled_tools'),           // JSON array of tool names
  mocked_tools:    text('mocked_tools'),             // JSON array of tool names (these use mock_rules instead of real MCP call)
  mock_rules:      text('mock_rules'),              // JSON: [{tool_name, match, response}]
  // 时间戳
  last_connected_at: text('last_connected_at'),
  created_at:      text('created_at').$defaultFn(() => new Date().toISOString()),
  updated_at:      text('updated_at').$defaultFn(() => new Date().toISOString()),
});
