import { describe, test, expect } from 'bun:test';
import { db } from '../../src/db';
import { kmCandidates, kmAssetVersions, kmReplyFeedback } from '../../src/db/schema';
import { eq } from 'drizzle-orm';

describe('reply-copilot schema fields', () => {
  test('km_candidates has scene_code, retrieval_tags_json, structured_json, variants_json', async () => {
    const id = `test_rc_${Date.now()}`;
    await db.insert(kmCandidates).values({
      id,
      source_type: 'manual',
      normalized_q: 'test question',
      variants_json: JSON.stringify(['用户怎么问1', '用户怎么问2']),
      scene_code: 'billing_abnormal',
      retrieval_tags_json: JSON.stringify(['计费', '扣费']),
      structured_json: JSON.stringify({ scene: { code: 'billing_abnormal', label: '资费争议', risk: 'medium' } }),
    });
    const [row] = await db.select().from(kmCandidates).where(eq(kmCandidates.id, id));
    expect(row.scene_code).toBe('billing_abnormal');
    expect(JSON.parse(row.variants_json!)).toEqual(['用户怎么问1', '用户怎么问2']);
    expect(JSON.parse(row.retrieval_tags_json!)).toEqual(['计费', '扣费']);
    expect(JSON.parse(row.structured_json!).scene.code).toBe('billing_abnormal');
    await db.delete(kmCandidates).where(eq(kmCandidates.id, id));
  });

  test('km_asset_versions has structured_snapshot_json', async () => {
    const rows = await db.select({ id: kmAssetVersions.id, snap: kmAssetVersions.structured_snapshot_json })
      .from(kmAssetVersions).limit(1);
    expect(Array.isArray(rows)).toBe(true);
  });

  test('km_reply_feedback can insert and query', async () => {
    const id = `fb_${Date.now()}`;
    await db.insert(kmReplyFeedback).values({
      id,
      session_id: 'sess_1',
      phone: '13800000001',
      message_id: 'msg_1',
      asset_version_id: 'av_1',
      event_type: 'use',
    });
    const [row] = await db.select().from(kmReplyFeedback).where(eq(kmReplyFeedback.id, id));
    expect(row.event_type).toBe('use');
    expect(row.phone).toBe('13800000001');
    await db.delete(kmReplyFeedback).where(eq(kmReplyFeedback.id, id));
  });
});
