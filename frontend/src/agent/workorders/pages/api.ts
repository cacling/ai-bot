/**
 * api.ts — Work Order frontend API layer.
 *
 * Backend returns snake_case fields; we transform to camelCase here
 * so page components can use idiomatic JS property names.
 */
import {
  type WorkItem,
  type WorkItemDetail,
  type ChildAppointment,
  type ChildWorkItem,
  type ChildTask,
  type WorkItemEvent,
  type WorkItemRelation,
  type Intake,
  type IssueThread,
  type MergeReview,
} from './types';

const BASE = '/api';

// ── Generic snake→camel helpers ───────────────────────────────────────────

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, ch) => ch.toUpperCase());
}

/** Shallow transform: convert all snake_case keys to camelCase */
function mapKeys<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[snakeToCamel(k)] = v;
  }
  return out as T;
}

// ── Work Items ────────────────────────────────────────────────────────────

function toWorkItem(row: Record<string, unknown>): WorkItem {
  return mapKeys<WorkItem>(row);
}

function toChildAppointment(row: Record<string, unknown>): ChildAppointment {
  const item = row as Record<string, unknown>;
  const detail = (row.detail ?? {}) as Record<string, unknown>;
  return {
    id: item.id as string,
    title: item.title as string,
    status: item.status as string,
    scheduledStartAt: (detail.scheduled_start_at ?? detail.scheduledStartAt) as string | undefined,
    scheduledEndAt: (detail.scheduled_end_at ?? detail.scheduledEndAt) as string | undefined,
    actualStartAt: (detail.actual_start_at ?? detail.actualStartAt) as string | undefined,
    actualEndAt: (detail.actual_end_at ?? detail.actualEndAt) as string | undefined,
    bookingStatus: (detail.booking_status ?? detail.bookingStatus ?? 'proposed') as string,
    appointmentType: (detail.appointment_type ?? detail.appointmentType ?? '') as string,
    locationText: (detail.location_text ?? detail.locationText) as string | undefined,
    rescheduleCount: (detail.reschedule_count ?? detail.rescheduleCount ?? 0) as number,
  };
}

function toChildWorkItem(row: Record<string, unknown>): ChildWorkItem {
  return {
    id: row.id as string,
    title: row.title as string,
    status: row.status as string,
    categoryCode: (row.category_code ?? row.categoryCode) as string | undefined,
    priority: (row.priority ?? 'medium') as string,
  };
}

function toChildTask(row: Record<string, unknown>): ChildTask {
  const detail = (row.detail ?? {}) as Record<string, unknown>;
  return {
    id: row.id as string,
    title: row.title as string,
    status: row.status as string,
    taskType: (detail.task_type ?? detail.taskType) as string | undefined,
    completedAt: (detail.completed_at ?? detail.completedAt ?? row.closed_at ?? row.closedAt) as string | undefined,
    completedBy: (detail.completed_by ?? detail.completedBy) as string | undefined,
  };
}

function toWorkItemEvent(row: Record<string, unknown>): WorkItemEvent {
  return {
    id: row.id as number,
    eventType: (row.event_type ?? row.eventType) as string,
    actorType: (row.actor_type ?? row.actorType) as string,
    actorId: (row.actor_id ?? row.actorId) as string | undefined,
    visibility: (row.visibility ?? 'internal') as string,
    note: (row.note) as string | undefined,
    payloadJson: (row.payload_json ?? row.payloadJson) as string | undefined,
    createdAt: (row.created_at ?? row.createdAt) as string,
  };
}

function toWorkItemRelation(row: Record<string, unknown>): WorkItemRelation {
  return {
    id: row.id as number,
    relatedType: (row.related_type ?? row.relatedType) as string,
    relatedId: (row.related_id ?? row.relatedId) as string,
    relationKind: (row.relation_kind ?? row.relationKind) as string,
  };
}

/**
 * Flatten backend getWorkItemDetail response into WorkItemDetail.
 *
 * Backend shape:
 *   { item, detail, children, appointments, child_work_orders, child_tasks, events, relations }
 */
