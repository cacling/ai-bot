/**
 * Core Least Loaded Scorer — default fallback candidate scorer.
 * Ranks agents by available slots (most available first).
 */
import type { CandidateScorerFn } from '../types';

export const handler: CandidateScorerFn = async (candidates) => {
  return candidates.map((c) => ({
    ...c,
    score: c.available_slots,
    reason: `available_slots=${c.available_slots}`,
  })).sort((a, b) => b.score - a.score);
};
