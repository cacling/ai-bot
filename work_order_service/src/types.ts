/**
 * 工单系统类型定义
 */

// ── Work Item 主状态 ────────────────────────────────────────────────────────

export type WorkItemStatus =
  | 'new'
  | 'open'
  | 'scheduled'
  | 'in_progress'
  | 'waiting_customer'
  | 'waiting_internal'
  | 'waiting_external'
  | 'waiting_verification'
  | 'resolved'
  | 'closed'
  | 'cancelled';

export type WorkItemType = 'ticket' | 'work_order' | 'appointment' | 'task';

export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export type Severity = 'low' | 'medium' | 'high' | 'critical';

export type Channel = 'online' | 'voice' | 'outbound' | 'internal';

// ── Work Order ──────────────────────────────────────────────────────────────

export type WorkType = 'execution' | 'followup' | 'review' | 'field';
export type ExecutionMode = 'manual' | 'assisted' | 'system' | 'external';
export type VerificationMode = 'none' | 'customer_confirm' | 'system_check' | 'agent_review';

// ── Appointment ─────────────────────────────────────────────────────────────

export type AppointmentType = 'callback' | 'store_visit' | 'onsite' | 'video_verify';

export type BookingStatus =
  | 'proposed'
  | 'confirmed'
  | 'checked_in'
  | 'in_service'
  | 'completed'
  | 'rescheduled'
  | 'no_show'
  | 'cancelled';

// ── Work Order 状态流转动作 ──────────────────────────────────────────────────

export type WorkOrderAction =
  | 'accept'
  | 'start'
  | 'create_appointment'
  | 'mark_waiting_customer'
  | 'mark_waiting_internal'
  | 'mark_waiting_external'
  | 'mark_waiting_verification'
  | 'verify_pass'
  | 'verify_fail'
  | 'resolve'
  | 'close'
  | 'cancel'
  | 'reopen';

// ── Appointment 动作 ────────────────────────────────────────────────────────

export type AppointmentAction =
  | 'confirm'
  | 'reschedule'
  | 'check_in'
  | 'start'
  | 'complete'
  | 'no_show'
  | 'cancel';

// ── Ticket ──────────────────────────────────────────────────────────────────

export type TicketCategory = 'inquiry' | 'complaint' | 'incident' | 'request';

export type TicketAction =
  | 'triage'
  | 'mark_waiting_customer'
  | 'mark_waiting_internal'
  | 'customer_replied'
  | 'internal_update'
  | 'resolve'
  | 'close'
  | 'reopen'
  | 'cancel';

// ── Task ────────────────────────────────────────────────────────────────────

export type TaskAction = 'start' | 'complete' | 'block' | 'unblock' | 'cancel';

// ── Workflow ────────────────────────────────────────────────────────────────

export type WorkflowRunStatus =
  | 'running'
  | 'waiting_signal'
  | 'waiting_child'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type WorkflowNodeType =
  | 'start'
  | 'create_item'
  | 'create_appointment'
  | 'transition_item'
  | 'wait_signal'
  | 'wait_children'
  | 'if'
  | 'end';

// ── 事件 ────────────────────────────────────────────────────────────────────

export type ActorType = 'user' | 'agent' | 'system' | 'workflow' | 'customer';
export type Visibility = 'internal' | 'customer';

export type EventType =
  | 'created'
  | 'assigned'
  | 'queued'
  | 'status_changed'
  | 'child_created'
  | 'appointment_created'
  | 'appointment_rescheduled'
  | 'customer_confirmed'
  | 'customer_no_show'
  | 'execution_succeeded'
  | 'execution_failed'
  | 'reopened'
  | 'closed'
  | 'note_added';

// ── 关系 ────────────────────────────────────────────────────────────────────

export type RelatedType = 'session' | 'message' | 'skill_instance' | 'execution_record' | 'outbound_task'
  | 'source_intake' | 'source_draft' | 'source_issue_thread' | 'work_item';
export type RelationKind = 'source' | 'context' | 'child' | 'blocking' | 'derived_from'
  | 'merged_into' | 'same_issue_as' | 'duplicate_of';

// ── 队列 ────────────────────────────────────────────────────────────────────

export type QueueType = 'frontline' | 'specialist' | 'store' | 'field' | 'system';

// ── 分类 ────────────────────────────────────────────────────────────────────

export type CategoryStatus = 'active' | 'inactive' | 'retired';

export interface AllowedChildRule {
  relation_type: string;         // 'derived_work_order' | 'sub_ticket' | 'sub_work_order' | 'task' | 'appointment'
  child_type: WorkItemType;
  child_categories: string[];
}

// ── Intake 流水线 ──────────────────────────────────────────────────────────

export type SourceKind = 'agent_after_service' | 'self_service_form' | 'handoff_overflow' | 'external_monitoring' | 'emotion_escalation';
export type IntakeStatus = 'new' | 'analyzed' | 'matched' | 'draft_created' | 'materialized' | 'discarded' | 'failed';
export type DraftStatus = 'draft' | 'pending_review' | 'confirmed' | 'discarded' | 'published';
export type IssueThreadStatus = 'open' | 'resolved' | 'closed';
export type MergeReviewStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'expired';
export type ResolutionAction = 'create_new_thread' | 'append_followup' | 'merge_master' | 'reopen_master' | 'ignored_duplicate';
export type DecisionMode = 'manual_confirm' | 'auto_create' | 'auto_create_if_confident' | 'auto_create_and_schedule';
