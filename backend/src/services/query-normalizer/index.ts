// backend/src/services/query-normalizer/index.ts
import { type NormalizedQuery, type NormalizedSlots, type NormalizeContext } from './types';
import { preprocess } from './preprocess';
import { resolveTime } from './time-resolver';
import { matchLexicon, loadLexicons as loadLexiconsInternal } from './telecom-lexicon';
import { evaluateCoverage } from './coverage';
import { detectAmbiguities } from './ambiguity-detector';
import { llmFallback } from './llm-fallback';
import { buildRewrite } from './rewrite-builder';
import { logger } from '../logger';

export { loadLexiconsInternal as loadLexicons };
export { formatNormalizedContext } from './format';
export { type NormalizedQuery } from './types';

function dedup(arr: string[]): string[] {
  return [...new Set(arr)];
}

function dedupAmbiguities(arr: { field: string; candidates: string[]; original_text: string }[]) {
  const seen = new Set<string>();
  return arr.filter(a => {
    const key = a.field;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function normalizeQuery(
  userMessage: string,
  context: NormalizeContext = {},
): Promise<NormalizedQuery> {
  const start = Date.now();
  const now = context.currentDate ?? new Date();

  // Handle empty input
  if (!userMessage || userMessage.trim().length === 0) {
    return {
      original_query: userMessage ?? '',
      rewritten_query: '',
      intent_hints: [],
      normalized_slots: {},
      ambiguities: [],
      confidence: 0,
      source: 'rules',
      latency_ms: Date.now() - start,
    };
  }

  // Stage 1: Preprocess
  const { cleaned, identifiers } = preprocess(userMessage);

  // Stage 2: Time normalization
  const timeResult = resolveTime(cleaned, now);

  // Stage 3: Lexicon matching
  const lexiconResult = matchLexicon(timeResult.normalized_text);

  // Stage 4: Coverage + ambiguity
  const coverage = evaluateCoverage(userMessage, timeResult.matches, lexiconResult.matches, identifiers);
  const ambiguities = detectAmbiguities(lexiconResult.matches, timeResult);

  // Stage 5: LLM fallback (only if low confidence)
  let llmResult: Awaited<ReturnType<typeof llmFallback>> = null;
  if (coverage.should_fallback_llm) {
    const partialSlots: Partial<NormalizedSlots> = {
      ...lexiconResult.slots,
    };
    if (timeResult.matches.length > 0) {
      partialSlots.time = timeResult.matches[0].slot;
    }
    if (identifiers.find(id => id.type === 'msisdn')) {
      partialSlots.msisdn = identifiers.find(id => id.type === 'msisdn')!.value;
    }
    llmResult = await llmFallback(userMessage, partialSlots);
  }

  // Stage 6: Assemble output
  const normalizedSlots: NormalizedSlots = {
    ...lexiconResult.slots,
  };

  // Time slot
  if (timeResult.matches.length > 0) {
    normalizedSlots.time = timeResult.matches[0].slot;
  }

  // Identifiers
  const msisdn = identifiers.find(id => id.type === 'msisdn');
  if (msisdn) normalizedSlots.msisdn = msisdn.value;

  // Merge LLM additional slots
  if (llmResult?.additional_slots) {
    for (const [key, value] of Object.entries(llmResult.additional_slots)) {
      if (value && !(normalizedSlots as Record<string, unknown>)[key]) {
        (normalizedSlots as Record<string, string>)[key] = value;
      }
    }
  }

  const result: NormalizedQuery = {
    original_query: userMessage,
    rewritten_query: llmResult?.rewritten_query ?? buildRewrite(timeResult, lexiconResult),
    intent_hints: dedup([
      ...lexiconResult.intent_hints,
      ...(llmResult?.intent_hints ?? []),
    ]),
    normalized_slots: normalizedSlots,
    ambiguities: dedupAmbiguities([
      ...ambiguities,
      ...(llmResult?.ambiguities?.map(a => ({ ...a, original_text: '' })) ?? []),
    ]),
    confidence: coverage.confidence,
    source: llmResult ? 'rules+llm' : 'rules',
    latency_ms: Date.now() - start,
  };

  logger.info('query-normalizer', 'normalized', {
    original: userMessage,
    rewritten: result.rewritten_query,
    confidence: result.confidence,
    source: result.source,
    intent_hints: result.intent_hints,
    latency_ms: result.latency_ms,
    has_ambiguities: result.ambiguities.length > 0,
  });

  return result;
}
