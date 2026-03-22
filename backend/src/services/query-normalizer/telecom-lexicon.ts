// backend/src/services/query-normalizer/telecom-lexicon.ts
import { readFileSync, readdirSync, watch } from 'fs';
import { resolve } from 'path';
import { type LexiconEntry, type LexiconMatch, type LexiconMatchResult, type NormalizedSlots } from './types';
import { logger } from '../../services/logger';

interface PatternIndex {
  pattern: string;
  entry: LexiconEntry;
}

let patternIndex: PatternIndex[] = [];

function rebuildIndex(dictDir: string) {
  const entries: LexiconEntry[] = [];
  try {
    for (const file of readdirSync(dictDir).filter(f => f.endsWith('.json'))) {
      const content = readFileSync(resolve(dictDir, file), 'utf-8');
      const parsed = JSON.parse(content) as LexiconEntry[];
      entries.push(...parsed);
    }
  } catch (err) {
    logger.error('query-normalizer', 'lexicon_load_error', { error: String(err) });
    return;
  }

  const index: PatternIndex[] = [];
  for (const entry of entries) {
    for (const pattern of entry.patterns) {
      index.push({ pattern, entry });
    }
  }
  index.sort((a, b) => {
    const lenDiff = b.pattern.length - a.pattern.length;
    if (lenDiff !== 0) return lenDiff;
    return (b.entry.priority ?? 0) - (a.entry.priority ?? 0);
  });

  patternIndex = index;
}

export function loadLexicons(dictDir: string) {
  rebuildIndex(dictDir);
  logger.info('query-normalizer', 'lexicon_loaded', { count: patternIndex.length });

  try {
    watch(dictDir, { recursive: true }, () => {
      rebuildIndex(dictDir);
      logger.info('query-normalizer', 'lexicon_reloaded', { count: patternIndex.length });
    });
  } catch { /* watch may not be supported */ }
}

export function matchLexicon(text: string): LexiconMatchResult {
  const matches: LexiconMatch[] = [];
  const occupied: [number, number][] = [];

  for (const { pattern, entry } of patternIndex) {
    let searchFrom = 0;
    while (true) {
      const idx = text.indexOf(pattern, searchFrom);
      if (idx === -1) break;

      const start = idx;
      const end = idx + pattern.length;

      const hasOverlap = occupied.some(([s, e]) => start < e && end > s);
      if (!hasOverlap) {
        matches.push({ entry, matched_text: pattern, start, end });
        occupied.push([start, end]);
      }
      searchFrom = idx + 1;
    }
  }

  const intentSet = new Set<string>();
  for (const m of matches) {
    if (m.entry.intent_hint) intentSet.add(m.entry.intent_hint);
  }

  const slots: Partial<NormalizedSlots> = {};
  for (const m of matches) {
    const field = m.entry.slot_field as keyof NormalizedSlots;
    if (field && field !== 'time') {
      (slots as Record<string, string>)[field] = m.entry.term;
    }
  }

  return { matches, intent_hints: [...intentSet], slots };
}
