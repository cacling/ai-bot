/**
 * types.ts — 前端数据类型（对齐后端 snake_case → camelCase）
 *
 * 后端返回 snake_case 原始行，api.ts 负责转换。
 */

// ── Work Item ──────────────────────────────────────────────────────────────

export type WorkItemType = 'ticket' | 'work_order' | 'appointment' | 'task';
export type WorkItemStatus = 'new' | 'open' | 'scheduled' | 'in_progress' | 'waiting_customer' | 'resolved' | 'closed' | 'cancelled';

export interface WorkItem {
  id: string;
  title: string;
  summary: string;
  type: WorkItemType;
  categoryCode?: string;
  status: WorkItemStatus;
  priority: string;
  severity?: string;
  customerPhone?: string;
  customerName?: string;
  ownerId?: string;
  queueCode?: string;
  channel?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkItemDetail extends WorkItem {
  description?: string;
  rootId: string;
  parentId?: string;
  dueAt?: string;
  nextActionAt?: string;
  slaDeadlineAt?: string;
  closedAt?: string;
  /** Type-specific detail (work_orders / tickets / appointments / tasks row) */
  detail?: Record<string, unknown>;
  /** Child appointments (with detail joined) */
  appointments?: ChildAppointment[];
  /** Child work orders */
  childWorkOrders?: ChildWorkItem[];
  /** Child tasks */
  childTasks?: ChildTask[];
  /** Event timeline */
  events?: WorkItemEvent[];
  /** Relations */
  relations?: WorkItemRelation[];
}

export interface ChildAppointment {
  id: string;
  title: string;
  status: string;
  scheduledStartAt?: string;
  scheduledEndAt?: string;
  actualStartAt?: string;
  actualEndAt?: string;
  bookingStatus: string;
  appointmentType: string;
  locationText?: string;
  rescheduleCount: number;
}

export interface ChildWorkItem {
  id: string;
  title: string;
  status: string;
  categoryCode?: string;
  priority: string;
}

export interface ChildTask {
  id: string;
  title: string;
  status: string;
  taskType?: string;
  completedAt?: string;
  completedBy?: string;
}

export interface WorkItemEvent {
  id: number;
  eventType: string;
  actorType: string;
  actorId?: string;
  visibility: string;
  note?: string;
  payloadJson?: string;
  createdAt: string;
}

export interface WorkItemRelation {
  id: number;
  relatedType: string;
  relatedId: string;
  relationKind: string;
}

// ── Intake ─────────────────────────────────────────────────────────────────

export type IntakeStatus = 'new' | 'analyzed' | 'matched' | 'draft_created' | 'materialized' | 'discarded' | 'failed';
export type SourceKind = 'agent_after_service' | 'self_service_form' | 'handoff_overflow' | 'external_monitoring' | 'emotion_escalation';

export interface Intake {
  id: string;
  sourceKind: SourceKind;
  sourceChannel?: string;
  sourceRef?: string;
  customerPhone?: string;
  customerName?: string;
  subject?: string;
  status: IntakeStatus;
  resolutionAction?: string;
  threadId?: string;
  materializedItemId?: string;
  riskScore?: number;
  sentimentScore?: number;
  confidenceScore?: number;
  decisionMode?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Draft ──────────────────────────────────────────────────────────────────

export type DraftStatus = 'draft' | 'pending_review' | 'confirmed' | 'discarded' | 'published';

export interface Draft {
  id: string;
  intakeId: string;
  targetType: string;
  categoryCode?: string;
  title: string;
  summary?: string;
  status: DraftStatus;
  priority?: string;
  queueCode?: string;
  reviewRequired?: number;
  reviewedBy?: string;
  reviewedAt?: string;
  publishedItemId?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Issue Thread ───────────────────────────────────────────────────────────

export type IssueThreadStatus = 'open' | 'resolved' | 'closed';

export interface IssueThread {
  id: string;
  threadKey: string;
  customerPhone?: string;
  canonicalCategoryCode?: string;
  canonicalSubject?: string;
  status: IssueThreadStatus;
  masterTicketId?: string;
  latestItemId?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  reopenUntil?: string;
  createdAt: string;
  updatedAt: string;
  /** Related intakes (populated by GET /:id) */
  intakes?: Intake[];
}

// ── Merge Review ───────────────────────────────────────────────────────────

export type MergeReviewStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'expired';

export interface MergeReview {
  id: string;
  intakeId: string;
  candidateThreadId: string;
  recommendedAction: string;
  scoreTotal: number;
  decisionStatus: MergeReviewStatus;
  decidedBy?: string;
  decidedAt?: string;
  executedAt?: string;
  createdAt: string;
}
