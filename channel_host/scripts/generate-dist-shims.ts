#!/usr/bin/env bun
/**
 * Generate shim .js and .d.ts files in openclaw-code/dist/plugin-sdk/
 * so that the package.json "exports" map resolves successfully.
 *
 * Each shim re-exports everything from our SDK compat layer module.
 * This avoids needing to build openclaw-code or install its deps for
 * the plugin-sdk surface imports.
 */

import { resolve, basename } from 'path';
import { mkdirSync, writeFileSync, readdirSync } from 'fs';

const SDK_COMPAT_DIR = resolve(import.meta.dir, '../src/runtime-plane/sdk-compat');
const DIST_DIR = resolve(import.meta.dir, '../../openclaw-code/dist/plugin-sdk');

mkdirSync(DIST_DIR, { recursive: true });

// Read all our compat surfaces
const surfaces: string[] = [];
for (const file of readdirSync(SDK_COMPAT_DIR)) {
  if (!file.endsWith('.ts') || file.startsWith('_')) continue;
  surfaces.push(file.replace(/\.ts$/, ''));
}

// Also scan the openclaw-code exports map for any surfaces we don't have
// (they'll get a minimal stub)
const pkgJson = require(resolve(import.meta.dir, '../../openclaw-code/package.json'));
const exports = pkgJson.exports ?? {};
for (const key of Object.keys(exports)) {
  const match = key.match(/^\.\/plugin-sdk\/(.+)$/);
  if (match && !surfaces.includes(match[1])) {
    surfaces.push(match[1]);
  }
}

let created = 0;
for (const surface of surfaces) {
  const compatPath = resolve(SDK_COMPAT_DIR, `${surface}.ts`);
  const jsPath = resolve(DIST_DIR, `${surface}.js`);
  const dtsPath = resolve(DIST_DIR, `${surface}.d.ts`);

  // Check if we have a real compat implementation
  const hasCompat = readdirSync(SDK_COMPAT_DIR).includes(`${surface}.ts`);

  if (hasCompat) {
    // Re-export from our compat module
    writeFileSync(jsPath, `export * from "${compatPath}";\n`);
    writeFileSync(dtsPath, `export * from "${compatPath}";\n`);
  } else {
    // Create minimal stub
    writeFileSync(jsPath, `// Stub for unimplemented surface: ${surface}\nexport default {};\n`);
    writeFileSync(dtsPath, `export {};\n`);
  }
  created++;
}

// Also create index.js
writeFileSync(resolve(DIST_DIR, 'index.js'), `export * from "${resolve(SDK_COMPAT_DIR, 'core.ts')}";\n`);
writeFileSync(resolve(DIST_DIR, 'index.d.ts'), `export * from "${resolve(SDK_COMPAT_DIR, 'core.ts')}";\n`);

console.log(`[generate-dist-shims] Created ${created} shim files in ${DIST_DIR}`);
