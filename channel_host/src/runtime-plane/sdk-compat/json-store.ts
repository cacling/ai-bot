/**
 * openclaw/plugin-sdk/json-store compatibility
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export function loadJsonFile<T>(path: string, fallback: T): T {
  try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return fallback; }
}

export function saveJsonFile(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
}

export function readJsonFileWithFallback<T>(path: string, fallback: T): T {
  return loadJsonFile(path, fallback);
}

export function writeJsonFileAtomically(path: string, data: unknown): void {
  const tmpPath = `${path}.tmp.${Date.now()}`;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  const { renameSync } = require('fs');
  renameSync(tmpPath, path);
}
