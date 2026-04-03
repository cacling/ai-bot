/**
 * Plugin package types — shared manifest interface and handler type re-exports.
 */
import type {
  CandidateScorerFn,
  QueueSelectorFn,
  OfferStrategyFn,
  OverflowPolicyFn,
  PluginSlot,
} from '../services/plugin-runtime';

export type { CandidateScorerFn, QueueSelectorFn, OfferStrategyFn, OverflowPolicyFn, PluginSlot };

/** Plugin manifest — describes a plugin package for registration and catalog sync. */
export interface PluginManifest {
  plugin_id: string;
  name: string;
  display_name_zh: string;
  display_name_en: string;
  description: string;
  plugin_type: PluginSlot;
  handler_module: string;
  config_schema_json?: string;
  default_config_json?: string;
  timeout_ms: number;
  fallback_behavior: 'use_core' | 'skip' | 'error';
  version: string;
}

/** A loaded plugin package ready for registration. */
export interface PluginPackage {
  manifest: PluginManifest;
  handler: CandidateScorerFn | QueueSelectorFn | OfferStrategyFn | OverflowPolicyFn;
}
