/**
 * audit-logger.ts — Routing operation audit trail.
 *
 * All state-mutating operations (rule CRUD, manual routing interventions,
 * binding changes, replay triggers) call writeAudit() to persist a
 * before/after snapshot into ix_route_operation_audit.
 */
import { db, ixRouteOperationAudit } from '../db';

export interface AuditEntry {
  tenant_id?: string;
  operator_id?: string;
  operation_type: string;
  target_type: string;
  target_id: string;
  before_snapshot?: unknown;
  after_snapshot?: unknown;
  metadata?: unknown;
}

/**
 * Write an audit log entry. Fire-and-forget — callers should not await
 * unless they need the audit_id for correlation.
 */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  await db.insert(ixRouteOperationAudit).values({
    tenant_id: entry.tenant_id ?? 'default',
    operator_id: entry.operator_id ?? null,
    operation_type: entry.operation_type,
    target_type: entry.target_type,
    target_id: entry.target_id,
    before_snapshot_json: entry.before_snapshot ? JSON.stringify(entry.before_snapshot) : null,
    after_snapshot_json: entry.after_snapshot ? JSON.stringify(entry.after_snapshot) : null,
    metadata_json: entry.metadata ? JSON.stringify(entry.metadata) : null,
  });
}
