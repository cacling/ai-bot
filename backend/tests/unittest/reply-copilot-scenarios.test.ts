import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { inArray, eq } from 'drizzle-orm';
import { db } from '../../src/db';
import { seedReplyCopilotKnowledge, REPLY_COPILOT_SCENES } from '../../src/db/seed-reply-copilot';
import { kmAssetVersions, kmAssets, kmCandidates, kmReviewPackages, kmEvidenceRefs, kmDocVersions, kmDocuments } from '../../src/db/schema';
import { buildReplyHints } from '../../src/services/reply-copilot';

describe('Reply Copilot telecom scenes', () => {
  let seeded: Awaited<ReturnType<typeof seedReplyCopilotKnowledge>>;

  beforeAll(async () => {
    seeded = await seedReplyCopilotKnowledge({
      createdBy: 'test-reply-copilot',
      owner: 'test-reply-copilot',
      packageTitle: 'Reply Copilot - 单测场景',
      includeConsoleLogs: false,
      idPrefix: `test-reply-copilot-${Date.now()}`,
    });
  });

  afterAll(async () => {
    await db.delete(kmAssetVersions).where(inArray(kmAssetVersions.id, seeded.assetVersionIds));
    await db.delete(kmAssets).where(inArray(kmAssets.id, seeded.assetIds));
    await db.delete(kmEvidenceRefs).where(inArray(kmEvidenceRefs.id, seeded.evidenceIds));
    await db.delete(kmCandidates).where(inArray(kmCandidates.id, seeded.candidateIds));
    await db.delete(kmDocVersions).where(inArray(kmDocVersions.id, seeded.documentVersionIds));
    await db.delete(kmDocuments).where(inArray(kmDocuments.id, seeded.documentIds));
    await db.delete(kmReviewPackages).where(eq(kmReviewPackages.id, seeded.packageId));
  });

  for (const scene of REPLY_COPILOT_SCENES) {
    test(`matches scene ${scene.scene.code}`, async () => {
      expect(scene.expanded_questions).toHaveLength(10);

      for (const question of scene.expanded_questions) {
        const hints = await buildReplyHints({
          message: question,
          phone: '13800000001',
        });

        expect(hints).not.toBeNull();
        if (hints) {
          expect(hints.scene.code).toBe(scene.scene.code);
          expect(hints.scene.label).toBe(scene.scene.label);
          expect(hints.required_slots).toEqual(scene.required_slots);
          expect(hints.reply_options.length).toBeGreaterThan(0);
        }
      }
    });
  }
});
