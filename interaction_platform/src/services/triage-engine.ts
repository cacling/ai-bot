/**
 * triage-engine.ts — Rule-based triage for public engagement items.
 *
 * Classifies engagement items and produces recommendations:
 *   - materialize    → create interaction → route to agent inbox
 *   - convert_private → create private conversation → materialize
 *   - moderate_only  → just record a moderation action (e.g., auto-reply)
 *   - ignore         → skip, no action needed
 *
 * Phase 4: Simple keyword/pattern rules. Future: LLM-assisted classification.
 */
import { db, ixTriageResults, ixEngagementItems, eq } from '../db';

// ── Types ──────────────────────────────────────────────────────────────────

export type Classification = 'complaint' | 'inquiry' | 'praise' | 'spam' | 'crisis' | 'general';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type Recommendation = 'materialize' | 'convert_private' | 'moderate_only' | 'ignore';

export interface TriageResult {
  triage_id: string;
  item_id: string;
  classification: Classification;
  risk_level: RiskLevel;
  recommendation: Recommendation;
  confidence: number;
  reason: string;
  matched_rules: string[];
}

// ── Rules ──────────────────────────────────────────────────────────────────

interface TriageRule {
  id: string;
  name: string;
  test: (body: string, sentiment?: string) => boolean;
  classification: Classification;
  risk_level: RiskLevel;
  recommendation: Recommendation;
  priority: number; // lower = higher priority
}

const RULES: TriageRule[] = [
  {
    id: 'crisis_keywords',
    name: 'Crisis keywords detection',
    test: (body) => /(?:投诉|曝光|315|消费者协会|律师|起诉|诈骗|骗子|法律|维权|工信部)/i.test(body),
    classification: 'crisis',
    risk_level: 'critical',
    recommendation: 'materialize',
    priority: 1,
  },
  {
    id: 'complaint_negative',
    name: 'Complaint with negative sentiment',
    test: (body, sentiment) =>
      sentiment === 'negative' && /(?:差评|垃圾|太差|恶心|坑人|不满|问题|故障|失望|退款|退订)/i.test(body),
    classification: 'complaint',
    risk_level: 'high',
    recommendation: 'materialize',
    priority: 2,
  },
  {
    id: 'inquiry_question',
    name: 'Customer inquiry',
    test: (body) => /(?:怎么|如何|请问|能不能|可以吗|什么时候|多少钱|在哪里|\?|？)/.test(body),
    classification: 'inquiry',
    risk_level: 'medium',
    recommendation: 'convert_private',
    priority: 3,
  },
  {
    id: 'praise_positive',
    name: 'Positive praise',
    test: (body, sentiment) =>
      sentiment === 'positive' || /(?:好评|赞|厉害|不错|优秀|满意|感谢|推荐|五星)/.test(body),
    classification: 'praise',
    risk_level: 'low',
    recommendation: 'moderate_only',
    priority: 4,
  },
  {
    id: 'spam_filter',
    name: 'Spam detection',
    test: (body) => /(?:广告|免费领|点击链接|加微信|扫码|限时|优惠券|http[s]?:\/\/)/.test(body),
    classification: 'spam',
    risk_level: 'low',
    recommendation: 'ignore',
    priority: 5,
  },
];

// ── Engine ─────────────────────────────────────────────────────────────────

/**
 * Run triage on an engagement item.
 * Returns a TriageResult with classification, risk level, and recommendation.
 */
export async function triageItem(itemId: string): Promise<TriageResult> {
  const item = await db.query.ixEngagementItems.findFirst({
    where: eq(ixEngagementItems.item_id, itemId),
  });
  if (!item) throw new Error(`Engagement item not found: ${itemId}`);

  const body = item.body ?? '';
  const sentiment = item.sentiment ?? undefined;

  // Run rules in priority order
  const matchedRules: TriageRule[] = [];
  for (const rule of RULES.sort((a, b) => a.priority - b.priority)) {
    if (rule.test(body, sentiment)) {
      matchedRules.push(rule);
    }
  }

  // Use the highest-priority matched rule, or default to 'general'
  const winner = matchedRules[0];
  const triageId = crypto.randomUUID();

  const result: TriageResult = {
    triage_id: triageId,
    item_id: itemId,
    classification: winner?.classification ?? 'general',
    risk_level: winner?.risk_level ?? 'low',
    recommendation: winner?.recommendation ?? 'ignore',
    confidence: winner ? 0.85 : 0.5,
    reason: winner ? `Matched rule: ${winner.name}` : 'No rule matched, defaulting to ignore',
    matched_rules: matchedRules.map((r) => r.id),
  };

  // Persist triage result
  await db.insert(ixTriageResults).values({
    triage_id: result.triage_id,
    item_id: result.item_id,
    classification: result.classification,
    risk_level: result.risk_level,
    recommendation: result.recommendation,
    confidence: result.confidence,
    reason: result.reason,
    matched_rules_json: JSON.stringify(result.matched_rules),
  });

  // Update engagement item status
  await db.update(ixEngagementItems)
    .set({ status: 'triaged' })
    .where(eq(ixEngagementItems.item_id, itemId));

  return result;
}
