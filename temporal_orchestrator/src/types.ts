// ─── Workflow 输入 ───

export interface OutboundTaskInput {
  taskId: string;
  taskType: 'collection' | 'marketing';
  phone: string;
  campaignId?: string;
  sessionId?: string;
  source: 'task_created' | 'ws_connected' | 'schedule_triggered';
}

export interface CallbackInput {
  callbackTaskId: string;
  originalTaskId: string;
  phone: string;
  preferredTime: string;           // ISO 8601
  customerName?: string;
  productName?: string;
}

export interface HumanHandoffInput {
  handoffId: string;
  phone: string;
  sourceSkill: string;
  queueName: string;
  reason: string;
  sessionId?: string;
  taskId?: string;
  workItemId?: string;
}

export interface KmDocumentPipelineInput {
  docVersionId: string;
  stages: Array<'parse' | 'chunk' | 'generate' | 'validate'>;
  trigger: 'manual' | 'schedule' | 'document_change';
}

export interface KmRefreshInput {
  scope: 'daily_refresh' | 'review_due' | 'regression_window';
}

export interface DailyScheduleInput {
  date: string;                    // YYYY-MM-DD
  planName: string;
  groupId?: string;
  autoPublish: boolean;
  notifyAgents: boolean;
}

export interface SchedulePublishInput {
  planId: string;
  versionNo: number;
  requestedBy: string;
  autoPublishThreshold?: number;
}

export interface PolicyExpiryReminderInput {
  assetId: string;
  nextReviewDate: string;
  owner?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface HotIssueMiningInput {
  windowStart: string;
  windowEnd: string;
  channels: string[];
  minFrequency: number;
  sources: Array<'work_orders' | 'copilot_queries' | 'negative_feedback' | 'retrieval_miss'>;
}

export interface QaFlowSuggestionInput {
  clusterId: string;
  issueText: string;
  evidenceRefs: string[];
  sceneCode?: string;
}

export interface AutoTestRegressionInput {
  targetType: 'skill' | 'qa_pair' | 'document';
  targetId: string;
  generatedCaseIds: string[];
  runMode: 'full' | 'smoke' | 'regression_only';
}

// ─── Workflow 输出 ───

export interface OutboundTaskResult {
  taskId: string;
  finalStatus: 'completed' | 'handoff' | 'callback_scheduled' | 'cancelled';
}

export interface CallbackResult {
  callbackTaskId: string;
  finalStatus: 'completed' | 'rescheduled' | 'cancelled';
}

export interface HumanHandoffResult {
  handoffId: string;
  finalStatus: 'resolved' | 'resumed_ai' | 'closed_without_resume';
}

export interface KmDocumentPipelineResult {
  docVersionId: string;
  finalStatus: 'completed' | 'failed' | 'governance_created';
}

export interface DailyScheduleResult {
  date: string;
  planId: string;
  publishStatus: 'published' | 'awaiting_approval' | 'failed';
}

export interface SchedulePublishResult {
  planId: string;
  publishStatus: 'published' | 'rejected' | 'expired';
}

export interface PolicyExpiryReminderResult {
  assetId: string;
  finalStatus: 'acknowledged' | 'escalated';
}

export interface HotIssueMiningResult {
  clusterCount: number;
  reviewPackageIds: string[];
}

export interface QaFlowSuggestionResult {
  clusterId: string;
  finalStatus: 'accepted' | 'rejected';
}

export interface AutoTestRegressionResult {
  targetId: string;
  passRate: number;
  finalStatus: 'releasable' | 'needs_governance';
}
