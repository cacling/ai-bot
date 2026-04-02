/**
 * rule-evaluator.ts — Route rule matching engine.
 *
 * Evaluates ix_route_rules against an InteractionSnapshot.
 * Rules are evaluated in priority_order (ascending). First match wins.
 * Grayscale: deterministic hash of interaction_id % 100 < grayscale_pct.
 */
import { db, ixRouteRules, eq, and } from '../db';
import { type InteractionSnapshot } from './plugin-runtime';

export interface RuleMatchResult {
  matched: boolean;
  rule_id?: string;
  rule_name?: string;
  queue_code?: string;
  action_overrides?: {
    set_priority?: number;
    set_routing_mode?: string;
    metadata?: Record<string, unknown>;
  };
}

interface RuleCondition {
  work_model?: string | string[];
  channel?: string | string[];
  priority_range?: [number, number]; // [min, max] inclusive
  provider?: string | string[];
  customer_tags?: string[];
}

/** Simple deterministic hash for grayscale decisions */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function matchesCondition(cond: RuleCondition, snapshot: InteractionSnapshot): boolean {
  if (cond.work_model) {
    const allowed = Array.isArray(cond.work_model) ? cond.work_model : [cond.work_model];
    if (!allowed.includes(snapshot.work_model)) return false;
  }

  if (cond.channel) {
    const allowed = Array.isArray(cond.channel) ? cond.channel : [cond.channel];
    if (!snapshot.channel || !allowed.includes(snapshot.channel)) return false;
  }

  if (cond.priority_range) {
    const [min, max] = cond.priority_range;
    if (snapshot.priority < min || snapshot.priority > max) return false;
  }

  if (cond.provider) {
    const allowed = Array.isArray(cond.provider) ? cond.provider : [cond.provider];
    // provider is not directly on InteractionSnapshot, skip if not available
    // Future: extend snapshot to include provider
    void allowed;
  }

  return true;
}

/**
 * Evaluate all enabled route rules against the interaction snapshot.
 * Returns the first matching rule, or { matched: false } if none match.
 */
export async function evaluateRules(snapshot: InteractionSnapshot): Promise<RuleMatchResult> {
  const now = new Date();

  const rules = await db.select().from(ixRouteRules)
    .where(and(
      eq(ixRouteRules.tenant_id, snapshot.tenant_id),
      eq(ixRouteRules.enabled, true),
    ))
    .orderBy(ixRouteRules.priority_order)
    .all();

  for (const rule of rules) {
    // Check effective time window
    if (rule.effective_from && rule.effective_from > now) continue;
    if (rule.effective_to && rule.effective_to < now) continue;

    // Parse condition
    const condition: RuleCondition = rule.condition_json ? JSON.parse(rule.condition_json) : {};

    // default_fallback rules always match (catch-all)
    if (rule.rule_type !== 'default_fallback') {
      if (!matchesCondition(condition, snapshot)) continue;
    }

    // Grayscale check
    if (rule.grayscale_pct < 100) {
      const bucket = simpleHash(snapshot.interaction_id) % 100;
      if (bucket >= rule.grayscale_pct) continue;
    }

    // Match found
    const action = rule.action_json ? JSON.parse(rule.action_json) : {};
    return {
      matched: true,
      rule_id: rule.rule_id,
      rule_name: rule.rule_name,
      queue_code: rule.queue_code,
      action_overrides: {
        set_priority: action.set_priority,
        set_routing_mode: action.set_routing_mode,
        metadata: action.metadata,
      },
    };
  }

  return { matched: false };
}
