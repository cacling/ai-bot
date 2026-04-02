/**
 * Manifest Discovery Registry
 *
 * Performs manifest-first static scanning of plugin directories.
 * Reads openclaw.plugin.json and package.json openclaw.* fields.
 * Never executes plugin code during discovery.
 */

import { existsSync, readdirSync } from 'fs';
import { resolve, join } from 'path';
import type { PluginManifest, PluginPackageMetadata } from '../types';

const PLUGINS_DIR = resolve(import.meta.dir, '../../plugins');

// ---------------------------------------------------------------------------
// Single plugin discovery
// ---------------------------------------------------------------------------

/**
 * Discover a plugin at a given directory. Returns null if no valid manifest found.
 */
export async function discoverPluginAt(pluginDir: string): Promise<PluginPackageMetadata | null> {
  // 1. Read openclaw.plugin.json
  const manifestPath = join(pluginDir, 'openclaw.plugin.json');
  const packageJsonPath = join(pluginDir, 'package.json');

  if (!existsSync(manifestPath) && !existsSync(packageJsonPath)) {
    return null;
  }

  let manifestRaw: Record<string, unknown> = {};
  if (existsSync(manifestPath)) {
    try {
      const content = await Bun.file(manifestPath).text();
      manifestRaw = JSON.parse(content);
    } catch {
      return null;
    }
  }

  // 2. Read package.json
  let packageJson: Record<string, unknown> = {};
  if (existsSync(packageJsonPath)) {
    try {
      const content = await Bun.file(packageJsonPath).text();
      packageJson = JSON.parse(content);
    } catch {
      return null;
    }
  }

  const openclawBlock = (packageJson.openclaw ?? {}) as Record<string, unknown>;

  // 3. Build manifest
  const id = (manifestRaw.id as string) ?? '';
  if (!id) {
    return null;
  }

  const channels = (manifestRaw.channels as string[]) ?? [];

  const manifest: PluginManifest = {
    id,
    name: (packageJson.name as string) ?? id,
    channels,
    setupEntry: openclawBlock.setupEntry as string | undefined,
    extensions: Array.isArray(openclawBlock.extensions)
      ? (openclawBlock.extensions as string[])[0]
      : (openclawBlock.extensions as string | undefined),
    configSchema: manifestRaw.configSchema as Record<string, unknown> | undefined,
    skills: manifestRaw.skills as string[] | undefined,
    raw: manifestRaw,
  };

  const metadata: PluginPackageMetadata = {
    rootDir: pluginDir,
    packageName: (packageJson.name as string) ?? id,
    packageVersion: (packageJson.version as string) ?? '0.0.0',
    manifest,
    openclawFields: {
      extensions: manifest.extensions,
      setupEntry: manifest.setupEntry,
      channel: openclawBlock.channel as Record<string, unknown> | undefined,
      install: openclawBlock.install as Record<string, unknown> | undefined,
    },
  };

  return metadata;
}

// ---------------------------------------------------------------------------
// Batch discovery
// ---------------------------------------------------------------------------

/**
 * Scan the plugins/ directory and discover all installed plugins.
 */
export async function discoverAllPlugins(): Promise<PluginPackageMetadata[]> {
  if (!existsSync(PLUGINS_DIR)) {
    return [];
  }

  const entries = readdirSync(PLUGINS_DIR, { withFileTypes: true });
  const results: PluginPackageMetadata[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;

    const pluginDir = resolve(PLUGINS_DIR, entry.name);
    const metadata = await discoverPluginAt(pluginDir);
    if (metadata) {
      results.push(metadata);
    }
  }

  return results;
}
