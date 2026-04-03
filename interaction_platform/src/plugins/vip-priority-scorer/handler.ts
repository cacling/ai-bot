/**
 * VIP Priority Scorer — Enhanced candidate scoring plugin.
 *
 * Scoring formula:
 *   score = available_slots
 *         + (isVip ? vip_boost : 0)
 *         + wait_seconds_weight × min(wait_seconds, max_wait_cap)
 *         - load_penalty × active_session_count
 *         + (queue_match ? queue_match_bonus : 0)
 */
import type { CandidateScorerFn } from '../types';

export const handler: CandidateScorerFn = async (candidates, interaction, config) => {
  const vipBoost = (config.vip_boost as number) ?? 20;
  const vipThreshold = (config.vip_threshold as number) ?? 20;
  const waitWeight = (config.wait_seconds_weight as number) ?? 0.08;
  const waitCap = (config.max_wait_cap as number) ?? 300;
  const loadPenalty = (config.load_penalty as number) ?? 5;
  const queueMatchBonus = (config.queue_match_bonus as number) ?? 0;

  const isVip = interaction.priority <= vipThreshold;
  const waitSeconds = Math.min(interaction.wait_seconds ?? 0, waitCap);
  const queueCode = interaction.queue_code;

  return candidates.map((c) => {
    const activeCount = c.active_chat_count + c.active_voice_count;
    const queueMatch = queueMatchBonus > 0 && queueCode && c.queue_codes?.includes(queueCode);

    const score = c.available_slots
      + (isVip ? vipBoost : 0)
      + waitWeight * waitSeconds
      - loadPenalty * activeCount
      + (queueMatch ? queueMatchBonus : 0);

    const parts = [`base=${c.available_slots}`];
    if (isVip) parts.push(`vip_boost=+${vipBoost}`);
    if (waitSeconds > 0) parts.push(`wait_bonus=+${(waitWeight * waitSeconds).toFixed(1)}(${waitSeconds}s)`);
    if (activeCount > 0) parts.push(`load_penalty=-${loadPenalty * activeCount}(${activeCount} active)`);
    if (queueMatch) parts.push(`queue_match=+${queueMatchBonus}`);

    return {
      ...c,
      score: Math.round(score * 100) / 100,
      reason: parts.join(' + '),
    };
  }).sort((a, b) => b.score - a.score);
};
