import { describe, test, expect } from 'bun:test';
import { db } from '../../src/db';
import { kmAssets, kmAssetVersions } from '../../src/db/schema';
import { eq } from 'drizzle-orm';
import { buildReplyHints } from '../../src/services/reply-copilot';

describe('buildReplyHints', () => {
  const assetId = `asset_rc_test_${Date.now()}`;
  const versionId = `av_rc_test_${Date.now()}`;

  test('setup test data', async () => {
    await db.insert(kmAssets).values({
      id: assetId, title: '充值后仍未复机如何处理',
      asset_type: 'qa', status: 'online', current_version: 1,
    });
    await db.insert(kmAssetVersions).values({
      id: versionId, asset_id: assetId, version_no: 1,
      content_snapshot: JSON.stringify({
        q: '充值后仍未复机如何处理',
        variants: ['我昨天充了100还是停机，电话打不出去'],
        a: '核实充值到账状态...',
      }),
      structured_snapshot_json: JSON.stringify({
        scene: { code: 'recharge_restore_delay', label: '充值到账/停复机异常', risk: 'medium' },
        expanded_questions: ['我昨天充了100还是停机，电话打不出去'],
        required_slots: ['手机号', '充值时间', '充值渠道', '停机提示'],
        recommended_terms: ['到账状态核查中', '复机存在处理时延', '以系统恢复结果为准'],
        forbidden_terms: ['充值失败了吧', '马上恢复'],
        reply_options: [
          { label: '标准版', text: '这边先帮您核实充值到账和复机状态。' },
          { label: '安抚版', text: '理解您现在无法通话会比较着急。' },
        ],
        next_actions: ['查充值流水', '查停复机状态', '发起复机异常工单'],
        sources: ['计费规则与争议处理规范 / 停复机规则 v2026.03'],
        retrieval_tags: ['充值', '停机', '复机', '到账'],
      }),
      effective_from: new Date().toISOString(),
    });
  });

  test('returns matching hints for a relevant query', async () => {
    const hints = await buildReplyHints({
      message: '我昨天充了100还是停机，电话打不出去',
      phone: '13800000001',
    });
    expect(hints).not.toBeNull();
    if (hints) {
      expect(hints.scene.code).toBe('recharge_restore_delay');
      expect(hints.required_slots.length).toBeGreaterThan(0);
      expect(hints.recommended_terms.length).toBeGreaterThan(0);
      expect(hints.forbidden_terms.length).toBeGreaterThan(0);
      expect(hints.reply_options.length).toBeGreaterThan(0);
      expect(hints.next_actions.length).toBeGreaterThan(0);
      expect(hints.sources.length).toBeGreaterThan(0);
      expect(hints.confidence).toBeDefined();
      expect(hints.asset_version_id).toBeTruthy();
    }
  });

  test('returns null when no assets match', async () => {
    const hints = await buildReplyHints({
      message: '你好，请问你是谁',
      phone: '13800000001',
    });
    expect(hints).toBeNull();
  });

  test('cleanup', async () => {
    await db.delete(kmAssetVersions).where(eq(kmAssetVersions.id, versionId));
    await db.delete(kmAssets).where(eq(kmAssets.id, assetId));
  });
});
