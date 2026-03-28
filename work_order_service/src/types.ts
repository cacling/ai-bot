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

export type WorkItemType = 'case' | 'work_order' | 'appointment' | 'task';

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

export type RelatedType = 'session' | 'message' | 'skill_instance' | 'execution_record' | 'outbound_task';
export type RelationKind = 'source' | 'context' | 'child' | 'blocking' | 'derived_from';

// ── 队列 ────────────────────────────────────────────────────────────────────

export type QueueType = 'frontline' | 'specialist' | 'store' | 'field' | 'system';
