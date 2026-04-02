/**
 * SDK Compatibility Loader
 *
 * Registers a Bun plugin that intercepts `openclaw/plugin-sdk/*` imports
 * and redirects them to our compatibility implementations.
 *
 * This file MUST be imported (via preload or top-level import) before
 * any plugin code is dynamically loaded.
 */

// Proxy patch MUST load before any ws/Baileys code
import '../ws-proxy-patch';

import { plugin } from 'bun';
import { resolve, join } from 'path';
import { existsSync } from 'fs';

const SDK_COMPAT_DIR = resolve(import.meta.dir);

/**
 * Map of openclaw/plugin-sdk/<surface> → local compat file.
 * Surfaces not in this map will get a stub that warns on access.
 */
const SURFACE_MAP = new Map<string, string>();

// Auto-discover all .ts files in sdk-compat/ (except _*.ts files)
const glob = new Bun.Glob('*.ts');
for (const file of glob.scanSync({ cwd: SDK_COMPAT_DIR, onlyFiles: true })) {
  if (file.startsWith('_')) continue;
  const surface = file.replace(/\.ts$/, '');
  SURFACE_MAP.set(surface, resolve(SDK_COMPAT_DIR, file));
}

plugin({
  name: 'openclaw-sdk-compat',
  setup(build) {
    // Match all openclaw/plugin-sdk/* imports
    build.onResolve({ filter: /^openclaw\/plugin-sdk\// }, (args) => {
      let surface = args.path.replace('openclaw/plugin-sdk/', '');
      // Strip .js/.ts extension if present
      surface = surface.replace(/\.(js|ts)$/, '');
      // Take only the first path segment (e.g. 'core/helpers' → 'core')
      const baseSurface = surface.includes('/') ? surface.split('/')[0] : surface;

      const compatPath = SURFACE_MAP.get(baseSurface);
      if (compatPath) {
        return { path: compatPath };
      }

      // Fallback: generate a stub module path
      return { path: resolve(SDK_COMPAT_DIR, '_stub.ts') };
    });

    // Also intercept bare 'openclaw' imports (some plugins import from 'openclaw')
    build.onResolve({ filter: /^openclaw$/ }, () => {
      return { path: resolve(SDK_COMPAT_DIR, '_openclaw-root.ts') };
    });

    // Resolve @whiskeysockets/baileys and other extension deps that Bun can't
    // find from the openclaw-code directory tree. We check multiple locations.
    const EXTRA_NODE_MODULES = [
      resolve(SDK_COMPAT_DIR, '../../../../openclaw-code/node_modules'),
      resolve(SDK_COMPAT_DIR, '../../../node_modules'),
      resolve(SDK_COMPAT_DIR, '../../../vendor/baileys-sdk/node_modules'),
    ];
    build.onResolve({ filter: /^@whiskeysockets\/baileys/ }, (args) => {
      for (const base of EXTRA_NODE_MODULES) {
        const candidate = resolve(base, '@whiskeysockets/baileys/lib/index.js');
        if (existsSync(candidate)) return { path: candidate };
      }
      return undefined; // let default resolution handle it
    });
    build.onResolve({ filter: /^jimp$/ }, (args) => {
      for (const base of EXTRA_NODE_MODULES) {
        const candidate = resolve(base, 'jimp');
        if (existsSync(candidate)) return { path: candidate };
      }
      return undefined;
    });
  },
});

console.log(`[channel-host] SDK compat loader registered (${SURFACE_MAP.size} surfaces)`);
