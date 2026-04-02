/**
 * audit-logger.test.ts — Unit tests for audit logger.
 *
 * Uses real DB (audit-logger has no external deps beyond DB insert).
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { initTestDb } from '../helpers/test-db';

const testDb = initTestDb('audit-logger');

beforeAll(async () => { await testDb.pushSchema(); });
afterAll(() => testDb.cleanup());

const { writeAudit } = await import('../../src/services/audit-logger');
const { db, ixRouteOperationAudit, eq } = await import('../../src/db');

describe('writeAudit', () => {
  test('inserts a minimal audit entry', async () => {
    await writeAudit({
      operation_type: 'rule_create',
      target_type: 'route_rule',
      target_id: 'audit-test-001',
    });

    const row = await db.query.ixRouteOperationAudit.findFirst({
      where: eq(ixRouteOperationAudit.target_id, 'audit-test-001'),
    });
    expect(row).toBeDefined();
    expect(row!.operation_type).toBe('rule_create');
    expect(row!.tenant_id).toBe('default');
    expect(row!.operator_id).toBeNull();
    expect(row!.before_snapshot_json).toBeNull();
    expect(row!.after_snapshot_json).toBeNull();
  });

  test('inserts full audit entry with snapshots', async () => {
    await writeAudit({
      tenant_id: 'tenant-a',
      operator_id: 'admin-001',
      operation_type: 'rule_update',
      target_type: 'route_rule',
      target_id: 'audit-test-002',
      before_snapshot: { enabled: true, grayscale_pct: 50 },
      after_snapshot: { enabled: true, grayscale_pct: 100 },
      metadata: { reason: 'grayscale validation passed' },
    });

    const row = await db.query.ixRouteOperationAudit.findFirst({
      where: eq(ixRouteOperationAudit.target_id, 'audit-test-002'),
    });
    expect(row).toBeDefined();
    expect(row!.tenant_id).toBe('tenant-a');
    expect(row!.operator_id).toBe('admin-001');

    const before = JSON.parse(row!.before_snapshot_json!);
    expect(before.grayscale_pct).toBe(50);

    const after = JSON.parse(row!.after_snapshot_json!);
    expect(after.grayscale_pct).toBe(100);

    const meta = JSON.parse(row!.metadata_json!);
    expect(meta.reason).toBe('grayscale validation passed');
  });

  test('defaults tenant_id to "default"', async () => {
    await writeAudit({
      operation_type: 'manual_assign',
      target_type: 'interaction',
      target_id: 'audit-test-003',
    });

    const row = await db.query.ixRouteOperationAudit.findFirst({
      where: eq(ixRouteOperationAudit.target_id, 'audit-test-003'),
    });
    expect(row!.tenant_id).toBe('default');
  });

  test('serializes complex nested objects', async () => {
    const complex = {
      rules: [{ id: 1, tags: ['a', 'b'] }],
      nested: { deep: { value: true } },
    };
    await writeAudit({
      operation_type: 'binding_change',
      target_type: 'plugin_binding',
      target_id: 'audit-test-004',
      after_snapshot: complex,
    });

    const row = await db.query.ixRouteOperationAudit.findFirst({
      where: eq(ixRouteOperationAudit.target_id, 'audit-test-004'),
    });
    const parsed = JSON.parse(row!.after_snapshot_json!);
    expect(parsed.rules[0].tags).toEqual(['a', 'b']);
    expect(parsed.nested.deep.value).toBe(true);
  });
});
