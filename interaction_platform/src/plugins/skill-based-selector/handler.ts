/**
 * Skill-based Queue Selector — routes by interaction work_model.
 */
import type { QueueSelectorFn } from '../types';

const DEFAULT_MAPPING: Record<string, string> = {
  live_voice: 'voice_queue',
  live_chat: 'default_chat',
  async_thread: 'async_queue',
  async_public_engagement: 'social_queue',
};

export const handler: QueueSelectorFn = async (interaction, config) => {
  const mapping = (config.work_model_to_queue as Record<string, string>) ?? DEFAULT_MAPPING;
  const fallback = (config.fallback_queue as string) ?? 'default_chat';
  const queueCode = mapping[interaction.work_model] ?? fallback;
  return {
    queue_code: queueCode,
    reason: `Routed by work_model=${interaction.work_model}`,
  };
};
