import { existsSync, symlinkSync, unlinkSync, readFileSync } from 'fs';
import { resolve, basename } from 'path';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { plugins, enablement } from '../db/schema';
import { discoverPluginAt } from './manifest-discovery';
import { emitDiagnostic } from '../control-plane/diagnostics';
import type { InstallStatus, PluginPackageMetadata } from '../types';

const PLUGINS_DIR = resolve(import.meta.dir, '../../plugins');

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

export interface InstallOptions {
  source: string; // absolute path to plugin directory
}

export interface InstallResult {
  success: boolean;
  pluginId?: string;
  error?: string;
  metadata?: PluginPackageMetadata;
}

/**
 * Install a plugin from a local path by creating a symlink in the plugins/
 * directory, then recording it in the database.
 */
export async function installPlugin(opts: InstallOptions): Promise<InstallResult> {
  const { source } = opts;

  if (!existsSync(source)) {
    return { success: false, error: `Source path does not exist: ${source}` };
  }

  // Discover manifest from source
  const metadata = await discoverPluginAt(source);
  if (!metadata) {
    return { success: false, error: `No valid openclaw.plugin.json found at ${source}` };
  }

  const pluginId = metadata.manifest.id;
  const linkPath = resolve(PLUGINS_DIR, pluginId);

  // Check if already installed
  const existing = await db.select().from(plugins).where(eq(plugins.id, pluginId)).get();
  if (existing && existing.installStatus === 'installed') {
    return { success: false, error: `Plugin '${pluginId}' is already installed` };
  }

  // Create symlink
  try {
    if (existsSync(linkPath)) {
      unlinkSync(linkPath);
    }
    symlinkSync(source, linkPath, 'dir');
  } catch (err) {
    const msg = `Failed to create symlink: ${err}`;
    await emitDiagnostic(pluginId, 'error', 'install', msg);
    return { success: false, error: msg };
  }

  // Record in DB
  const now = Date.now();
  await db.insert(plugins).values({
    id: pluginId,
    name: metadata.manifest.name,
    version: metadata.packageVersion,
    source: `local:${source}`,
    manifestJson: JSON.stringify(metadata.manifest),
    installStatus: 'installed' satisfies InstallStatus,
    installedAt: new Date(now),
  }).onConflictDoUpdate({
    target: plugins.id,
    set: {
      name: metadata.manifest.name,
      version: metadata.packageVersion,
      source: `local:${source}`,
      manifestJson: JSON.stringify(metadata.manifest),
      installStatus: 'installed',
      installedAt: new Date(now),
    },
  });

  // Default enablement
  await db.insert(enablement).values({
    pluginId,
    enabled: true,
    updatedAt: new Date(now),
  }).onConflictDoUpdate({
    target: enablement.pluginId,
    set: { enabled: true, updatedAt: new Date(now) },
  });

  await emitDiagnostic(pluginId, 'info', 'install', `Plugin '${pluginId}' installed from ${source}`);

  return { success: true, pluginId, metadata };
}

// ---------------------------------------------------------------------------
// Uninstall
// ---------------------------------------------------------------------------

export async function uninstallPlugin(pluginId: string): Promise<{ success: boolean; error?: string }> {
  const existing = await db.select().from(plugins).where(eq(plugins.id, pluginId)).get();
  if (!existing) {
    return { success: false, error: `Plugin '${pluginId}' not found` };
  }

  const linkPath = resolve(PLUGINS_DIR, pluginId);
  try {
    if (existsSync(linkPath)) {
      unlinkSync(linkPath);
    }
  } catch {
    // best-effort removal
  }

  await db.update(plugins).set({ installStatus: 'uninstalled' }).where(eq(plugins.id, pluginId));
  await emitDiagnostic(pluginId, 'info', 'install', `Plugin '${pluginId}' uninstalled`);

  return { success: true };
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export async function listInstalledPlugins() {
  return db
    .select()
    .from(plugins)
    .where(eq(plugins.installStatus, 'installed'))
    .all();
}
