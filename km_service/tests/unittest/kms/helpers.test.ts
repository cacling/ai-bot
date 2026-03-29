/**
 * helpers.test.ts — Tests for KM utility functions
 */
import { describe, test, expect } from 'bun:test';
import { nanoid, writeAudit } from '../../../src/routes/helpers';
import { db } from '../../../src/db';
import { kmAuditLogs } from '../../../src/db';
import { desc, eq } from 'drizzle-orm';

describe('helpers — nanoid', () => {
  test('generates a string', () => {
    const id = nanoid();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  test('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 100 }, () => nanoid()));
    expect(ids.size).toBe(100);
  });
});

describe('helpers — writeAudit', () => {
  test('writes audit log to database', async () => {
    const before = await db.select().from(kmAuditLogs).orderBy(desc(kmAuditLogs.created_at));
    const countBefore = before.length;

    await writeAudit({
      action: 'helpers_test',
      object_type: 'test',
      object_id: 'test-helpers-1',
      operator: 'unit-test',
      risk_level: 'low',
      detail: { foo: 'bar' },
    });

    const after = await db.select().from(kmAuditLogs).orderBy(desc(kmAuditLogs.created_at));
    expect(after.length).toBe(countBefore + 1);

    const latest = after[0];
    expect(latest.action).toBe('helpers_test');
    expect(latest.object_type).toBe('test');
    expect(latest.object_id).toBe('test-helpers-1');
    expect(latest.operator).toBe('unit-test');
    expect(latest.risk_level).toBe('low');
    expect(latest.detail_json).toBe(JSON.stringify({ foo: 'bar' }));
  });

  test('defaults operator to system', async () => {
    await writeAudit({
      action: 'helpers_test_default',
      object_type: 'test',
      object_id: 'test-helpers-2',
    });

    const rows = await db.select().from(kmAuditLogs).where(eq(kmAuditLogs.object_id, 'test-helpers-2'));
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const match = rows[0];
    expect(match.operator).toBe('system');
  });

  test('handles undefined detail', async () => {
    await writeAudit({
      action: 'helpers_test_no_detail',
      object_type: 'test',
      object_id: 'test-helpers-3',
    });

    const rows = await db.select().from(kmAuditLogs).where(eq(kmAuditLogs.object_id, 'test-helpers-3'));
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const match = rows[0];
    expect(match.detail_json).toBeNull();
  });
});
