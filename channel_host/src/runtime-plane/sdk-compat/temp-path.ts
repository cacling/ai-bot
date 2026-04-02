/**
 * openclaw/plugin-sdk/temp-path compatibility
 */
import { resolve } from 'path';

export function resolvePreferredOpenClawTmpDir(): string { return resolve('./data/tmp'); }
export function buildRandomTempFilePath(ext = ''): string {
  const id = crypto.randomUUID().slice(0, 8);
  return resolve('./data/tmp', `${id}${ext}`);
}
