import type { PluginManifest } from '../types';

export const manifest: PluginManifest = {
  plugin_id: 'plugin-sla-overflow',
  name: 'sla_overflow_guard',
  display_name_zh: 'SLA 溢出守护插件',
  display_name_en: 'SLA Overflow Guard',
  description: 'Decides wait vs overflow based on wait time threshold and queue configuration',
  plugin_type: 'overflow_policy',
  handler_module: 'sla_overflow_guard',
  config_schema_json: JSON.stringify({
    type: 'object',
    required: ['max_wait_seconds', 'overflow_queue', 'allow_overflow'],
    properties: {
      max_wait_seconds: { type: 'number', description: '最大等待阈值（秒）' },
      overflow_queue: { type: 'string', description: '主溢出队列' },
      secondary_overflow_queue: { type: 'string', description: '二级溢出队列' },
      allow_overflow: { type: 'boolean', description: '是否允许转溢出队列' },
      allow_callback: { type: 'boolean', default: false, description: '是否允许回呼（V2）' },
      business_hours_only: { type: 'boolean', default: false, description: '仅工作时间触发溢出' },
      business_hours: {
        type: 'object',
        properties: {
          start: { type: 'string', default: '09:00' },
          end: { type: 'string', default: '18:00' },
          timezone: { type: 'string', default: 'Asia/Shanghai' },
        },
      },
      min_candidate_retry_interval: { type: 'number', default: 15, description: '距上次候选计算多久后才允许溢出（秒）' },
    },
  }),
  default_config_json: JSON.stringify({
    max_wait_seconds: 90,
    overflow_queue: 'default_chat',
    allow_overflow: true,
    allow_callback: false,
    business_hours_only: false,
    min_candidate_retry_interval: 15,
  }),
  timeout_ms: 1000,
  fallback_behavior: 'use_core',
  version: '1.0.0',
};
