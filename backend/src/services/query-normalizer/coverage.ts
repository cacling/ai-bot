// backend/src/services/query-normalizer/coverage.ts
import { type CoverageResult, type Span, type TimeMatch, type LexiconMatch, type IdentifierMatch } from './types';

const STOP_WORDS = [
  '的', '了', '吗', '呢', '啊', '吧', '嘛', '哦', '哈', '嗯',
  '帮我', '帮忙', '麻烦', '请', '请问', '你好',
  '查下', '查一下', '看下', '看看', '看一下',
  '一下', '一个', '那个', '这个', '什么',
  '是不是', '能不能', '有没有', '怎么', '为什么',
  '我', '我的', '你', '你们', '他', '她',
  '还', '也', '就', '都', '又', '和', '跟', '给',
];

const SORTED_STOPS = [...STOP_WORDS].sort((a, b) => b.length - a.length);

function removeStopWords(text: string): string {
  let result = text;
  for (const sw of SORTED_STOPS) {
    result = result.split(sw).join('');
  }
  return result.replace(/\s+/g, '').trim();
}

/**
 * Resolve lexicon match spans against the original string.
 * Lexicon matching runs on time-normalized text (where time expressions are
 * replaced with canonical forms that may differ in length), so stored start/end
 * positions can be misaligned with the original. We re-anchor each match by
 * searching for its pattern text directly in the original string.
 */
function resolveSpansInOriginal(
  original: string,
  timeMatches: TimeMatch[],
  lexiconMatches: LexiconMatch[],
  identifiers: IdentifierMatch[],
): Span[] {
  const spans: Span[] = [];

  // Time and identifier positions are always from the original string.
  for (const m of timeMatches) {
    spans.push({ start: m.start, end: m.end, source: 'time' });
  }
  for (const m of identifiers) {
    spans.push({ start: m.start, end: m.end, source: 'identifier' });
  }

  // Lexicon positions may be from normalized text; search in original instead.
  for (const m of lexiconMatches) {
    const idx = original.indexOf(m.matched_text);
    if (idx !== -1) {
      spans.push({ start: idx, end: idx + m.matched_text.length, source: 'lexicon' });
    }
  }

  return spans;
}

export function evaluateCoverage(
  original: string,
  timeMatches: TimeMatch[],
  lexiconMatches: LexiconMatch[],
  identifiers: IdentifierMatch[],
): CoverageResult {
  if (!original || original.trim().length === 0) {
    return { confidence: 0, recognized_spans: [], unrecognized_text: '', should_fallback_llm: true };
  }

  const spans = resolveSpansInOriginal(original, timeMatches, lexiconMatches, identifiers);

  const chars = [...original];
  const recognized = new Set<number>();
  for (const span of spans) {
    for (let i = span.start; i < span.end && i < chars.length; i++) {
      recognized.add(i);
    }
  }

  const unrecognizedChars = chars.filter((_, i) => !recognized.has(i)).join('');
  const unrecognizedClean = removeStopWords(unrecognizedChars);

  const originalClean = removeStopWords(original);
  const denominator = originalClean.length;

  if (denominator === 0) {
    return { confidence: 1, recognized_spans: spans, unrecognized_text: '', should_fallback_llm: false };
  }

  const recognizedCleanLen = denominator - unrecognizedClean.length;
  const confidence = Math.max(0, Math.min(1, recognizedCleanLen / denominator));

  return {
    confidence,
    recognized_spans: spans,
    unrecognized_text: unrecognizedClean,
    should_fallback_llm: confidence < 0.7,
  };
}
