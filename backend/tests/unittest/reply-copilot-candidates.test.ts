import { describe, test, expect } from 'bun:test';
import { db } from '../../src/db';
import { kmCandidates } from '../../src/db/schema';
import { eq } from 'drizzle-orm';

describe('candidates PUT accepts structured fields', () => {
  test('can update scene_code, retrieval_tags_json, structured_json, variants_json via API', async () => {
    const id = `cand_rc_${Date.now()}`;
    await db.insert(kmCandidates).values({ id, source_type: 'manual', normalized_q: 'test q' });

    const res = await fetch(`http://localhost:${process.env.PORT || 18001}/api/km/candidates/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scene_code: 'billing_abnormal',
        variants_json: JSON.stringify(['这个月没怎么用怎么扣了很多费']),
        retrieval_tags_json: JSON.stringify(['计费', '扣费']),
        structured_json: JSON.stringify({
          scene: { code: 'billing_abnormal', label: '资费争议', risk: 'medium' },
          required_slots: ['手机号', '账期'],
        }),
      }),
    });
    expect(res.ok).toBe(true);

    const [row] = await db.select().from(kmCandidates).where(eq(kmCandidates.id, id));
    expect(row.scene_code).toBe('billing_abnormal');
    expect(row.variants_json).toBeTruthy();
    expect(row.structured_json).toBeTruthy();
    expect(JSON.parse(row.structured_json!).scene.code).toBe('billing_abnormal');

    await db.delete(kmCandidates).where(eq(kmCandidates.id, id));
  });
});
