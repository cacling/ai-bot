import type { PluginManifest } from '../types';

export const manifest: PluginManifest = {
  plugin_id: 'plugin-skill-selector',
  name: 'skill_based_selector',
  display_name_zh: '技能路由队列选择器',
  display_name_en: 'Skill-based Queue Selector',
  description: 'Selects target queue based on interaction work_model',
  plugin_type: 'queue_selector',
  handler_module: 'skill_based_selector',
  default_config_json: JSON.stringify({
    work_model_to_queue: {
      live_voice: 'voice_queue',
      live_chat: 'default_chat',
      async_thread: 'async_queue',
      async_public_engagement: 'social_queue',
    },
    fallback_queue: 'default_chat',
  }),
  timeout_ms: 2000,
  fallback_behavior: 'use_core',
  version: '1.0.0',
};
