# Reply Copilot (坐席回复术语提示) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a "Reply Copilot" that gives human agents real-time structured reply hints (scene, required slots, terms, recommended replies, next actions) based on KM published assets, triggered when a customer message arrives during human-agent mode.

**Architecture:** Bypass approach — does not replace the existing Skill+SOP bot pipeline. Adds 3 new DB columns to `km_candidates`, 1 to `km_asset_versions`, 1 new table `km_reply_feedback`. A new backend service retrieves published structured assets and publishes `reply_hints` events via sessionBus. A new agent workstation card renders the hints with actionable buttons.

**Tech Stack:** Hono routes, Drizzle ORM (SQLite), SessionBus pub/sub, React + shadcn/ui card component, existing KM publish pipeline.

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `packages/shared-db/src/schema/platform.ts` | Add `scene_code`, `retrieval_tags_json`, `structured_json` to `km_candidates`; `structured_snapshot_json` to `km_asset_versions`; new `km_reply_feedback` table |
| Modify | `backend/src/db/schema/platform.ts` | Add `kmReplyFeedback` to re-export barrel |
| Modify | `backend/src/agent/km/kms/candidates.ts` | Allow updating new fields in PUT endpoint |
| Modify | `backend/src/agent/km/kms/action-drafts.ts` | Copy `structured_json` into `structured_snapshot_json` during publish |
| Create | `backend/src/services/reply-copilot.ts` | Retrieve + rank + build reply hints from published assets |
| Create | `backend/src/agent/km/kms/reply-copilot.ts` | REST routes: preview hints, record feedback |
| Modify | `backend/src/agent/km/kms/index.ts` | Mount reply-copilot route |
| Modify | `backend/src/services/session-bus.ts` | Add `reply_hints` event type |
| Modify | `backend/src/chat/chat-ws.ts` | Call `buildReplyHints()` async in human-agent mode |
| — | `backend/src/agent/chat/agent-ws.ts` | No change needed: existing `source === 'system'` handler already forwards `reply_hints` events |
| Create | `frontend/src/agent/cards/contents/ReplyHintContent.tsx` | Reply hint card UI (uses CustomEvent for insert/feedback) |
| Modify | `frontend/src/agent/cards/index.ts` | Register `reply_hint` card |
| Modify | `frontend/src/agent/AgentWorkstationPage.tsx` | Handle `reply_hints` event, support "insert to input" action |
| Modify | `frontend/src/km/CandidateDetailPage.tsx` | Add structured hint editor section |
| Modify | `frontend/src/km/api.ts` | Add types + API functions for new fields and feedback |
| Create | `backend/tests/unittest/reply-copilot.test.ts` | Unit tests for retriever + builder |
| Create | `frontend/tests/unittest/agent/cards/ReplyHintContent.test.tsx` | Card component test |

---

### Task 1: Schema — Add structured fields to km_candidates and km_asset_versions

**Files:**
- Modify: `packages/shared-db/src/schema/platform.ts:162-181` (km_candidates)
- Modify: `packages/shared-db/src/schema/platform.ts:258-269` (km_asset_versions)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/unittest/reply-copilot-schema.test.ts`:

```typescript
import { describe, test, expect } from 'bun:test';
import { db } from '../../src/db';
import { kmCandidates, kmAssetVersions } from '../../src/db/schema';
import { eq } from 'drizzle-orm';

