// backend/src/services/query-normalizer/rewrite-builder.ts
import { type TimeResolveResult, type LexiconMatchResult } from './types';

export function buildRewrite(time: TimeResolveResult, lexicon: LexiconMatchResult): string {
  const actions = lexicon.matches
    .filter(m => m.entry.slot_field === 'action_type')
    .map(m => m.entry.label);
  const objects = lexicon.matches
    .filter(m => ['service_category', 'service_subtype', 'issue_type', 'network_issue_type'].includes(m.entry.slot_field))
    .map(m => m.entry.label);

  if (actions.length > 0 || objects.length > 0) {
    const timeStr = time.matches.length > 0
      ? time.matches
          .map(m => m.slot.kind === 'billing_period' ? m.slot.value : m.slot.value)
          .map(v => v.replace(/~/, '至'))
          .join('、') + ' '
      : '';
    const objStr = objects.length > 0 ? objects.join('、') : '';
    const actStr = actions.length > 0 ? actions.join('、') : '';

    const parts = [timeStr, objStr, actStr].filter(Boolean);
    if (parts.length > 0) return parts.join('');
  }

  return time.normalized_text;
}
