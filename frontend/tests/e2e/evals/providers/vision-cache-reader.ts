/**
 * promptfoo provider: reads from vision-cache directory
 *
 * Instead of calling the vision API (slow + expensive), reads the cached
 * merged.md from the most recent vision-cache run.
 *
 * Requires: TILE-01 E2E test to have run at least once to populate the cache.
 */
import { readdirSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const _dir = path.dirname(fileURLToPath(import.meta.url));
const CACHE_BASE = path.resolve(_dir, '../../../../../backend/data/vision-cache');

function findLatestCache(): string | null {
  try {
    const dirs = readdirSync(CACHE_BASE)
      .filter(d => d.startsWith('vision-'))
      .sort()
      .reverse();
    return dirs[0] ? path.join(CACHE_BASE, dirs[0]) : null;
  } catch {
    return null;
  }
}

export default class VisionCacheReaderProvider {
  _id: string;
  constructor() { this._id = 'vision-cache-reader'; }
  id() { return this._id; }

  async callApi(_prompt: string) {
    const cacheDir = findLatestCache();
    if (!cacheDir) {
      return { output: '[ERROR] No vision-cache found. Run TILE-01 E2E test first.' };
    }

    try {
      const merged = readFileSync(path.join(cacheDir, 'merged.md'), 'utf-8');
      return { output: merged };
    } catch (err) {
      return { output: `[ERROR] Failed to read cache: ${String(err)}` };
    }
  }
}