describe('reply-copilot schema fields', () => {
  test('km_candidates has scene_code, retrieval_tags_json, structured_json', async () => {
    const id = `test_rc_${Date.now()}`;
    await db.insert(kmCandidates).values({
      id,
      source_type: 'manual',
      normalized_q: 'test question',
      scene_code: 'billing_abnormal',
      retrieval_tags_json: JSON.stringify(['计费', '扣费']),
      structured_json: JSON.stringify({ scene: { code: 'billing_abnormal', label: '资费争议', risk: 'medium' } }),
    });
    const [row] = await db.select().from(kmCandidates).where(eq(kmCandidates.id, id));
    expect(row.scene_code).toBe('billing_abnormal');
    expect(JSON.parse(row.retrieval_tags_json!)).toEqual(['计费', '扣费']);
    expect(JSON.parse(row.structured_json!).scene.code).toBe('billing_abnormal');
    await db.delete(kmCandidates).where(eq(kmCandidates.id, id));
  });

  test('km_asset_versions has structured_snapshot_json', async () => {
    // This test verifies the column exists via a direct select
    const rows = await db.select({ id: kmAssetVersions.id, snap: kmAssetVersions.structured_snapshot_json })
      .from(kmAssetVersions).limit(1);
    // Column should exist (may return empty result, that's ok)
    expect(Array.isArray(rows)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && bun test tests/unittest/reply-copilot-schema.test.ts`
Expected: FAIL — `scene_code`, `retrieval_tags_json`, `structured_json`, `structured_snapshot_json` are not defined on the schema.

- [ ] **Step 3: Add columns to km_candidates in platform.ts**

In `packages/shared-db/src/schema/platform.ts`, add 3 columns to `kmCandidates` (after `category` line 169):

```typescript
  scene_code: text('scene_code'),
  retrieval_tags_json: text('retrieval_tags_json'),
  structured_json: text('structured_json'),
```

- [ ] **Step 4: Add column to km_asset_versions in platform.ts**

In `packages/shared-db/src/schema/platform.ts`, add 1 column to `kmAssetVersions` (after `evidence_summary` line 264):

```typescript
  structured_snapshot_json: text('structured_snapshot_json'),
```

- [ ] **Step 5: Push schema to DB**

Run: `cd backend && bunx drizzle-kit push`
Expected: 4 new columns added to existing tables.

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && bun test tests/unittest/reply-copilot-schema.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/shared-db/src/schema/platform.ts backend/tests/unittest/reply-copilot-schema.test.ts
git commit -m "feat(schema): add structured hint fields to km_candidates and km_asset_versions"
```

---

### Task 2: Schema — New km_reply_feedback table

**Files:**
- Modify: `packages/shared-db/src/schema/platform.ts` (after km_audit_logs)

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/unittest/reply-copilot-schema.test.ts`:

```typescript
import { kmReplyFeedback } from '../../src/db/schema';

describe('km_reply_feedback table', () => {
  test('can insert and query feedback', async () => {
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && bun test tests/unittest/reply-copilot-schema.test.ts`
Expected: FAIL — `kmReplyFeedback` not found.

- [ ] **Step 3: Add km_reply_feedback table to platform.ts**

Add after the `kmAuditLogs` table definition:

```typescript
export const kmReplyFeedback = sqliteTable('km_reply_feedback', {
  id: text('id').primaryKey(),
  session_id: text('session_id'),
  phone: text('phone'),
  message_id: text('message_id'),
  asset_version_id: text('asset_version_id'),
  event_type: text('event_type').notNull(), // 'shown' | 'use' | 'copy' | 'edit' | 'dismiss'
  detail_json: text('detail_json'),
  created_at: text('created_at').$defaultFn(() => new Date().toISOString()),
});
```

- [ ] **Step 4: Add kmReplyFeedback to the re-export barrel**

In `backend/src/db/schema/platform.ts`, add `kmReplyFeedback` to the export list (after `kmAuditLogs` on line 28):

```typescript
  kmReplyFeedback,
```

- [ ] **Step 5: Push schema and run test**

Run: `cd backend && bunx drizzle-kit push && bun test tests/unittest/reply-copilot-schema.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/shared-db/src/schema/platform.ts backend/src/db/schema/platform.ts backend/tests/unittest/reply-copilot-schema.test.ts
git commit -m "feat(schema): add km_reply_feedback table for copilot usage tracking"
```

---

### Task 3: Backend — Update candidates.ts to allow editing new fields

**Files:**
- Modify: `backend/src/agent/km/kms/candidates.ts:91-105`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/unittest/reply-copilot-candidates.test.ts`:

```typescript
import { describe, test, expect } from 'bun:test';
import { db } from '../../src/db';
import { kmCandidates } from '../../src/db/schema';
import { eq } from 'drizzle-orm';

describe('candidates PUT accepts structured fields', () => {
  test('can update scene_code, retrieval_tags_json, structured_json via API', async () => {
    // Create a test candidate
    const id = `cand_rc_${Date.now()}`;
    await db.insert(kmCandidates).values({ id, source_type: 'manual', normalized_q: 'test q' });

    // Call PUT endpoint
    const res = await fetch(`http://localhost:${process.env.PORT || 18001}/api/km/candidates/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scene_code: 'billing_abnormal',
        retrieval_tags_json: JSON.stringify(['计费', '扣费']),
        structured_json: JSON.stringify({
          scene: { code: 'billing_abnormal', label: '资费争议', risk: 'medium' },
          required_slots: ['手机号', '账期'],
          recommended_terms: ['以账单和详单为准'],
          forbidden_terms: ['系统出错了'],
          reply_options: [{ label: '标准版', text: '为您核实...' }],
          next_actions: ['查询账单'],
          sources: ['计费规则 第5章'],
        }),
      }),
    });
    expect(res.ok).toBe(true);

    const [row] = await db.select().from(kmCandidates).where(eq(kmCandidates.id, id));
    expect(row.scene_code).toBe('billing_abnormal');
    expect(row.structured_json).toBeTruthy();
    expect(JSON.parse(row.structured_json!).scene.code).toBe('billing_abnormal');

    await db.delete(kmCandidates).where(eq(kmCandidates.id, id));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && bun test tests/unittest/reply-copilot-candidates.test.ts`
Expected: FAIL — `scene_code` not in allowed list, so it won't be saved.

- [ ] **Step 3: Add new fields to the allowed update list**

In `backend/src/agent/km/kms/candidates.ts:97`, extend the `allowed` array:

```typescript
const allowed = ['normalized_q', 'draft_answer', 'variants_json', 'category', 'risk_level', 'target_asset_id', 'status', 'scene_code', 'retrieval_tags_json', 'structured_json'];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && bun test tests/unittest/reply-copilot-candidates.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/agent/km/kms/candidates.ts backend/tests/unittest/reply-copilot-candidates.test.ts
git commit -m "feat(km): allow updating structured hint fields on candidates"
```

---

### Task 4: Backend — Publish flow copies structured_json to asset version

**Files:**
- Modify: `backend/src/agent/km/kms/action-drafts.ts:85-118`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/unittest/reply-copilot-publish.test.ts`:

```typescript
import { describe, test, expect } from 'bun:test';
import { db } from '../../src/db';
import { kmCandidates, kmReviewPackages, kmActionDrafts, kmAssets, kmAssetVersions } from '../../src/db/schema';
import { eq, desc } from 'drizzle-orm';

describe('publish copies structured_json to asset version', () => {
  test('structured_snapshot_json is set on publish', async () => {
    const ts = Date.now();
    const candId = `cand_pub_${ts}`;
    const pkgId = `pkg_pub_${ts}`;
    const draftId = `draft_pub_${ts}`;
    const structured = JSON.stringify({
      scene: { code: 'test_scene', label: 'Test', risk: 'low' },
      required_slots: ['手机号'],
      recommended_terms: ['为您核实'],
      forbidden_terms: ['系统出错了'],
      reply_options: [{ label: '标准版', text: 'test reply' }],
      next_actions: ['查询账单'],
      sources: ['测试来源'],
    });

    // Setup: candidate with structured_json
    await db.insert(kmCandidates).values({
      id: candId, source_type: 'manual', normalized_q: 'publish test',
      draft_answer: 'test answer', structured_json: structured,
      gate_evidence: 'pass', gate_conflict: 'pass', gate_ownership: 'pass',
      status: 'gate_pass', review_pkg_id: pkgId,
    });
    await db.insert(kmReviewPackages).values({
      id: pkgId, title: 'test pkg', status: 'approved',
      candidate_ids_json: JSON.stringify([candId]),
    });
    await db.insert(kmActionDrafts).values({
      id: draftId, action_type: 'publish', review_pkg_id: pkgId, status: 'reviewed',
    });

    // Execute publish
    const res = await fetch(`http://localhost:${process.env.PORT || 18001}/api/km/action-drafts/${draftId}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ executed_by: 'test' }),
    });
    expect(res.ok).toBe(true);

    // Verify: asset version has structured_snapshot_json
    const [cand] = await db.select().from(kmCandidates).where(eq(kmCandidates.id, candId));
    expect(cand.status).toBe('published');

    // Find the created asset version
    const versions = await db.select().from(kmAssetVersions)
      .where(eq(kmAssetVersions.action_draft_id, draftId));
    expect(versions.length).toBeGreaterThan(0);
    expect(versions[0].structured_snapshot_json).toBeTruthy();
    expect(JSON.parse(versions[0].structured_snapshot_json!).scene.code).toBe('test_scene');

    // Cleanup
    for (const v of versions) {
      await db.delete(kmAssetVersions).where(eq(kmAssetVersions.id, v.id));
      await db.delete(kmAssets).where(eq(kmAssets.id, v.asset_id));
    }
    await db.delete(kmActionDrafts).where(eq(kmActionDrafts.id, draftId));
    await db.delete(kmReviewPackages).where(eq(kmReviewPackages.id, pkgId));
    await db.delete(kmCandidates).where(eq(kmCandidates.id, candId));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && bun test tests/unittest/reply-copilot-publish.test.ts`
Expected: FAIL — `structured_snapshot_json` is null because publish logic doesn't copy it.

- [ ] **Step 3: Modify action-drafts.ts publish logic**

In `backend/src/agent/km/kms/action-drafts.ts`, at the two places where `kmAssetVersions` is inserted (lines ~94-100 and ~110-114), add `structured_snapshot_json: cand.structured_json`:

For the "update existing asset" path (~line 94):
```typescript
await db.insert(kmAssetVersions).values({
  id: rollbackId, asset_id: assetId, version_no: newVer,
  content_snapshot: JSON.stringify({ q: cand.normalized_q, a: cand.draft_answer }),
  structured_snapshot_json: cand.structured_json,  // ← ADD
  scope_snapshot: asset.scope_json, action_draft_id: id,
  rollback_point_id: `v${asset.current_version}`,
  effective_from: now, created_at: now,
});
```

For the "create new asset" path (~line 110):
```typescript
await db.insert(kmAssetVersions).values({
  id: nanoid(), asset_id: assetId, version_no: 1,
  content_snapshot: JSON.stringify({ q: cand.normalized_q, a: cand.draft_answer }),
  structured_snapshot_json: cand.structured_json,  // ← ADD
  action_draft_id: id, effective_from: now, created_at: now,
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && bun test tests/unittest/reply-copilot-publish.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/agent/km/kms/action-drafts.ts backend/tests/unittest/reply-copilot-publish.test.ts
git commit -m "feat(km): copy structured_json to asset version on publish"
```

---

### Task 5: Backend — Reply Copilot service (retriever + builder)

**Files:**
- Create: `backend/src/services/reply-copilot.ts`
- Test: `backend/tests/unittest/reply-copilot.test.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/unittest/reply-copilot.test.ts`:

```typescript
import { describe, test, expect } from 'bun:test';
import { db } from '../../src/db';
import { kmAssets, kmAssetVersions } from '../../src/db/schema';
import { eq } from 'drizzle-orm';

// Will import after implementation
// import { buildReplyHints } from '../../src/services/reply-copilot';

describe('buildReplyHints', () => {
  const assetId = `asset_rc_test`;
  const versionId = `av_rc_test`;

  // Setup: insert a published asset with structured_snapshot_json
  test('setup test data', async () => {
    await db.insert(kmAssets).values({
      id: assetId, title: '充值后为什么还是停机',
      asset_type: 'qa', status: 'online', current_version: 1,
    });
    await db.insert(kmAssetVersions).values({
      id: versionId, asset_id: assetId, version_no: 1,
      content_snapshot: JSON.stringify({ q: '充值后为什么还是停机', a: '核实充值到账状态...' }),
      structured_snapshot_json: JSON.stringify({
        scene: { code: 'recharge_no_restore', label: '充值到账/停复机异常', risk: 'medium' },
        required_slots: ['手机号', '充值时间', '充值渠道', '停机提示'],
        recommended_terms: ['到账状态核查中', '复机存在处理时延', '以系统恢复结果为准'],
        forbidden_terms: ['充值失败了吧', '马上恢复'],
        reply_options: [
          { label: '标准版', text: '这边先帮您核实充值到账和复机状态，为尽快确认处理进度，麻烦提供一下手机号和充值时间。' },
          { label: '安抚版', text: '理解您现在无法通话会比较着急，这边先马上帮您查一下充值和复机状态。' },
        ],
        next_actions: ['查充值流水', '查停复机状态', '发起复机异常工单'],
        sources: ['计费规则与争议处理规范 / 停复机规则 v2026.03'],
      }),
      effective_from: new Date().toISOString(),
    });
  });

  test('returns matching hints for a relevant query', async () => {
    const { buildReplyHints } = await import('../../src/services/reply-copilot');
    const hints = await buildReplyHints({
      message: '我昨天充了100还是停机，电话打不出去',
      phone: '13800000001',
    });

    expect(hints).not.toBeNull();
    if (hints) {
      expect(hints.scene.code).toBe('recharge_no_restore');
      expect(hints.required_slots.length).toBeGreaterThan(0);
      expect(hints.recommended_terms.length).toBeGreaterThan(0);
      expect(hints.forbidden_terms.length).toBeGreaterThan(0);
      expect(hints.reply_options.length).toBeGreaterThan(0);
      expect(hints.next_actions.length).toBeGreaterThan(0);
      expect(hints.sources.length).toBeGreaterThan(0);
      expect(hints.confidence).toBeDefined();
      expect(hints.asset_version_id).toBe(versionId);
    }
  });

  test('returns null when no assets match', async () => {
    const { buildReplyHints } = await import('../../src/services/reply-copilot');
    const hints = await buildReplyHints({
      message: '你好，请问你是谁',
      phone: '13800000001',
    });
    // Generic greeting should not match any structured asset
    expect(hints).toBeNull();
  });

  test('cleanup', async () => {
    await db.delete(kmAssetVersions).where(eq(kmAssetVersions.id, versionId));
    await db.delete(kmAssets).where(eq(kmAssets.id, assetId));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && bun test tests/unittest/reply-copilot.test.ts`
Expected: FAIL — module `../../src/services/reply-copilot` does not exist.

- [ ] **Step 3: Implement reply-copilot.ts**

Create `backend/src/services/reply-copilot.ts`:

```typescript
/**
 * reply-copilot.ts — Retrieve + rank + build structured reply hints
 * for human agents from published KM assets.
 *
 * MVP strategy: tag + keyword matching (no vector DB).
 * 1. Filter online assets with structured_snapshot_json
 * 2. Score by keyword overlap (message vs scene label + tags + Q)
 * 3. Return top-1 if confidence > threshold, else null
 */

import { db } from '../db';
import { kmAssets, kmAssetVersions } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from './logger';

export interface ReplyHints {
  scene: { code: string; label: string; risk: string };
  required_slots: string[];
  recommended_terms: string[];
  forbidden_terms: string[];
  reply_options: Array<{ label: string; text: string }>;
  next_actions: string[];
  sources: string[];
  confidence: number;
  asset_version_id: string;
}

interface BuildParams {
  message: string;
  phone: string;
  normalizedQuery?: string;
  intentHints?: string[];
}

interface ScoredCandidate {
  score: number;
  versionId: string;
  structured: Record<string, unknown>;
}

/**
 * Build reply hints for a user message by matching against published assets.
 * Returns null if no confident match is found.
 */
export async function buildReplyHints(params: BuildParams): Promise<ReplyHints | null> {
  const { message, normalizedQuery } = params;
  const t0 = Date.now();

  try {
    // 1. Load all online assets with their latest version's structured data
    const assets = await db.select({
      assetId: kmAssets.id,
      title: kmAssets.title,
      versionId: kmAssetVersions.id,
      contentSnapshot: kmAssetVersions.content_snapshot,
      structuredSnapshot: kmAssetVersions.structured_snapshot_json,
    })
    .from(kmAssets)
    .innerJoin(kmAssetVersions, and(
      eq(kmAssetVersions.asset_id, kmAssets.id),
      eq(kmAssetVersions.version_no, kmAssets.current_version),
    ))
    .where(eq(kmAssets.status, 'online'));

    // 2. Filter to those with structured data
    const withStructured = assets.filter(a => a.structuredSnapshot);
    if (withStructured.length === 0) return null;

    // 3. Score each asset by keyword overlap
    const queryText = (normalizedQuery ?? message).toLowerCase();
    const queryChars = new Set(queryText.split(''));

    const scored: ScoredCandidate[] = withStructured.map(a => {
      const structured = JSON.parse(a.structuredSnapshot!);
      let score = 0;

      // Match against scene label
      const label = (structured.scene?.label ?? '').toLowerCase();
      score += overlapScore(queryText, label) * 3;

      // Match against title (normalized_q)
      score += overlapScore(queryText, (a.title ?? '').toLowerCase()) * 2;

      // Match against content Q
      try {
        const content = JSON.parse(a.contentSnapshot ?? '{}');
        score += overlapScore(queryText, (content.q ?? '').toLowerCase()) * 2;
      } catch { /* ignore */ }

      // Match against retrieval tags (stored in structured_snapshot_json)
      const tags: string[] = structured.retrieval_tags ?? [];
      for (const tag of tags) {
        if (queryText.includes(tag.toLowerCase())) score += 2;
      }

      // Match against scene code keywords
      const codeWords = (structured.scene?.code ?? '').split('_');
      for (const w of codeWords) {
        if (queryText.includes(w)) score += 1;
      }

      return { score, versionId: a.versionId, structured };
    });

    // 4. Sort by score, take top
    scored.sort((a, b) => b.score - a.score);
    const top = scored[0];
    if (!top || top.score < 2) return null; // confidence threshold

    const confidence = Math.min(top.score / 10, 1);
    const s = top.structured;

    logger.info('reply-copilot', 'hints_built', {
      ms: Date.now() - t0,
      scene: s.scene?.code,
      confidence: confidence.toFixed(2),
      candidateCount: withStructured.length,
    });

    return {
      scene: s.scene ?? { code: 'unknown', label: '未知', risk: 'low' },
      required_slots: s.required_slots ?? [],
      recommended_terms: s.recommended_terms ?? [],
      forbidden_terms: s.forbidden_terms ?? [],
      reply_options: s.reply_options ?? [],
      next_actions: s.next_actions ?? [],
      sources: s.sources ?? [],
      confidence,
      asset_version_id: top.versionId,
    };
  } catch (err) {
    logger.error('reply-copilot', 'build_error', { error: String(err) });
    return null;
  }
}

/** Simple character-bigram overlap ratio between query and target. */
function overlapScore(query: string, target: string): number {
  if (!target || !query) return 0;
  const queryBigrams = bigrams(query);
  const targetBigrams = bigrams(target);
  if (queryBigrams.size === 0 || targetBigrams.size === 0) return 0;
  let overlap = 0;
  for (const b of queryBigrams) {
    if (targetBigrams.has(b)) overlap++;
  }
  return overlap / Math.max(queryBigrams.size, 1);
}

function bigrams(s: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) {
    set.add(s.slice(i, i + 2));
  }
  return set;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && bun test tests/unittest/reply-copilot.test.ts`
Expected: PASS (all 4 tests including setup/cleanup)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/reply-copilot.ts backend/tests/unittest/reply-copilot.test.ts
git commit -m "feat: add reply-copilot service with keyword-based retrieval"
```

---

### Task 6: Backend — Reply Copilot REST routes (preview + feedback)

**Files:**
- Create: `backend/src/agent/km/kms/reply-copilot.ts`
- Modify: `backend/src/agent/km/kms/index.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/unittest/reply-copilot-routes.test.ts`:

```typescript
import { describe, test, expect } from 'bun:test';
import { db } from '../../src/db';
import { kmReplyFeedback } from '../../src/db/schema';
import { eq } from 'drizzle-orm';

const BASE = `http://localhost:${process.env.PORT || 18001}/api/km/reply-copilot`;

describe('reply-copilot routes', () => {
  test('POST /preview returns hints or null', async () => {
    const res = await fetch(`${BASE}/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '充值后还是停机', phone: '13800000001' }),
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    // May or may not have hints depending on seed data
    expect(data).toBeDefined();
  });

  test('POST /feedback records feedback', async () => {
    const res = await fetch(`${BASE}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: 'test_sess',
        phone: '13800000001',
        message_id: 'msg_test',
        asset_version_id: 'av_test',
        event_type: 'use',
      }),
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.ok).toBe(true);

    // Verify in DB
    const rows = await db.select().from(kmReplyFeedback)
      .where(eq(kmReplyFeedback.session_id, 'test_sess'));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].event_type).toBe('use');

    // Cleanup
    for (const r of rows) {
      await db.delete(kmReplyFeedback).where(eq(kmReplyFeedback.id, r.id));
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && bun test tests/unittest/reply-copilot-routes.test.ts`
Expected: FAIL — 404, route not registered.

- [ ] **Step 3: Create the route file**

Create `backend/src/agent/km/kms/reply-copilot.ts`:

```typescript
/**
 * reply-copilot.ts — REST routes for Reply Copilot
 *
 * POST /preview   — preview reply hints for a message (used by KM backend and agent workstation)
 * POST /feedback  — record agent feedback (use/copy/edit/dismiss)
 */
import { Hono } from 'hono';
import { db } from '../../../db';
import { kmReplyFeedback } from '../../../db/schema';
import { buildReplyHints } from '../../../services/reply-copilot';
import { nanoid } from './helpers';
import { logger } from '../../../services/logger';

const app = new Hono();

// POST /preview — preview hints for a message
app.post('/preview', async (c) => {
  const body = await c.req.json<{ message: string; phone?: string }>();
  if (!body.message) return c.json({ error: 'message is required' }, 400);

  const hints = await buildReplyHints({
    message: body.message,
    phone: body.phone ?? '',
  });
  return c.json({ hints });
});

// POST /feedback — record agent interaction with hints
app.post('/feedback', async (c) => {
  const body = await c.req.json<{
    session_id?: string;
    phone?: string;
    message_id?: string;
    asset_version_id?: string;
    event_type: string;
    detail_json?: string;
  }>();

  const validEvents = ['shown', 'use', 'copy', 'edit', 'dismiss'];
  if (!validEvents.includes(body.event_type)) {
    return c.json({ error: `event_type must be one of: ${validEvents.join(', ')}` }, 400);
  }

  const id = nanoid();
  await db.insert(kmReplyFeedback).values({
    id,
    session_id: body.session_id,
    phone: body.phone,
    message_id: body.message_id,
    asset_version_id: body.asset_version_id,
    event_type: body.event_type,
    detail_json: body.detail_json,
  });

  logger.info('reply-copilot', 'feedback_recorded', { id, event_type: body.event_type, asset_version_id: body.asset_version_id });
  return c.json({ ok: true, id });
});

export default app;
```

- [ ] **Step 4: Mount the route in index.ts**

In `backend/src/agent/km/kms/index.ts`, add:

```typescript
import replyCopilot from './reply-copilot';
```

And add the route:

```typescript
km.route('/reply-copilot', replyCopilot);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && bun test tests/unittest/reply-copilot-routes.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/agent/km/kms/reply-copilot.ts backend/src/agent/km/kms/index.ts backend/tests/unittest/reply-copilot-routes.test.ts
git commit -m "feat(km): add reply-copilot REST routes for preview and feedback"
```

---

### Task 7: Backend — SessionBus event type + chat-ws integration

**Files:**
- Modify: `backend/src/services/session-bus.ts:14-31`
- Modify: `backend/src/chat/chat-ws.ts:172-177`
- Note: `agent-ws.ts` already forwards all `source: 'system'` events (line 123-127), so no modification needed there

- [ ] **Step 1: Add reply_hints event type to SessionBus**

In `backend/src/services/session-bus.ts`, add a new union member to `BusEvent` (after the `system` events, line ~31):

```typescript
  | { source: 'system'; type: 'reply_hints';  data: Record<string, unknown>; phone: string; msg_id: string }
```

- [ ] **Step 2: Hook buildReplyHints into chat-ws.ts human-agent mode**

In `backend/src/chat/chat-ws.ts`, find the block at line ~172 where `!botEnabled` is checked. After publishing the `user_message` event but before `return`, add an async call to `buildReplyHints`:

```typescript
if (!botEnabled) {
  // Bot is disabled (human agent mode) — notify agent; re-send transfer_to_human to fix race conditions
  sessionBus.publish(phone, { source: 'user', type: 'user_message', text: message, msg_id: crypto.randomUUID() });
  try { ws.send(JSON.stringify({ type: 'transfer_to_human' })); } catch { /* ws closed */ }

  // Async: generate reply hints for the human agent
  buildReplyHints({ message, phone, normalizedQuery: normalizedContext?.rewritten_query, intentHints: normalizedContext?.intent_hints })
    .then(hints => {
      if (hints) {
        sessionBus.publish(phone, {
          source: 'system', type: 'reply_hints',
          data: hints as unknown as Record<string, unknown>,
          phone,
          msg_id: crypto.randomUUID(),
        });
      }
    })
    .catch(err => logger.warn('chat-ws', 'reply_hints_error', { phone, error: String(err) }));

  return;
}
```

Add the import at the top of chat-ws.ts:

```typescript
import { buildReplyHints } from '../services/reply-copilot';
```

- [ ] **Step 3: Verify agent-ws.ts already forwards system events (no code change needed)**

`agent-ws.ts` lines 123-127 already forward all `source: 'system'` events to the agent WS. Since `reply_hints` uses `source: 'system'`, it will be forwarded automatically. No modification needed.

- [ ] **Step 4: Verify manually**

This integration cannot be easily unit-tested without a full WS connection. It will be verified in the E2E flow after the frontend card is built.

Run: `cd backend && bun test tests/unittest/` (ensure no regressions)
Expected: All existing tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/session-bus.ts backend/src/chat/chat-ws.ts backend/src/agent/chat/agent-ws.ts
git commit -m "feat: publish reply_hints via sessionBus in human-agent mode"
```

---

### Task 8: Frontend — ReplyHintContent card component

**Files:**
- Create: `frontend/src/agent/cards/contents/ReplyHintContent.tsx`
- Test: `frontend/tests/unittest/agent/cards/ReplyHintContent.test.tsx`

- [ ] **Step 1: Write the component test**

Create `frontend/tests/unittest/agent/cards/ReplyHintContent.test.tsx`:

```tsx
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReplyHintContent } from '../../../../src/agent/cards/contents/ReplyHintContent';

const mockHints = {
  scene: { code: 'recharge_no_restore', label: '充值到账/停复机异常', risk: 'medium' },
  required_slots: ['手机号', '充值时间'],
  recommended_terms: ['到账状态核查中', '复机存在处理时延'],
  forbidden_terms: ['充值失败了吧', '马上恢复'],
  reply_options: [
    { label: '标准版', text: '这边先帮您核实充值到账和复机状态...' },
    { label: '安抚版', text: '理解您现在无法通话会比较着急...' },
  ],
  next_actions: ['查充值流水', '查停复机状态'],
  sources: ['计费规则 / 停复机规则'],
  confidence: 0.8,
  asset_version_id: 'av_1',
};

describe('ReplyHintContent', () => {
  test('renders empty state when data is null', () => {
    render(<ReplyHintContent data={null} lang="zh" />);
    expect(screen.getByText(/等待用户消息/)).toBeTruthy();
  });

  test('renders scene info', () => {
    render(<ReplyHintContent data={mockHints} lang="zh" />);
    expect(screen.getByText(/充值到账\/停复机异常/)).toBeTruthy();
  });

  test('renders required slots', () => {
    render(<ReplyHintContent data={mockHints} lang="zh" />);
    expect(screen.getByText('手机号')).toBeTruthy();
    expect(screen.getByText('充值时间')).toBeTruthy();
  });

  test('renders recommended and forbidden terms', () => {
    render(<ReplyHintContent data={mockHints} lang="zh" />);
    expect(screen.getByText('到账状态核查中')).toBeTruthy();
    expect(screen.getByText('充值失败了吧')).toBeTruthy();
  });

  test('renders reply options', () => {
    render(<ReplyHintContent data={mockHints} lang="zh" />);
    expect(screen.getByText(/标准版/)).toBeTruthy();
    expect(screen.getByText(/安抚版/)).toBeTruthy();
  });

  test('renders next actions', () => {
    render(<ReplyHintContent data={mockHints} lang="zh" />);
    expect(screen.getByText('查充值流水')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend/tests/unittest && npx vitest run agent/cards/ReplyHintContent.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement ReplyHintContent.tsx**

Create `frontend/src/agent/cards/contents/ReplyHintContent.tsx`:

```tsx
/**
 * ReplyHintContent.tsx — Reply Copilot hint card (colSpan: 2)
 *
 * data shape: ReplyHintData | null
 */

import { memo } from 'react';
import { type Lang } from '../../../i18n';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Copy, ArrowRightToLine, XCircle } from 'lucide-react';

interface ReplyHintData {
  scene: { code: string; label: string; risk: string };
  required_slots: string[];
  recommended_terms: string[];
  forbidden_terms: string[];
  reply_options: Array<{ label: string; text: string }>;
  next_actions: string[];
  sources: string[];
  confidence: number;
  asset_version_id: string;
}

const RISK_COLORS: Record<string, string> = {
  low: 'bg-primary/10 text-primary',
  medium: 'bg-yellow-500/10 text-yellow-700',
  high: 'bg-destructive/10 text-destructive',
};

const RISK_LABELS: Record<string, Record<Lang, string>> = {
  low: { zh: '低风险', en: 'Low Risk' },
  medium: { zh: '中风险', en: 'Medium Risk' },
  high: { zh: '高风险', en: 'High Risk' },
};

const CONFIDENCE_LABELS: Record<Lang, (c: number) => string> = {
  zh: (c) => c >= 0.7 ? '高置信' : c >= 0.4 ? '中置信' : '低置信',
  en: (c) => c >= 0.7 ? 'High' : c >= 0.4 ? 'Medium' : 'Low',
};

/** Dispatch actions to AgentWorkstationPage via CustomEvent (avoids modifying CardDef interface) */
const dispatchAction = (type: string, payload: Record<string, unknown>) => {
  window.dispatchEvent(new CustomEvent('reply-copilot-action', { detail: { type, ...payload } }));
};

export const ReplyHintContent = memo(function ReplyHintContent({
  data,
  lang,
}: {
  data: unknown;
  lang: Lang;
}) {
  const d = data as ReplyHintData | null;

  if (!d) {
    return (
      <div className="flex flex-col items-center justify-center py-6 space-y-1.5 text-center select-none px-3">
        <span className="text-2xl opacity-30">💡</span>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {lang === 'zh' ? '等待用户消息，自动生成回复提示...' : 'Waiting for user message to generate reply hints...'}
        </p>
      </div>
    );
  }

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    dispatchAction('reply_feedback', { event: 'copy', assetVersionId: d.asset_version_id });
  };

  const handleInsert = (text: string) => {
    dispatchAction('insert_text', { text });
    dispatchAction('reply_feedback', { event: 'use', assetVersionId: d.asset_version_id });
  };

  const handleDismiss = () => {
    dispatchAction('reply_feedback', { event: 'dismiss', assetVersionId: d.asset_version_id });
  };

  return (
    <div className="p-3 space-y-3 text-xs">
      {/* Scene + Confidence + Risk */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="text-[10px] font-medium">{d.scene.label}</Badge>
        <Badge variant="secondary" className="text-[10px]">
          {CONFIDENCE_LABELS[lang](d.confidence)}
        </Badge>
        <Badge className={`text-[10px] ${RISK_COLORS[d.scene.risk] ?? RISK_COLORS.low}`}>
          {RISK_LABELS[d.scene.risk]?.[lang] ?? d.scene.risk}
        </Badge>
        {d.sources.length > 0 && (
          <span className="text-[10px] text-muted-foreground ml-auto truncate max-w-[200px]" title={d.sources.join(', ')}>
            {lang === 'zh' ? '来源' : 'Source'}: {d.sources[0]}
          </span>
        )}
      </div>

      {/* Required Slots */}
      {d.required_slots.length > 0 && (
        <div>
          <div className="text-[10px] text-muted-foreground mb-1">
            {lang === 'zh' ? '需先追问' : 'Ask first'}
          </div>
          <div className="flex flex-wrap gap-1">
            {d.required_slots.map(s => (
              <Badge key={s} variant="outline" className="text-[10px] bg-blue-50 dark:bg-blue-950">{s}</Badge>
            ))}
          </div>
        </div>
      )}

      {/* Recommended Terms */}
      {d.recommended_terms.length > 0 && (
        <div>
          <div className="text-[10px] text-muted-foreground mb-1">
            {lang === 'zh' ? '推荐术语' : 'Recommended Terms'}
          </div>
          <div className="flex flex-wrap gap-1">
            {d.recommended_terms.map(t => (
              <Badge key={t} variant="secondary" className="text-[10px] bg-primary/5">{t}</Badge>
            ))}
          </div>
        </div>
      )}

      {/* Forbidden Terms */}
      {d.forbidden_terms.length > 0 && (
        <div>
          <div className="text-[10px] text-muted-foreground mb-1">
            {lang === 'zh' ? '禁用术语' : 'Forbidden Terms'}
          </div>
          <div className="flex flex-wrap gap-1">
            {d.forbidden_terms.map(t => (
              <Badge key={t} variant="destructive" className="text-[10px]">{t}</Badge>
            ))}
          </div>
        </div>
      )}

      {/* Reply Options */}
      {d.reply_options.length > 0 && (
        <div>
          <div className="text-[10px] text-muted-foreground mb-1">
            {lang === 'zh' ? '推荐回复' : 'Recommended Replies'}
          </div>
          <div className="space-y-1.5">
            {d.reply_options.map(opt => (
              <div key={opt.label} className="bg-muted rounded-lg px-2.5 py-2 group">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] font-medium text-muted-foreground">{opt.label}</span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="xs" onClick={() => handleInsert(opt.text)} title={lang === 'zh' ? '带入输入框' : 'Insert'}>
                      <ArrowRightToLine size={10} />
                    </Button>
                    <Button variant="ghost" size="xs" onClick={() => handleCopy(opt.text)} title={lang === 'zh' ? '复制' : 'Copy'}>
                      <Copy size={10} />
                    </Button>
                  </div>
                </div>
                <p className="text-foreground leading-relaxed">{opt.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Next Actions */}
      {d.next_actions.length > 0 && (
        <div>
          <div className="text-[10px] text-muted-foreground mb-1">
            {lang === 'zh' ? '下一步动作' : 'Next Actions'}
          </div>
          <div className="flex flex-wrap gap-1">
            {d.next_actions.map(a => (
              <Badge key={a} variant="outline" className="text-[10px]">{a}</Badge>
            ))}
          </div>
        </div>
      )}

      {/* Dismiss button */}
      <div className="flex justify-end pt-1">
        <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={handleDismiss}>
          <XCircle size={10} /> {lang === 'zh' ? '不准/无帮助' : 'Not helpful'}
        </Button>
      </div>
    </div>
  );
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend/tests/unittest && npx vitest run agent/cards/ReplyHintContent.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/agent/cards/contents/ReplyHintContent.tsx frontend/tests/unittest/agent/cards/ReplyHintContent.test.tsx
git commit -m "feat: add ReplyHintContent card component for agent workstation"
```

---

### Task 9: Frontend — Register reply_hint card + workstation integration

**Files:**
- Modify: `frontend/src/agent/cards/index.ts`
- Modify: `frontend/src/agent/AgentWorkstationPage.tsx`

- [ ] **Step 1: Register the card in index.ts**

In `frontend/src/agent/cards/index.ts`, add the import:

```typescript
import { MessageSquareText } from 'lucide-react';
import { ReplyHintContent } from './contents/ReplyHintContent';
```

Then register the card **before** the diagram card (so it appears above the full-width diagram), as `colSpan: 2`:

```typescript
// -- 回复提示卡片 (col-span-2, full width) -----------------------------------
registerCard({
  id: 'reply_hint',
  title: { zh: '回复提示', en: 'Reply Hints' },
  Icon: MessageSquareText,
  headerClass: 'bg-gradient-to-r from-indigo-600 to-blue-500',
  colSpan: 2,
  defaultOpen: true,
  defaultCollapsed: false,
  wsEvents: ['reply_hints'],
  dataExtractor: (msg) => msg.data,
  component: ReplyHintContent,
});
```

- [ ] **Step 2: Handle reply_hints event in AgentWorkstationPage.tsx**

In `frontend/src/agent/AgentWorkstationPage.tsx`, the existing `ws.onmessage` handler already routes events to cards via `findCardByEvent()`. The `reply_hints` event will be automatically picked up by the registered card.

However, we need to add the "insert text to input" capability and feedback recording. The card uses `CustomEvent` dispatches (defined in Task 8), so the workstation just needs to listen.

In `AgentWorkstationPage.tsx`, add a `useEffect` to listen for `reply-copilot-action` events. The state variable for the agent input is `inputValue` / `setInputValue` (line 45):

```typescript
useEffect(() => {
  const handler = (e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (detail?.type === 'insert_text') {
      setInputValue(prev => prev + detail.text);
    }
    if (detail?.type === 'reply_feedback') {
      fetch('/api/km/reply-copilot/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: userPhone,
          asset_version_id: detail.assetVersionId,
          event_type: detail.event,
        }),
      }).catch(() => {});
    }
  };
  window.addEventListener('reply-copilot-action', handler);
  return () => window.removeEventListener('reply-copilot-action', handler);
}, [userPhone]);

- [ ] **Step 3: Also reset reply_hint card on new_session**

In `AgentWorkstationPage.tsx`, find the `new_session` handler that resets cards. Ensure `reply_hint` is reset (it should be by default unless exempted like `user_detail`). Verify the exemption list does NOT include `reply_hint`.

- [ ] **Step 4: Test manually**

Start the full app with `./start.sh`, open the agent workstation, trigger a human-agent handoff, then send a customer message. The reply hint card should appear.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/agent/cards/index.ts frontend/src/agent/cards/contents/ReplyHintContent.tsx frontend/src/agent/AgentWorkstationPage.tsx
git commit -m "feat: register reply_hint card and integrate with agent workstation"
```

---

### Task 10: Frontend — Structured hint editor in CandidateDetailPage

**Files:**
- Modify: `frontend/src/km/CandidateDetailPage.tsx`
- Modify: `frontend/src/km/api.ts`

- [ ] **Step 1: Add new fields to KMCandidate type in api.ts**

In `frontend/src/km/api.ts`, extend the `KMCandidate` interface:

```typescript
export interface KMCandidate {
  id: string; source_type: string; source_ref_id: string | null;
  normalized_q: string; draft_answer: string | null; category: string | null;
  risk_level: string; gate_evidence: string; gate_conflict: string; gate_ownership: string;
  target_asset_id: string | null; status: string; review_pkg_id: string | null;
  created_by: string | null; created_at: string; updated_at: string;
  scene_code: string | null;              // ← ADD
  retrieval_tags_json: string | null;     // ← ADD
  structured_json: string | null;         // ← ADD
}
```

- [ ] **Step 2: Add structured hint editor section to CandidateDetailPage**

In `frontend/src/km/CandidateDetailPage.tsx`, add these imports (existing imports already include `useState`, `Button`, `Card*`, `Input`):

```typescript
import { Save } from 'lucide-react';  // add to existing lucide import line
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
```

After the gate check card grid (line ~115), add the structured hint editor as a new Card:

```tsx
{/* 结构化提示配置 */}
<StructuredHintEditor candidateId={id} initialData={data} onSaved={load} />
```

Then implement `StructuredHintEditor` as a local component at the bottom of the file:

```tsx
function StructuredHintEditor({ candidateId, initialData, onSaved }: {
  candidateId: string;
  initialData: KMCandidateDetail;
  onSaved: () => void;
}) {
  const existing = initialData.structured_json ? JSON.parse(initialData.structured_json) : null;

  const [sceneCode, setSceneCode] = useState(initialData.scene_code ?? '');
  const [tags, setTags] = useState(initialData.retrieval_tags_json ? JSON.parse(initialData.retrieval_tags_json).join(', ') : '');
  const [requiredSlots, setRequiredSlots] = useState(existing?.required_slots?.join(', ') ?? '');
  const [recommendedTerms, setRecommendedTerms] = useState(existing?.recommended_terms?.join(', ') ?? '');
  const [forbiddenTerms, setForbiddenTerms] = useState(existing?.forbidden_terms?.join(', ') ?? '');
  const [nextActions, setNextActions] = useState(existing?.next_actions?.join(', ') ?? '');
  const [sources, setSources] = useState(existing?.sources?.join(', ') ?? '');
  const [riskLevel, setRiskLevel] = useState(existing?.scene?.risk ?? 'low');
  const [replyStandard, setReplyStandard] = useState(existing?.reply_options?.find((o: { label: string }) => o.label === '标准版')?.text ?? '');
  const [replySoothe, setReplySoothe] = useState(existing?.reply_options?.find((o: { label: string }) => o.label === '安抚版')?.text ?? '');
  const [saving, setSaving] = useState(false);

  const splitComma = (s: string) => s.split(/[,，]/).map(t => t.trim()).filter(Boolean);

  const handleSave = async () => {
    setSaving(true);
    try {
      const structured = {
        scene: { code: sceneCode, label: sceneCode.replace(/_/g, ' '), risk: riskLevel },
        required_slots: splitComma(requiredSlots),
        recommended_terms: splitComma(recommendedTerms),
        forbidden_terms: splitComma(forbiddenTerms),
        reply_options: [
          ...(replyStandard ? [{ label: '标准版', text: replyStandard }] : []),
          ...(replySoothe ? [{ label: '安抚版', text: replySoothe }] : []),
        ],
        next_actions: splitComma(nextActions),
        sources: splitComma(sources),
      };
      await kmApi.updateCandidate(candidateId, {
        scene_code: sceneCode,
        retrieval_tags_json: JSON.stringify(splitComma(tags)),
        structured_json: JSON.stringify(structured),
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="mb-3">
      <CardHeader className="py-2 px-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs">结构化提示配置</CardTitle>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save size={12} /> {saving ? '保存中...' : '保存'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">场景编码</label>
            <Input value={sceneCode} onChange={e => setSceneCode(e.target.value)} className="text-xs font-mono" placeholder="billing_abnormal" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">风险级别</label>
            <Select value={riskLevel} onValueChange={setRiskLevel}>
              <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">低</SelectItem>
                <SelectItem value="medium">中</SelectItem>
                <SelectItem value="high">高</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">检索标签（逗号分隔）</label>
            <Input value={tags} onChange={e => setTags(e.target.value)} className="text-xs" placeholder="计费, 扣费, 争议" />
          </div>
        </div>

        <div>
          <label className="text-[10px] text-muted-foreground mb-1 block">必追问槽位（逗号分隔）</label>
          <Input value={requiredSlots} onChange={e => setRequiredSlots(e.target.value)} className="text-xs" placeholder="手机号, 账期, 账单月份" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">推荐术语（逗号分隔）</label>
            <Input value={recommendedTerms} onChange={e => setRecommendedTerms(e.target.value)} className="text-xs" placeholder="以账单和详单为准, 为您核实" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">禁用术语（逗号分隔）</label>
            <Input value={forbiddenTerms} onChange={e => setForbiddenTerms(e.target.value)} className="text-xs" placeholder="系统出错了, 肯定是误扣" />
          </div>
        </div>

        <div>
          <label className="text-[10px] text-muted-foreground mb-1 block">推荐回复 — 标准版</label>
          <Textarea value={replyStandard} onChange={e => setReplyStandard(e.target.value)} className="text-xs min-h-[60px]" placeholder="承接情绪 + 结论 + 原因 + 下一步 + 时效" />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground mb-1 block">推荐回复 — 安抚版</label>
          <Textarea value={replySoothe} onChange={e => setReplySoothe(e.target.value)} className="text-xs min-h-[60px]" placeholder="安抚 + 核实 + 下一步" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">下一步动作（逗号分隔）</label>
            <Input value={nextActions} onChange={e => setNextActions(e.target.value)} className="text-xs" placeholder="查充值流水, 发起异常工单" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">证据来源（逗号分隔）</label>
            <Input value={sources} onChange={e => setSources(e.target.value)} className="text-xs" placeholder="计费规则第5章, 停复机规则" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Run frontend unit tests**

Run: `cd frontend/tests/unittest && npx vitest run`
Expected: PASS (no regressions)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/km/CandidateDetailPage.tsx frontend/src/km/api.ts
git commit -m "feat(km): add structured hint editor to candidate detail page"
```

---

### Task 11: Seed data — 5 MVP scene knowledge assets

**Files:**
- Create: `backend/src/db/seed-reply-copilot.ts` (standalone seed script)

- [ ] **Step 1: Create seed script**

Create `backend/src/db/seed-reply-copilot.ts`:

```typescript
/**
 * seed-reply-copilot.ts — Seed 5 MVP structured knowledge assets for Reply Copilot
 *
 * Run: cd backend && bun run src/db/seed-reply-copilot.ts
 */
import { db } from '.';
import { kmCandidates, kmAssets, kmAssetVersions, kmReviewPackages, kmActionDrafts } from './schema';
import { nanoid } from '../agent/km/kms/helpers';

const SCENES = [
  {
    q: '套餐升级后为什么没生效？',
    a: '套餐变更通常在下一个计费周期生效，即次月1日零点。如果是立即生效型套餐，请核实办理渠道和确认短信。',
    scene: { code: 'plan_change_not_effective', label: '套餐生效异常', risk: 'medium' },
    required_slots: ['手机号', '办理时间', '办理渠道', '是否收到确认短信'],
    recommended_terms: ['以系统记录为准', '下个计费周期生效', '为您核实办理状态'],
    forbidden_terms: ['系统出错了', '肯定已经生效', '你自己操作有问题'],
    reply_options: [
      { label: '标准版', text: '已为您查询到套餐变更记录，根据规则该变更将在下一个计费周期（次月1日）生效。如需确认具体生效时间，请提供办理时间和渠道，我为您进一步核实。' },
      { label: '安抚版', text: '理解您对套餐变更的关注，这边先帮您核实一下办理记录和生效规则，尽快给您一个明确的答复。' },
    ],
    next_actions: ['查询套餐变更记录', '确认生效规则', '必要时发起人工复核工单'],
    sources: ['套餐变更生效规则 v2026.02'],
    tags: ['套餐', '生效', '升级', '降档', '变更'],
  },
  {
    q: '流量用得很快，是不是乱扣费了？',
    a: '请先确认是否有大流量应用在后台运行。可以查询详单核实流量去向。如确有异常，将为您发起争议核查。',
    scene: { code: 'billing_traffic_dispute', label: '流量/扣费争议', risk: 'medium' },
    required_slots: ['手机号', '异常月份', '是否开启了移动数据'],
    recommended_terms: ['以账单和详单为准', '为您核实流量明细', '按规则处理'],
    forbidden_terms: ['肯定是您自己用了', '不可能扣错', '系统不会出错'],
    reply_options: [
      { label: '标准版', text: '已为您查询到本月流量使用明细，以详单数据为准。如果您对某些流量记录有疑问，可以指定时段，我为您进一步核实。' },
      { label: '安抚版', text: '理解您对扣费的担忧，这边先帮您调取详细的流量使用记录，逐项核实是否存在异常扣费情况。' },
    ],
    next_actions: ['查询流量详单', '核实套外流量扣费', '必要时发起争议工单'],
    sources: ['计费规则与争议处理规范 第5章'],
    tags: ['流量', '扣费', '争议', '详单', '异常'],
  },
  {
    q: '充值后为什么还是停机？',
    a: '充值到账后系统需要一定时间处理复机，通常几分钟到半小时。如超时未恢复，需核查充值流水和复机状态。',
    scene: { code: 'recharge_no_restore', label: '充值未复机', risk: 'medium' },
    required_slots: ['手机号', '充值时间', '充值渠道', '当前停机提示'],
    recommended_terms: ['到账状态核查中', '复机存在处理时延', '以系统恢复结果为准'],
    forbidden_terms: ['充值失败了吧', '马上恢复', '系统故障'],
    reply_options: [
      { label: '标准版', text: '这边先帮您核实充值到账和复机状态。为尽快确认处理进度，麻烦提供一下手机号和充值时间。' },
      { label: '安抚版', text: '理解您现在无法通话会比较着急，这边先马上帮您查一下充值和复机状态，尽快帮您解决。' },
    ],
    next_actions: ['查充值流水', '查停复机状态', '超时则发起复机异常工单'],
    sources: ['停复机规则 v2026.03', '充值到账时效规范'],
    tags: ['充值', '停机', '复机', '到账', '缴费'],
  },
  {
    q: '宽带断网了怎么办？',
    a: '请先检查光猫指示灯状态。如果是区域性故障，会有修复时间预估。如果是个别故障，可以远程重启或安排上门维修。',
    scene: { code: 'broadband_outage', label: '宽带断网', risk: 'low' },
    required_slots: ['宽带账号或手机号', '断网时间', '光猫指示灯状态', '是否多台设备均无法上网'],
    recommended_terms: ['先帮您排查', '如需上门维修将为您预约', '预计恢复时间'],
    forbidden_terms: ['肯定是你路由器的问题', '我们这边没问题', '不归我们管'],
    reply_options: [
      { label: '标准版', text: '了解到您的宽带无法上网，先帮您排查一下。请问光猫的指示灯是什么状态？是否所有设备都无法连接？' },
      { label: '安抚版', text: '理解断网给您带来了不便，这边先帮您查一下是否有区域性故障，同时也排查一下您的线路状态。' },
    ],
    next_actions: ['查询区域告警', '远程重启光猫', '必要时预约上门维修'],
    sources: ['宽带故障处理规范', '装维工单流程'],
    tags: ['宽带', '断网', '光猫', '网速', '故障'],
  },
  {
    q: '我要投诉，态度太差了要赔偿',
    a: '非常抱歉给您带来了不好的体验。会认真记录您的反馈，按投诉处理流程进行核查和回复。',
    scene: { code: 'complaint_compensation', label: '投诉赔付争议', risk: 'high' },
    required_slots: ['手机号', '投诉事由', '涉及的服务人员或时间', '期望的处理结果'],
    recommended_terms: ['为您升级核查', '认真对待您的反馈', '按规则处理', '预计时效'],
    forbidden_terms: ['不可能赔', '这个不归我们管', '你自己的问题', '保证今天解决'],
    reply_options: [
      { label: '标准版', text: '非常抱歉给您带来了不好的体验。已认真记录您的反馈，将按投诉处理流程为您升级核查，预计会在24小时内给您回复处理结果。' },
      { label: '安抚版', text: '非常理解您的心情，对于您反映的问题我们非常重视。这边会立即为您升级处理，指定专人跟进，尽快给您一个满意的答复。' },
    ],
    next_actions: ['创建投诉工单', '转二线主管审核', '48小时内回访'],
    sources: ['投诉处理规范 v2026.01', '赔付审批流程'],
    tags: ['投诉', '赔偿', '态度', '补偿', '减免', '升级'],
  },
];

async function seed() {
  console.log('Seeding Reply Copilot knowledge assets...');
  const now = new Date().toISOString();
  const pkgId = nanoid();

  // Create review package
  const candidateIds: string[] = [];

  for (const s of SCENES) {
    const candId = nanoid();
    const assetId = nanoid();
    const versionId = nanoid();
    candidateIds.push(candId);

    const structured = JSON.stringify({
      scene: s.scene,
      required_slots: s.required_slots,
      recommended_terms: s.recommended_terms,
      forbidden_terms: s.forbidden_terms,
      reply_options: s.reply_options,
      next_actions: s.next_actions,
      sources: s.sources,
      retrieval_tags: s.tags,
    });

    // Insert candidate (published)
    await db.insert(kmCandidates).values({
      id: candId, source_type: 'manual', normalized_q: s.q, draft_answer: s.a,
      category: s.scene.label, risk_level: s.scene.risk, scene_code: s.scene.code,
      retrieval_tags_json: JSON.stringify(s.tags), structured_json: structured,
      gate_evidence: 'pass', gate_conflict: 'pass', gate_ownership: 'pass',
      status: 'published', review_pkg_id: pkgId, created_by: 'seed',
      created_at: now, updated_at: now,
    });

    // Insert asset + version
    await db.insert(kmAssets).values({
      id: assetId, title: s.q, asset_type: 'qa', status: 'online',
      current_version: 1, owner: 'seed', created_at: now, updated_at: now,
    });
    await db.insert(kmAssetVersions).values({
      id: versionId, asset_id: assetId, version_no: 1,
      content_snapshot: JSON.stringify({ q: s.q, a: s.a }),
      structured_snapshot_json: structured,
      effective_from: now, created_at: now,
    });

    console.log(`  ✓ ${s.scene.label} (${s.scene.code})`);
  }

  // Create review package (already published)
  await db.insert(kmReviewPackages).values({
    id: pkgId, title: 'Reply Copilot MVP - 5场景',
    status: 'published', risk_level: 'medium',
    candidate_ids_json: JSON.stringify(candidateIds),
    created_by: 'seed', created_at: now, updated_at: now,
  });

  console.log(`✅ Seeded ${SCENES.length} Reply Copilot assets`);
}

seed().catch(console.error);
```

- [ ] **Step 2: Run the seed script**

Run: `cd backend && bun run src/db/seed-reply-copilot.ts`
Expected: 5 assets seeded successfully.

- [ ] **Step 3: Verify with existing reply-copilot test**

Run: `cd backend && bun test tests/unittest/reply-copilot.test.ts`
Expected: PASS (now with real seed data, the keyword matching should also work)

- [ ] **Step 4: Commit**

```bash
git add backend/src/db/seed-reply-copilot.ts
git commit -m "feat: seed 5 MVP scene knowledge assets for Reply Copilot"
```

---

## Post-Implementation Verification

After all tasks are complete:

1. **Backend tests:** `cd backend && bun test tests/unittest/reply-copilot*.test.ts` — all PASS
2. **Frontend tests:** `cd frontend/tests/unittest && npx vitest run` — no regressions
3. **Manual E2E flow:**
   - Start services: `./start.sh --reset`
   - Open customer chat, trigger transfer to human
   - Send "充值了100还是停机" from customer
   - Verify: agent workstation shows Reply Hint card with scene "充值未复机", required slots, terms, reply options
   - Click "带入输入框" → text appears in agent input
   - Verify: feedback recorded in `km_reply_feedback` table
4. **KM backend:**
   - Open knowledge management → candidates → pick any seeded candidate
   - Verify: structured hint editor shows pre-filled data
   - Edit and save → verify `structured_json` updated