function toWorkItemDetail(raw: Record<string, unknown>): WorkItemDetail {
  const item = (raw.item ?? raw) as Record<string, unknown>;
  const detail = (raw.detail ?? {}) as Record<string, unknown>;

  const base = mapKeys<WorkItemDetail>(item);
  // Merge type-specific detail as a sub-object
  base.detail = detail as Record<string, unknown>;

  // Children
  const appts = (raw.appointments ?? []) as Record<string, unknown>[];
  base.appointments = appts.map(toChildAppointment);

  const childWOs = (raw.child_work_orders ?? []) as Record<string, unknown>[];
  base.childWorkOrders = childWOs.map(toChildWorkItem);

  const childTasks = (raw.child_tasks ?? []) as Record<string, unknown>[];
  base.childTasks = childTasks.map(toChildTask);

  const events = (raw.events ?? []) as Record<string, unknown>[];
  base.events = events.map(toWorkItemEvent);

  const relations = (raw.relations ?? []) as Record<string, unknown>[];
  base.relations = relations.map(toWorkItemRelation);

  return base;
}

export async function listWorkItems(params?: { keyword?: string; status?: string }): Promise<WorkItem[]> {
  const qs = new URLSearchParams();
  if (params?.keyword) qs.set('keyword', params.keyword);
  if (params?.status) qs.set('status', params.status);
  const query = qs.toString();
  const res = await fetch(`${BASE}/work-items${query ? `?${query}` : ''}`);
  if (!res.ok) throw new Error(`Failed to list work items: ${res.status}`);
  const data = await res.json();
  const items = (data.items ?? data) as Record<string, unknown>[];
  return items.map(toWorkItem);
}

export async function getWorkItem(id: string): Promise<WorkItemDetail> {
  const res = await fetch(`${BASE}/work-items/${id}`);
  if (!res.ok) throw new Error(`Failed to get work item: ${res.status}`);
  const raw = await res.json();
  return toWorkItemDetail(raw);
}

// ── Intakes ───────────────────────────────────────────────────────────────

function toIntake(row: Record<string, unknown>): Intake {
  return mapKeys<Intake>(row);
}

export async function listIntakes(params?: { status?: string }): Promise<Intake[]> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  const query = qs.toString();
  const res = await fetch(`${BASE}/intakes${query ? `?${query}` : ''}`);
  if (!res.ok) throw new Error(`Failed to list intakes: ${res.status}`);
  const data = await res.json();
  const items = (data.items ?? data) as Record<string, unknown>[];
  return items.map(toIntake);
}

export async function getIntake(id: string): Promise<Intake> {
  const res = await fetch(`${BASE}/intakes/${id}`);
  if (!res.ok) throw new Error(`Failed to get intake: ${res.status}`);
  const raw = await res.json();
  return toIntake(raw);
}

// ── Issue Threads ─────────────────────────────────────────────────────────

function toIssueThread(row: Record<string, unknown>): IssueThread {
  const base = mapKeys<IssueThread>(row);
  // If intakes are embedded (from GET /:id), transform them too
  if (Array.isArray(row.intakes)) {
    base.intakes = (row.intakes as Record<string, unknown>[]).map(toIntake);
  }
  return base;
}

export async function listIssueThreads(): Promise<IssueThread[]> {
  const res = await fetch(`${BASE}/issue-threads`);
  if (!res.ok) throw new Error(`Failed to list issue threads: ${res.status}`);
  const data = await res.json();
  const items = (data.items ?? data) as Record<string, unknown>[];
  return items.map(toIssueThread);
}

export async function getIssueThread(id: string): Promise<IssueThread> {
  const res = await fetch(`${BASE}/issue-threads/${id}`);
  if (!res.ok) throw new Error(`Failed to get issue thread: ${res.status}`);
  const raw = await res.json();
  return toIssueThread(raw);
}

// ── Merge Reviews ─────────────────────────────────────────────────────────

export async function listMergeReviews(): Promise<MergeReview[]> {
  const res = await fetch(`${BASE}/merge-reviews`);
  if (!res.ok) throw new Error(`Failed to list merge reviews: ${res.status}`);
  const data = await res.json();
  const items = (data.items ?? data) as Record<string, unknown>[];
  return items.map(r => mapKeys<MergeReview>(r));
}
