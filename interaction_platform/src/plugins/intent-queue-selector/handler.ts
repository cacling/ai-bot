/**
 * Intent Queue Selector — routes entry-queue interactions to business queues.
 *
 * Logic:
 *   1. If queue_code not in entry_queue_codes → passthrough
 *   2. If work_model not in allowlist (when configured) → passthrough
 *   3. If intent_code maps to a queue → return mapped queue
 *   4. If handoff_summary matches keyword rules → return matched queue
 *   5. Otherwise → return fallback_queue or current queue
 */
import type { QueueSelectorFn } from '../types';

interface KeywordRule {
  keywords: string[];
  queue_code: string;
}

export const handler: QueueSelectorFn = async (interaction, config) => {
  const entryQueues = (config.entry_queue_codes as string[]) ?? [];
  const intentMap = (config.intent_to_queue_map as Record<string, string>) ?? {};
  const keywordRules = (config.keyword_rules as KeywordRule[]) ?? [];
  const allowlist = config.work_model_allowlist as string[] | undefined;
  const fallbackQueue = config.fallback_queue as string | undefined;
  const enableHandoffParse = (config.enable_handoff_parse as boolean) ?? true;
  const currentQueue = interaction.queue_code ?? 'default_chat';

  // Gate: only activate for entry queues
  if (!entryQueues.includes(currentQueue)) {
    return { queue_code: currentQueue, reason: `queue_code=${currentQueue} not in entry_queue_codes, passthrough` };
  }

  // Gate: work_model allowlist
  if (allowlist && allowlist.length > 0 && !allowlist.includes(interaction.work_model)) {
    return { queue_code: currentQueue, reason: `work_model=${interaction.work_model} not in allowlist, passthrough` };
  }

  // 1. Intent code mapping (highest priority)
  if (interaction.intent_code && intentMap[interaction.intent_code]) {
    return {
      queue_code: intentMap[interaction.intent_code],
      reason: `intent=${interaction.intent_code} → ${intentMap[interaction.intent_code]}`,
    };
  }

  // 2. Keyword matching from handoff_summary
  if (enableHandoffParse && interaction.handoff_summary) {
    const summary = interaction.handoff_summary;
    for (const rule of keywordRules) {
      const matched = rule.keywords.find((kw) => summary.includes(kw));
      if (matched) {
        return {
          queue_code: rule.queue_code,
          reason: `keyword '${matched}' hit → ${rule.queue_code}`,
        };
      }
    }
  }

  // 3. Fallback
  const fallback = fallbackQueue ?? currentQueue;
  return { queue_code: fallback, reason: `no intent or keyword match, fallback to ${fallback}` };
};
