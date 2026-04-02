/**
 * Compatibility Governor
 *
 * Validates plugin compatibility against the host's supported version line,
 * plugin category restrictions, and SDK surface coverage.
 */

import { existsSync } from 'fs';
import { resolve, join } from 'path';
import type { CompatibilityReport, CompatibilityStatus, PluginPackageMetadata } from '../types';
import { emitDiagnostic } from '../control-plane/diagnostics';

// ---------------------------------------------------------------------------
// Supported version line
// ---------------------------------------------------------------------------

const SUPPORTED_VERSION_PREFIX = '2026.4';
const SUPPORTED_PLUGIN_TYPES = new Set(['channel']);

// ---------------------------------------------------------------------------
// L0 + L1 SDK surfaces the host currently implements
// ---------------------------------------------------------------------------

/** Surfaces that the host has implemented — auto-discovered from sdk-compat/ */
const IMPLEMENTED_SURFACES = new Set<string>();

// Auto-discover implemented surfaces from sdk-compat directory
{
  const sdkCompatDir = resolve(import.meta.dir, '../runtime-plane/sdk-compat');
  const glob = new Bun.Glob('*.ts');
  for (const file of glob.scanSync({ cwd: sdkCompatDir, onlyFiles: true })) {
    if (!file.startsWith('_')) {
      IMPLEMENTED_SURFACES.add(file.replace(/\.ts$/, ''));
    }
  }
}

/** All known L1 Common SDK surfaces that target plugins may import */
const L1_SURFACES = new Set<string>([
  'core', 'setup', 'channel-contract', 'config-runtime', 'runtime-store',
  'runtime-env', 'account-id', 'account-core', 'account-resolution',
  'account-helpers', 'channel-config-schema', 'channel-config-helpers',
  'channel-pairing', 'channel-policy', 'channel-send-result', 'channel-actions',
  'channel-inbound', 'channel-runtime', 'conversation-runtime', 'routing',
  'outbound-runtime', 'reply-runtime', 'reply-payload', 'reply-history',
  'channel-reply-pipeline', 'status-helpers', 'text-runtime', 'media-runtime',
  'directory-runtime', 'approval-runtime', 'allow-from', 'setup-tools', 'zod',
]);

/** Surfaces that are explicitly deferred (Later) */
const DEFERRED_SURFACES = new Set<string>([
  'command-auth', 'temp-path', 'reply-chunking', 'channel-feedback',
  'allowlist-config-edit', 'fetch-runtime', 'ssrf-runtime',
  'media-understanding-runtime', 'plugin-runtime', 'hook-runtime',
  'reply-dispatch-runtime', 'tool-send', 'channel-lifecycle',
  'command-auth-native',
]);

/** Surfaces that are explicitly not supported in Route B */
const UNSUPPORTED_CATEGORIES = new Set<string>([
  'provider', 'memory', 'context-engine',
]);

// ---------------------------------------------------------------------------
// Check
// ---------------------------------------------------------------------------

export async function checkPluginCompatibility(
  metadata: PluginPackageMetadata,
): Promise<CompatibilityReport> {
  const { manifest, packageVersion, rootDir } = metadata;
  const pluginId = manifest.id;
  const warnings: string[] = [];
  const missingSurfaces: string[] = [];
  let status: CompatibilityStatus = 'compatible';

  // 1. Version line check
  if (!packageVersion.startsWith(SUPPORTED_VERSION_PREFIX)) {
    warnings.push(
      `Plugin version '${packageVersion}' may not be compatible with host version line '${SUPPORTED_VERSION_PREFIX}.x'`,
    );
  }

  // 2. Plugin type check — must be a channel plugin
  if (manifest.channels.length === 0) {
    status = 'incompatible';
    warnings.push('Plugin does not declare any channels — it may not be a channel plugin');
    await emitDiagnostic(pluginId, 'error', 'compatibility',
      'Plugin has no channel declarations. Only channel plugins are supported in Route B.');
  }

  // 3. Check peerDependencies for minHostVersion
  const installMeta = metadata.openclawFields.install;
  if (installMeta?.minHostVersion) {
    const minVersion = String(installMeta.minHostVersion);
    if (!minVersion.includes(SUPPORTED_VERSION_PREFIX)) {
      warnings.push(`Plugin requires host version ${minVersion}, host supports ${SUPPORTED_VERSION_PREFIX}.x`);
    }
  }

  // 4. Scan plugin imports for SDK surface dependencies (static analysis)
  const importedSurfaces = await scanPluginImports(rootDir);
  for (const surface of importedSurfaces) {
    if (!IMPLEMENTED_SURFACES.has(surface)) {
      missingSurfaces.push(surface);

      if (DEFERRED_SURFACES.has(surface)) {
        warnings.push(`Surface 'openclaw/plugin-sdk/${surface}' is deferred (Later) — may be partially supported`);
      } else if (!L1_SURFACES.has(surface)) {
        warnings.push(`Surface 'openclaw/plugin-sdk/${surface}' is unknown — may be outside Route B scope`);
      }
    }
  }

  // 5. Determine final status
  if (status !== 'incompatible') {
    if (missingSurfaces.length === 0) {
      status = 'compatible';
    } else {
      // Check if all missing are deferred (partial) vs truly unsupported
      const hasHardMissing = missingSurfaces.some(s => !DEFERRED_SURFACES.has(s) && !L1_SURFACES.has(s));
      status = hasHardMissing ? 'incompatible' : 'partial';
    }
  }

  const report: CompatibilityReport = {
    pluginId,
    status,
    missingSurfaces,
    warnings,
    checkedAt: Date.now(),
  };

  // Emit diagnostic
  const level = status === 'compatible' ? 'info' : status === 'partial' ? 'warn' : 'error';
  await emitDiagnostic(pluginId, level, 'compatibility',
    `Compatibility: ${status} (${missingSurfaces.length} missing surfaces)`,
    JSON.stringify(report),
  );

  return report;
}

// ---------------------------------------------------------------------------
// Static import scanner
// ---------------------------------------------------------------------------

/**
 * Scan TypeScript/JavaScript files in a plugin directory for
 * `from 'openclaw/plugin-sdk/...'` imports. Returns the set of
 * surface names (e.g. 'core', 'setup', 'channel-contract').
 *
 * This is a best-effort static scan — not a full AST parse.
 */
async function scanPluginImports(rootDir: string): Promise<Set<string>> {
  const surfaces = new Set<string>();
  const importPattern = /from\s+['"]openclaw\/plugin-sdk\/([^'"]+)['"]/g;

  // Scan .ts and .js files (skip node_modules, dist, test)
  const glob = new Bun.Glob('**/*.{ts,js}');
  for await (const path of glob.scan({
    cwd: rootDir,
    onlyFiles: true,
    followSymlinks: false,
  })) {
    if (path.includes('node_modules') || path.includes('dist') || path.includes('.test.')) {
      continue;
    }

    try {
      const content = await Bun.file(resolve(rootDir, path)).text();
      let match: RegExpExecArray | null;
      while ((match = importPattern.exec(content)) !== null) {
        // Normalize: strip .js/.ts extension, take the base surface name
        let surface = match[1].replace(/\.(js|ts)$/, '');
        // Some imports use sub-paths like 'core/helpers' — take the first segment
        if (surface.includes('/')) {
          surface = surface.split('/')[0];
        }
        surfaces.add(surface);
      }
    } catch {
      // skip unreadable files
    }
  }

  return surfaces;
}

/**
 * Register a newly implemented surface so the governor knows it's available.
 */
export function registerImplementedSurface(surface: string) {
  IMPLEMENTED_SURFACES.add(surface);
}
