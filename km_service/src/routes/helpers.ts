/**
 * helpers.ts — 知识管理模块通用工具
 */
import { nanoid } from '../nanoid';
import { db } from '../db';
import { kmAuditLogs } from '../db';

export { nanoid };

/** 写审计日志 */
export async function writeAudit(params: {
  action: string;
  object_type: string;
  object_id: string;
  operator?: string;
  risk_level?: string;
  detail?: Record<string, unknown>;
}) {
  await db.insert(kmAuditLogs).values({
    action: params.action,
    object_type: params.object_type,
    object_id: params.object_id,
    operator: params.operator ?? 'system',
    risk_level: params.risk_level,
    detail_json: params.detail ? JSON.stringify(params.detail) : undefined,
  });
}
