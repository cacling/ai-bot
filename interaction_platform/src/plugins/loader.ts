/**
 * Plugin loader — scans plugin packages, registers handlers, syncs manifests to DB.
 *
 * Called once at startup before the HTTP server begins accepting requests.
 */
import { db, ixPluginCatalog, eq } from '../db';
import {
  registerCandidateScorer,
  registerQueueSelector,
  registerOfferStrategy,
  registerOverflowPolicy,
} from '../services/plugin-runtime';
import type {
  PluginManifest,
  PluginPackage,
  CandidateScorerFn,
  QueueSelectorFn,
  OfferStrategyFn,
  OverflowPolicyFn,
} from './types';

// ── Plugin package imports ────────────────────────────────────────────────

import { manifest as coreLeastLoadedManifest, handler as coreLeastLoadedHandler } from './core-least-loaded';
import { manifest as vipScorerManifest, handler as vipScorerHandler } from './vip-priority-scorer';
import { manifest as intentSelectorManifest, handler as intentSelectorHandler } from './intent-queue-selector';
import { manifest as skillSelectorManifest, handler as skillSelectorHandler } from './skill-based-selector';
import { manifest as slaOverflowManifest, handler as slaOverflowHandler } from './sla-overflow-guard';

const pluginPackages: PluginPackage[] = [
  // Core framework plugins (must load first — used as fallback)
  { manifest: coreLeastLoadedManifest, handler: coreLeastLoadedHandler },
  { manifest: skillSelectorManifest, handler: skillSelectorHandler },
  // Business plugins
  { manifest: vipScorerManifest, handler: vipScorerHandler },
  { manifest: intentSelectorManifest, handler: intentSelectorHandler },
  { manifest: slaOverflowManifest, handler: slaOverflowHandler },
];

// ── Handler registration ──────────────────────────────────────────────────

function registerHandler(pkg: PluginPackage): void {
  const { manifest, handler } = pkg;
  switch (manifest.plugin_type) {
    case 'candidate_scorer':
      registerCandidateScorer(manifest.handler_module, handler as CandidateScorerFn);
      break;
    case 'queue_selector':
      registerQueueSelector(manifest.handler_module, handler as QueueSelectorFn);
      break;
    case 'offer_strategy':
      registerOfferStrategy(manifest.handler_module, handler as OfferStrategyFn);
      break;
    case 'overflow_policy':
      registerOverflowPolicy(manifest.handler_module, handler as OverflowPolicyFn);
      break;
  }
}

// ── Manifest → DB sync ────────────────────────────────────────────────────

async function syncManifestToCatalog(manifest: PluginManifest): Promise<'inserted' | 'updated' | 'skipped'> {
  const existing = await db.query.ixPluginCatalog.findFirst({
    where: eq(ixPluginCatalog.plugin_id, manifest.plugin_id),
  });

  if (!existing) {
    await db.insert(ixPluginCatalog).values({
      plugin_id: manifest.plugin_id,
      name: manifest.name,
      display_name_zh: manifest.display_name_zh,
      display_name_en: manifest.display_name_en,
      description: manifest.description,
      plugin_type: manifest.plugin_type,
      handler_module: manifest.handler_module,
      config_schema_json: manifest.config_schema_json ?? null,
      default_config_json: manifest.default_config_json ?? null,
      timeout_ms: manifest.timeout_ms,
      fallback_behavior: manifest.fallback_behavior,
      version: manifest.version,
    });
    return 'inserted';
  }

  if (existing.version === manifest.version) {
    return 'skipped';
  }

  await db.update(ixPluginCatalog).set({
    display_name_zh: manifest.display_name_zh,
    display_name_en: manifest.display_name_en,
    description: manifest.description,
    config_schema_json: manifest.config_schema_json ?? null,
    default_config_json: manifest.default_config_json ?? null,
    timeout_ms: manifest.timeout_ms,
    fallback_behavior: manifest.fallback_behavior,
    version: manifest.version,
    updated_at: new Date(),
  }).where(eq(ixPluginCatalog.plugin_id, manifest.plugin_id));
  return 'updated';
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Load all plugin packages: register handlers and sync manifests to DB.
 * Returns the list of loaded manifests.
 */
export async function loadAllPlugins(): Promise<PluginManifest[]> {
  const manifests: PluginManifest[] = [];

  for (const pkg of pluginPackages) {
    registerHandler(pkg);
    const action = await syncManifestToCatalog(pkg.manifest);
    console.log(`  [plugin] ${pkg.manifest.name} v${pkg.manifest.version} → ${action}`);
    manifests.push(pkg.manifest);
  }

  if (manifests.length > 0) {
    console.log(`[plugin-loader] ${manifests.length} plugin(s) loaded`);
  }

  return manifests;
}
