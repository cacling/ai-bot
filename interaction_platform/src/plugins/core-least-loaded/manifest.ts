import type { PluginManifest } from '../types';

export const manifest: PluginManifest = {
  plugin_id: 'plugin-core-least-loaded',
  name: 'core_least_loaded',
  display_name_zh: '核心最少负载评分',
  display_name_en: 'Core Least Loaded Scorer',
  description: 'Default candidate scorer: ranks agents by available slots (most available first)',
  plugin_type: 'candidate_scorer',
  handler_module: 'core_least_loaded',
  timeout_ms: 3000,
  fallback_behavior: 'use_core',
  version: '1.0.0',
};
