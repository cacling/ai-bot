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

    const scored: ScoredCandidate[] = withStructured.map(a => {
      const structured = JSON.parse(a.structuredSnapshot!);
      const expandedQuestions = Array.isArray(structured.expanded_questions)
        ? structured.expanded_questions.map(v => String(v).toLowerCase())
        : [];
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
        const contentVariants = Array.isArray(content.variants)
          ? content.variants.map((v: unknown) => String(v).toLowerCase())
          : [];
        score += bestOverlapScore(queryText, contentVariants.length > 0 ? contentVariants : expandedQuestions) * 3;
      } catch { /* ignore */ }

      // Match against retrieval tags
      const tags: string[] = structured.retrieval_tags ?? [];
      for (const tag of tags) {
        if (queryText.includes(tag.toLowerCase())) score += 2;
      }

      for (const variant of expandedQuestions) {
        if (queryText.includes(variant) || variant.includes(queryText)) {
          score += 2;
          break;
        }
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
    if (!top || top.score < 2) return null;

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

function bestOverlapScore(query: string, targets: string[]): number {
  let best = 0;
  for (const target of targets) {
    best = Math.max(best, overlapScore(query, target));
  }
  return best;
}

function bigrams(s: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) {
    set.add(s.slice(i, i + 2));
  }
  return set;
}

// ── searchKnowledgeAssets — top-k retrieval for evaluation & RAG ──────────────

export interface SearchResult {
  assetId: string;
  versionId: string;
  title: string;
  score: number;
  confidence: number;
  structured: Record<string, unknown>;
  contentSnapshot: string;
}

export async function searchKnowledgeAssets(params: {
  query: string;
  topK?: number;
}): Promise<SearchResult[]> {
  const { query, topK = 5 } = params;

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

  const withStructured = assets.filter(a => a.structuredSnapshot);
  if (withStructured.length === 0) return [];

  const queryText = query.toLowerCase();

  const scored = withStructured.map(a => {
    const structured = JSON.parse(a.structuredSnapshot!);
    const expandedQuestions = Array.isArray(structured.expanded_questions)
      ? structured.expanded_questions.map((v: unknown) => String(v).toLowerCase())
      : [];
    let score = 0;

    const label = (structured.scene?.label ?? '').toLowerCase();
    score += overlapScore(queryText, label) * 3;
    score += overlapScore(queryText, (a.title ?? '').toLowerCase()) * 2;

    try {
      const content = JSON.parse(a.contentSnapshot ?? '{}');
      score += overlapScore(queryText, (content.q ?? '').toLowerCase()) * 2;
      const contentVariants = Array.isArray(content.variants)
        ? content.variants.map((v: unknown) => String(v).toLowerCase())
        : [];
      score += bestOverlapScore(queryText, contentVariants.length > 0 ? contentVariants : expandedQuestions) * 3;
    } catch { /* ignore */ }

    const tags: string[] = structured.retrieval_tags ?? [];
    for (const tag of tags) {
      if (queryText.includes(tag.toLowerCase())) score += 2;
    }

    for (const variant of expandedQuestions) {
      if (queryText.includes(variant) || variant.includes(queryText)) {
        score += 2;
        break;
      }
    }

    const codeWords = (structured.scene?.code ?? '').split('_');
    for (const w of codeWords) {
      if (queryText.includes(w)) score += 1;
    }

    return {
      assetId: a.assetId,
      versionId: a.versionId,
      title: a.title ?? structured.scene?.label ?? '未知',
      score,
      confidence: Math.min(score / 10, 1),
      structured,
      contentSnapshot: a.contentSnapshot ?? '',
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.filter(s => s.score > 1).slice(0, topK);
}
