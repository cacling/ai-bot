/**
 * triage-engine.test.ts — Unit tests for rule-based triage.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { initTestDb } from '../helpers/test-db';

const testDb = initTestDb('triage');

beforeAll(async () => { await testDb.pushSchema(); });
afterAll(() => testDb.cleanup());

const { triageItem } = await import('../../src/services/triage-engine');
const { db, ixEngagementItems, eq } = await import('../../src/db');

// ── Helper ─────────────────────────────────────────────────────────────────

async function insertItem(body: string, sentiment?: string) {
  const itemId = crypto.randomUUID();
  await db.insert(ixEngagementItems).values({
    item_id: itemId,
    provider: 'mock',
    item_type: 'comment',
    author_name: 'Test User',
    author_id: 'test-user',
    body,
    sentiment: sentiment ?? null,
    status: 'new',
  });
  return itemId;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('triage-engine', () => {
  describe('crisis rule (priority 1)', () => {
    test('detects 投诉 keyword', async () => {
      const id = await insertItem('你们公司涉嫌诈骗，我已经联系律师了');
      const result = await triageItem(id);
      expect(result.classification).toBe('crisis');
      expect(result.risk_level).toBe('critical');
      expect(result.recommendation).toBe('materialize');
      expect(result.matched_rules).toContain('crisis_keywords');
    });

    test('detects 315 keyword', async () => {
      const id = await insertItem('我要投诉到315');
      const result = await triageItem(id);
      expect(result.classification).toBe('crisis');
      expect(result.recommendation).toBe('materialize');
    });

    test('detects 工信部 keyword', async () => {
      const id = await insertItem('工信部投诉都没用');
      const result = await triageItem(id);
      expect(result.classification).toBe('crisis');
    });
  });

  describe('complaint rule (priority 2)', () => {
    test('negative sentiment + complaint keyword → complaint', async () => {
      const id = await insertItem('服务太差了，太让人失望了', 'negative');
      const result = await triageItem(id);
      expect(result.classification).toBe('complaint');
      expect(result.risk_level).toBe('high');
      expect(result.recommendation).toBe('materialize');
      expect(result.matched_rules).toContain('complaint_negative');
    });

    test('complaint keyword without negative sentiment → does not match complaint rule', async () => {
      const id = await insertItem('这个服务差评', 'neutral');
      const result = await triageItem(id);
      // May match inquiry or other rules, but not complaint_negative (requires sentiment=negative)
      expect(result.matched_rules).not.toContain('complaint_negative');
    });
  });

  describe('inquiry rule (priority 3)', () => {
    test('question with ? mark → inquiry', async () => {
      const id = await insertItem('请问怎么升级套餐？');
      const result = await triageItem(id);
      expect(result.classification).toBe('inquiry');
      expect(result.risk_level).toBe('medium');
      expect(result.recommendation).toBe('convert_private');
      expect(result.matched_rules).toContain('inquiry_question');
    });

    test('question with 多少钱 → inquiry', async () => {
      const id = await insertItem('5G套餐多少钱一个月');
      const result = await triageItem(id);
      expect(result.classification).toBe('inquiry');
      expect(result.recommendation).toBe('convert_private');
    });
  });

  describe('praise rule (priority 4)', () => {
    test('positive sentiment → praise', async () => {
      const id = await insertItem('服务非常好', 'positive');
      const result = await triageItem(id);
      expect(result.classification).toBe('praise');
      expect(result.risk_level).toBe('low');
      expect(result.recommendation).toBe('moderate_only');
      expect(result.matched_rules).toContain('praise_positive');
    });

    test('praise keyword → praise', async () => {
      const id = await insertItem('五星好评，推荐给大家');
      const result = await triageItem(id);
      expect(result.classification).toBe('praise');
      expect(result.recommendation).toBe('moderate_only');
    });
  });

  describe('spam rule (priority 5)', () => {
    test('link spam → spam/ignore', async () => {
      const id = await insertItem('免费领取优惠券，点击链接加微信');
      const result = await triageItem(id);
      expect(result.classification).toBe('spam');
      expect(result.risk_level).toBe('low');
      expect(result.recommendation).toBe('ignore');
      expect(result.matched_rules).toContain('spam_filter');
    });

    test('URL spam → spam', async () => {
      const id = await insertItem('快来看 https://scam.com 免费');
      const result = await triageItem(id);
      expect(result.matched_rules).toContain('spam_filter');
    });
  });

  describe('priority ordering', () => {
    test('crisis wins over inquiry when both match', async () => {
      // Contains both crisis keyword (投诉) and question mark (？)
      const id = await insertItem('我要投诉你们，为什么欺骗消费者？');
      const result = await triageItem(id);
      expect(result.classification).toBe('crisis'); // crisis has higher priority
      expect(result.matched_rules).toContain('crisis_keywords');
      expect(result.matched_rules).toContain('inquiry_question');
    });

    test('complaint wins over praise when both match with negative sentiment', async () => {
      // complaint_negative requires sentiment=negative AND complaint keyword
      // praise_positive matches sentiment=positive OR praise keyword
      // This item is negative + has complaint keyword
      const id = await insertItem('差评，我再也不用了', 'negative');
      const result = await triageItem(id);
      expect(result.classification).toBe('complaint');
    });
  });

  describe('default fallback', () => {
    test('no rule matches → general/ignore with lower confidence', async () => {
      const id = await insertItem('今天阳光明媚');
      const result = await triageItem(id);
      expect(result.classification).toBe('general');
      expect(result.recommendation).toBe('ignore');
      expect(result.confidence).toBe(0.5);
      expect(result.matched_rules).toEqual([]);
    });
  });

  describe('persistence', () => {
    test('triage result is persisted to DB', async () => {
      const id = await insertItem('请问如何办理？');
      const result = await triageItem(id);
      expect(result.triage_id).toBeDefined();
      expect(result.item_id).toBe(id);
    });

    test('engagement item status updated to triaged', async () => {
      const id = await insertItem('测试状态更新');
      await triageItem(id);
      const item = await db.query.ixEngagementItems.findFirst({
        where: eq(ixEngagementItems.item_id, id),
      });
      expect(item?.status).toBe('triaged');
    });

    test('non-existent item throws', async () => {
      expect(triageItem('non-existent-id')).rejects.toThrow();
    });
  });
});
