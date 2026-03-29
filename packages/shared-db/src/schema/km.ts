/**
 * 知识管理表 — km_service 拥有
 *
 * 包括：文档管理、知识候选、审批发布、在线资产、治理任务、反馈、检索评测。
 */
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// ── 文档管理 ─────────────────────────────────────────────────────────────────

export const kmDocuments = sqliteTable('km_documents', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  source: text('source').notNull().default('upload'),
  classification: text('classification').notNull().default('internal'),
  authority_level: text('authority_level').notNull().default('rule'),   // 'policy' | 'rule' | 'faq' | 'experience'
  applicable_scope: text('applicable_scope'),                           // JSON: {channels, regions, products}
  citation_ready: integer('citation_ready').notNull().default(0),       // 0/1
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
  chunk_count: integer('chunk_count').default(0),
  supersedes_version_id: text('supersedes_version_id'),
  status: text('status').notNull().default('draft'),
  created_at: text('created_at').$defaultFn(() => new Date().toISOString()),
});

export const kmDocChunks = sqliteTable('km_doc_chunks', {
  id: text('id').primaryKey(),
  doc_version_id: text('doc_version_id').notNull().references(() => kmDocVersions.id, { onDelete: 'cascade' }),
  chunk_index: integer('chunk_index').notNull().default(0),
  chunk_text: text('chunk_text').notNull(),
  chunk_summary: text('chunk_summary'),
  anchor_type: text('anchor_type'),       // 'clause' | 'paragraph' | 'page' | 'section'
  anchor_value: text('anchor_value'),       // e.g. '第5章第3条' or 'p12'
  citation_label: text('citation_label'),
  created_at: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
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

// ── 知识候选 ─────────────────────────────────────────────────────────────────

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

// ── 审批发布 ─────────────────────────────────────────────────────────────────

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

// ── 在线资产 ─────────────────────────────────────────────────────────────────

export const kmAssets = sqliteTable('km_assets', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  asset_type: text('asset_type').notNull().default('qa'),
  status: text('status').notNull().default('online'),
  current_version: integer('current_version').notNull().default(1),
  scope_json: text('scope_json'),
  service_modes: text('service_modes'),            // JSON: ["auto_recommend", "kb_answer", "action_suggest"]
  rollout_strategy: text('rollout_strategy').notNull().default('online'), // 'online' | 'canary' | 'downgraded'
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

// ── 治理任务 ─────────────────────────────────────────────────────────────────

export const kmGovernanceTasks = sqliteTable('km_governance_tasks', {
  id: text('id').primaryKey(),
  task_type: text('task_type').notNull(),
  source_type: text('source_type'),
  source_ref_id: text('source_ref_id'),
  source_kind: text('source_kind').notNull().default('manual'),   // 'manual' | 'feedback' | 'eval' | 'document_change'
  issue_category: text('issue_category'),                          // 'retrieval_miss' | 'content_gap' | 'source_dispute' | 'low_confidence'
  severity: text('severity').notNull().default('medium'),          // 'low' | 'medium' | 'high' | 'critical'
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

// ── 审计与反馈 ───────────────────────────────────────────────────────────────

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
  event_type: text('event_type').notNull(), // 'shown' | 'use' | 'copy' | 'edit' | 'dismiss' | 'adopt_direct' | 'adopt_with_edit' | 'helpful' | 'not_helpful'
  feedback_scope: text('feedback_scope').notNull().default('reply_hint'), // 'reply_hint' | 'kb_answer' | 'action_suggest'
  question_text: text('question_text'),
  answer_text: text('answer_text'),
  reason_code: text('reason_code'),         // 'inaccurate' | 'too_vague' | 'no_answer' | 'unreliable_source'
  detail_json: text('detail_json'),
  created_at: text('created_at').$defaultFn(() => new Date().toISOString()),
});

export const kmRetrievalEvalCases = sqliteTable('km_retrieval_eval_cases', {
  id: text('id').primaryKey(),
  input_text: text('input_text').notNull(),
  input_kind: text('input_kind').notNull().default('user_message'),  // 'user_message' | 'agent_question'
  expected_asset_ids: text('expected_asset_ids'),   // JSON array
  actual_asset_ids: text('actual_asset_ids'),       // JSON array
  actual_answer: text('actual_answer'),
  citation_ok: integer('citation_ok'),              // 0/1/null
  answer_ok: integer('answer_ok'),                  // 0/1/null
  reviewer: text('reviewer'),
  created_at: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});
