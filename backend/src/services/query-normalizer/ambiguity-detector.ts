// backend/src/services/query-normalizer/ambiguity-detector.ts
import { type Ambiguity, type AmbiguityRule, type LexiconMatch, type TimeResolveResult } from './types';

const AMBIGUITY_RULES: AmbiguityRule[] = [
  {
    trigger: { type: 'term_present', term: 'suspend_service' },
    ambiguity: { field: 'account_state', candidates: ['arrears_suspended', 'voluntary_suspended', 'network_issue'] },
  },
  {
    trigger: { type: 'term_present', term: 'account_locked' },
    ambiguity: { field: 'account_state', candidates: ['account_locked', 'device_risk_control'] },
  },
  {
    trigger: { type: 'terms_absent', required_term: 'cancel_service', absent_field: 'service_subtype' },
    ambiguity: { field: 'service_subtype', candidates: ['value_added_service', 'data_add_on', 'plan'] },
  },
  {
    trigger: { type: 'term_present', term: 'data_service_issue' },
    ambiguity: { field: 'network_issue_type', candidates: ['data_service_issue', 'arrears_suspended', 'area_outage'] },
  },
  {
    trigger: { type: 'term_present', term: 'billing_amount' },
    ambiguity: { field: 'issue_type', candidates: ['total_bill', 'plan_monthly_fee', 'overage_charge'] },
  },
];

export function detectAmbiguities(
  lexiconMatches: LexiconMatch[],
  timeResult: TimeResolveResult,
): Ambiguity[] {
  const matchedTerms = new Set(lexiconMatches.map(m => m.entry.term));
  const matchedFields = new Set(lexiconMatches.map(m => m.entry.slot_field));
  const ambiguities: Ambiguity[] = [];

  for (const rule of AMBIGUITY_RULES) {
    const trigger = rule.trigger;
    let triggered = false;
    let originalText = '';

    if (trigger.type === 'term_present') {
      if (matchedTerms.has(trigger.term)) {
        triggered = true;
        const match = lexiconMatches.find(m => m.entry.term === trigger.term);
        originalText = match?.matched_text ?? trigger.term;
      }
    } else if (trigger.type === 'terms_absent') {
      if (matchedTerms.has(trigger.required_term) && !matchedFields.has(trigger.absent_field)) {
        triggered = true;
        const match = lexiconMatches.find(m => m.entry.term === trigger.required_term);
        originalText = match?.matched_text ?? trigger.required_term;
      }
    }

    if (triggered) {
      ambiguities.push({ ...rule.ambiguity, original_text: originalText });
    }
  }

  ambiguities.push(...timeResult.ambiguities);
  return ambiguities;
}
