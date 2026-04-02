/**
 * mock-social.ts — Mock social media event injection API.
 *
 * Simulates social media platforms pushing engagement events
 * (comments, mentions, reviews) into the system for testing.
 *
 * POST /api/mock-social/ingest — Inject a mock engagement event
 * POST /api/mock-social/batch  — Inject multiple events at once
 * POST /api/mock-social/scenario — Run a predefined test scenario
 */
import { Hono } from 'hono';
import { db, ixContentAssets, ixEngagementItems } from '../db';
import { triageItem } from '../services/triage-engine';
import { bridgeToPrivate } from '../services/public-private-bridge';

const router = new Hono();

/** POST /ingest — Inject a single mock engagement event */
router.post('/ingest', async (c) => {
  const body = await c.req.json<{
    provider?: string;
    item_type?: string;
    author_name?: string;
    author_id?: string;
    body: string;
    sentiment?: string;
    sentiment_score?: number;
    asset_id?: string;
    auto_triage?: boolean;
  }>();

  if (!body.body) return c.json({ error: 'body is required' }, 400);

  const itemId = crypto.randomUUID();
  await db.insert(ixEngagementItems).values({
    item_id: itemId,
    provider: body.provider ?? 'mock',
    item_type: body.item_type ?? 'comment',
    author_name: body.author_name ?? 'Mock User',
    author_id: body.author_id ?? `mock-user-${Math.random().toString(36).slice(2, 8)}`,
    body: body.body,
    sentiment: body.sentiment ?? null,
    sentiment_score: body.sentiment_score ?? null,
    asset_id: body.asset_id ?? null,
    status: 'new',
  });

  let triage = null;
  let bridge = null;

  if (body.auto_triage !== false) {
    triage = await triageItem(itemId);
    if (triage.recommendation === 'materialize' || triage.recommendation === 'convert_private') {
      bridge = await bridgeToPrivate(itemId, {
        priority: triage.risk_level === 'critical' ? 10 : triage.risk_level === 'high' ? 30 : 50,
      });
    }
  }

  return c.json({ item_id: itemId, triage, bridge }, 201);
});

/** POST /batch — Inject multiple mock events */
router.post('/batch', async (c) => {
  const body = await c.req.json<{
    items: Array<{
      provider?: string;
      item_type?: string;
      author_name?: string;
      body: string;
      sentiment?: string;
    }>;
    auto_triage?: boolean;
  }>();

  if (!body.items?.length) return c.json({ error: 'items array is required' }, 400);

  const results = [];
  for (const item of body.items) {
    const itemId = crypto.randomUUID();
    await db.insert(ixEngagementItems).values({
      item_id: itemId,
      provider: item.provider ?? 'mock',
      item_type: item.item_type ?? 'comment',
      author_name: item.author_name ?? 'Mock User',
      author_id: `mock-user-${Math.random().toString(36).slice(2, 8)}`,
      body: item.body,
      sentiment: item.sentiment ?? null,
      status: 'new',
    });

    let triage = null;
    if (body.auto_triage !== false) {
      triage = await triageItem(itemId);
    }

    results.push({ item_id: itemId, body: item.body.slice(0, 50), triage_recommendation: triage?.recommendation });
  }

  return c.json({ count: results.length, results }, 201);
});

/** POST /scenario — Run a predefined test scenario */
router.post('/scenario', async (c) => {
  const body = await c.req.json<{ scenario: string }>();
  const scenario = body.scenario ?? 'mixed';

  const scenarios: Record<string, Array<{ body: string; sentiment?: string; author_name: string }>> = {
    mixed: [
      { body: '你们的服务太差了，我要投诉到315！', sentiment: 'negative', author_name: '愤怒的用户' },
      { body: '请问流量套餐怎么升级？可以在线办理吗？', sentiment: 'neutral', author_name: '咨询用户' },
      { body: '服务很好，五星好评！推荐给大家', sentiment: 'positive', author_name: '满意的客户' },
      { body: '免费领取优惠券，点击链接加微信', sentiment: 'neutral', author_name: 'spam_bot_123' },
      { body: '上个月话费突然多了50块，这是怎么回事？', sentiment: 'negative', author_name: '疑惑的用户' },
    ],
    crisis: [
      { body: '你们公司涉嫌诈骗，我已经联系律师了', sentiment: 'negative', author_name: '维权者A' },
      { body: '工信部投诉都没用，这家公司太坑人了', sentiment: 'negative', author_name: '维权者B' },
      { body: '我要曝光你们，消费者协会已经受理了', sentiment: 'negative', author_name: '维权者C' },
    ],
    inquiry: [
      { body: '怎么查本月话费明细？', sentiment: 'neutral', author_name: '用户1' },
      { body: '5G套餐多少钱一个月？', sentiment: 'neutral', author_name: '用户2' },
      { body: '宽带什么时候能修好？已经报修3天了', sentiment: 'negative', author_name: '用户3' },
    ],
  };

  const items = scenarios[scenario] ?? scenarios.mixed!;
  const results = [];

  for (const item of items) {
    const itemId = crypto.randomUUID();
    await db.insert(ixEngagementItems).values({
      item_id: itemId,
      provider: 'mock',
      item_type: 'comment',
      author_name: item.author_name,
      author_id: `mock-${item.author_name}`,
      body: item.body,
      sentiment: item.sentiment ?? null,
      status: 'new',
    });

    const triage = await triageItem(itemId);
    let bridge = null;
    if (triage.recommendation === 'materialize' || triage.recommendation === 'convert_private') {
      bridge = await bridgeToPrivate(itemId);
    }

    results.push({
      item_id: itemId,
      body: item.body.slice(0, 40),
      classification: triage.classification,
      risk_level: triage.risk_level,
      recommendation: triage.recommendation,
      interaction_id: bridge?.interaction_id,
    });
  }

  return c.json({ scenario, count: results.length, results }, 201);
});

export default router;
