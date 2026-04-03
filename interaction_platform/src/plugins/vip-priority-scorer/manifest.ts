import type { PluginManifest } from '../types';

export const manifest: PluginManifest = {
  plugin_id: 'plugin-vip-priority',
  name: 'vip_priority_scorer',
  display_name_zh: 'VIP 优先级评分（增强版）',
  display_name_en: 'VIP Priority Scorer (Enhanced)',
  description: 'Scores candidates using VIP boost, wait time weight, load penalty, and queue match bonus',
  plugin_type: 'candidate_scorer',
  handler_module: 'vip_priority_scorer',
  config_schema_json: JSON.stringify({
    type: 'object',
    required: ['vip_boost', 'load_penalty'],
    properties: {
      vip_boost: { type: 'number', description: 'VIP 优先加分' },
      vip_threshold: { type: 'number', default: 20, description: 'priority <= 此值视为 VIP' },
      wait_seconds_weight: { type: 'number', default: 0.08, description: '每等待 1 秒加几分' },
      max_wait_cap: { type: 'number', default: 300, description: '等待加分封顶秒数' },
      load_penalty: { type: 'number', description: '每个活跃会话扣几分' },
      queue_match_bonus: { type: 'number', default: 0, description: '队列资格匹配加分（V1.1）' },
    },
  }),
  default_config_json: JSON.stringify({
    vip_boost: 20,
    vip_threshold: 20,
    wait_seconds_weight: 0.08,
    max_wait_cap: 300,
    load_penalty: 5,
    queue_match_bonus: 0,
  }),
  timeout_ms: 3000,
  fallback_behavior: 'use_core',
  version: '1.1.0',
};
