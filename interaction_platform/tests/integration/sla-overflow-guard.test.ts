/**
 * sla-overflow-guard.test.ts — Tests for SLA overflow guard plugin.
 */
import { describe, test, expect } from 'bun:test';
import { type InteractionSnapshot } from '../../src/services/plugin-runtime';
import { handler } from '../../src/plugins/sla-overflow-guard/handler';

// ── Fixtures ──────────────────────────────────────────────────────────────

const makeSnapshot = (overrides: Partial<InteractionSnapshot> = {}): InteractionSnapshot => ({
  interaction_id: 'ix-sla-test',
  tenant_id: 'default',
  conversation_id: 'conv-sla-test',
  work_model: 'live_chat',
  queue_code: 'fault_chat',
  priority: 50,
  customer_party_id: null,
  handoff_summary: null,
  wait_seconds: 0,
  ...overrides,
});

const DEFAULT_CONFIG = {
  max_wait_seconds: 90,
  overflow_queue: 'default_chat',
  allow_overflow: true,
  allow_callback: false,
  business_hours_only: false,
  min_candidate_retry_interval: 15,
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe('sla-overflow-guard', () => {
  describe('within SLA threshold', () => {
    test('returns wait when under threshold', async () => {
      const result = await handler(makeSnapshot({ wait_seconds: 30 }), DEFAULT_CONFIG);
      expect(result.action).toBe('wait');
      expect(result.reason).toContain('wait_seconds=30');
      expect(result.reason).toContain('continue waiting');
    });

    test('returns wait at exactly threshold - 1', async () => {
      const result = await handler(makeSnapshot({ wait_seconds: 89 }), DEFAULT_CONFIG);
      expect(result.action).toBe('wait');
    });
  });

  describe('SLA breached with overflow', () => {
    test('overflows when wait exceeds threshold', async () => {
      const result = await handler(makeSnapshot({ wait_seconds: 95 }), DEFAULT_CONFIG);
      expect(result.action).toBe('overflow');
      expect(result.overflow_queue).toBe('default_chat');
      expect(result.reason).toContain('overflow to default_chat');
    });

    test('overflows at exactly threshold', async () => {
      const result = await handler(makeSnapshot({ wait_seconds: 90 }), DEFAULT_CONFIG);
      expect(result.action).toBe('overflow');
      expect(result.overflow_queue).toBe('default_chat');
    });

    test('overflows with large wait time', async () => {
      const result = await handler(makeSnapshot({ wait_seconds: 999 }), DEFAULT_CONFIG);
      expect(result.action).toBe('overflow');
    });
  });

  describe('overflow not configured', () => {
    test('waits when allow_overflow is false', async () => {
      const config = { ...DEFAULT_CONFIG, allow_overflow: false };
      const result = await handler(makeSnapshot({ wait_seconds: 200 }), config);
      expect(result.action).toBe('wait');
      expect(result.reason).toContain('overflow not configured');
    });

    test('waits when overflow_queue is undefined', async () => {
      const config = { ...DEFAULT_CONFIG, overflow_queue: undefined };
      const result = await handler(makeSnapshot({ wait_seconds: 200 }), config);
      expect(result.action).toBe('wait');
      expect(result.reason).toContain('overflow not configured');
    });
  });

  describe('min_candidate_retry_interval', () => {
    test('waits when recently checked (under retry interval)', async () => {
      const result = await handler(makeSnapshot({ wait_seconds: 10 }), DEFAULT_CONFIG);
      expect(result.action).toBe('wait');
    });
  });

  describe('wait_seconds defaults', () => {
    test('treats undefined wait_seconds as 0', async () => {
      const result = await handler(makeSnapshot({ wait_seconds: undefined }), DEFAULT_CONFIG);
      expect(result.action).toBe('wait');
    });
  });

  describe('config overrides', () => {
    test('uses custom max_wait_seconds', async () => {
      const config = { ...DEFAULT_CONFIG, max_wait_seconds: 30 };
      const result = await handler(makeSnapshot({ wait_seconds: 35 }), config);
      expect(result.action).toBe('overflow');
    });

    test('uses custom overflow_queue', async () => {
      const config = { ...DEFAULT_CONFIG, overflow_queue: 'vip_chat' };
      const result = await handler(makeSnapshot({ wait_seconds: 100 }), config);
      expect(result.action).toBe('overflow');
      expect(result.overflow_queue).toBe('vip_chat');
    });
  });
});
