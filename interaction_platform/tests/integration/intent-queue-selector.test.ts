/**
 * intent-queue-selector.test.ts — Tests for intent-based queue selector plugin.
 */
import { describe, test, expect } from 'bun:test';
import { type InteractionSnapshot } from '../../src/services/plugin-runtime';
import { handler } from '../../src/plugins/intent-queue-selector/handler';

// ── Fixtures ──────────────────────────────────────────────────────────────

const makeSnapshot = (overrides: Partial<InteractionSnapshot> = {}): InteractionSnapshot => ({
  interaction_id: 'ix-intent-test',
  tenant_id: 'default',
  conversation_id: 'conv-intent-test',
  work_model: 'live_chat',
  queue_code: 'default_chat',
  priority: 50,
  customer_party_id: null,
  handoff_summary: null,
  ...overrides,
});

const DEFAULT_CONFIG = {
  entry_queue_codes: ['default_chat'],
  intent_to_queue_map: {
    'bill-inquiry': 'bill_chat',
    'plan-inquiry': 'plan_chat',
    'fault-diagnosis': 'fault_chat',
    'service-cancel': 'cancel_chat',
  },
  keyword_rules: [
    { keywords: ['账单', '费用', '扣费'], queue_code: 'bill_chat' },
    { keywords: ['套餐', '流量', '升级'], queue_code: 'plan_chat' },
    { keywords: ['故障', '断网', '无信号'], queue_code: 'fault_chat' },
    { keywords: ['退订', '取消', '注销'], queue_code: 'cancel_chat' },
  ],
  fallback_queue: 'default_chat',
  confidence_threshold: 0.6,
  enable_handoff_parse: true,
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe('intent-queue-selector', () => {
  describe('entry queue gate', () => {
    test('passthrough when queue not in entry_queue_codes', async () => {
      const result = await handler(makeSnapshot({ queue_code: 'vip_chat' }), DEFAULT_CONFIG);
      expect(result.queue_code).toBe('vip_chat');
      expect(result.reason).toContain('passthrough');
    });

    test('activates when queue is in entry_queue_codes', async () => {
      const result = await handler(
        makeSnapshot({ intent_code: 'bill-inquiry' }),
        DEFAULT_CONFIG,
      );
      expect(result.queue_code).toBe('bill_chat');
    });
  });

  describe('work_model allowlist', () => {
    test('passthrough when work_model not in allowlist', async () => {
      const config = { ...DEFAULT_CONFIG, work_model_allowlist: ['live_voice'] };
      const result = await handler(makeSnapshot({ work_model: 'live_chat' }), config);
      expect(result.queue_code).toBe('default_chat');
      expect(result.reason).toContain('passthrough');
    });

    test('no allowlist means all work_models pass', async () => {
      const result = await handler(
        makeSnapshot({ intent_code: 'bill-inquiry' }),
        DEFAULT_CONFIG,
      );
      expect(result.queue_code).toBe('bill_chat');
    });
  });

  describe('intent_code mapping', () => {
    test('maps known intent_code to queue', async () => {
      const result = await handler(
        makeSnapshot({ intent_code: 'bill-inquiry' }),
        DEFAULT_CONFIG,
      );
      expect(result.queue_code).toBe('bill_chat');
      expect(result.reason).toContain('intent=bill-inquiry');
    });

    test('maps fault-diagnosis to fault_chat', async () => {
      const result = await handler(
        makeSnapshot({ intent_code: 'fault-diagnosis' }),
        DEFAULT_CONFIG,
      );
      expect(result.queue_code).toBe('fault_chat');
    });

    test('unknown intent_code falls through to keyword matching', async () => {
      const result = await handler(
        makeSnapshot({ intent_code: 'unknown-intent', handoff_summary: '用户想查询账单' }),
        DEFAULT_CONFIG,
      );
      expect(result.queue_code).toBe('bill_chat');
      expect(result.reason).toContain('keyword');
    });
  });

  describe('keyword matching', () => {
    test('matches Chinese keywords in handoff_summary', async () => {
      const result = await handler(
        makeSnapshot({ handoff_summary: '用户反映断网已经三天了' }),
        DEFAULT_CONFIG,
      );
      expect(result.queue_code).toBe('fault_chat');
      expect(result.reason).toContain("keyword '断网'");
    });

    test('matches first matching rule', async () => {
      // handoff contains both 费用 (bill) and 退订 (cancel) — first rule wins
      const result = await handler(
        makeSnapshot({ handoff_summary: '用户想查询费用后退订' }),
        DEFAULT_CONFIG,
      );
      expect(result.queue_code).toBe('bill_chat'); // 费用 matches first
    });

    test('disabled when enable_handoff_parse is false', async () => {
      const config = { ...DEFAULT_CONFIG, enable_handoff_parse: false };
      const result = await handler(
        makeSnapshot({ handoff_summary: '用户查询账单' }),
        config,
      );
      expect(result.queue_code).toBe('default_chat'); // fallback
    });
  });

  describe('fallback', () => {
    test('returns fallback_queue when no match', async () => {
      const result = await handler(
        makeSnapshot({ handoff_summary: '一般性咨询' }),
        DEFAULT_CONFIG,
      );
      expect(result.queue_code).toBe('default_chat');
      expect(result.reason).toContain('fallback');
    });

    test('returns current queue when no fallback configured', async () => {
      const config = { ...DEFAULT_CONFIG, fallback_queue: undefined };
      const result = await handler(
        makeSnapshot({ queue_code: 'default_chat', handoff_summary: '一般性咨询' }),
        config,
      );
      expect(result.queue_code).toBe('default_chat');
    });

    test('returns fallback when handoff_summary is null', async () => {
      const result = await handler(makeSnapshot(), DEFAULT_CONFIG);
      expect(result.queue_code).toBe('default_chat');
    });
  });
});
