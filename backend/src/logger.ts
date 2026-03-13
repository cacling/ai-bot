import { appendFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

type Level = 'INFO' | 'WARN' | 'ERROR';

// logs/ 目录在项目根（backend/ 的上一级）
const LOG_DIR = resolve(process.cwd(), '../logs');
const LOG_FILE = resolve(LOG_DIR, 'backend.log');

try {
  mkdirSync(LOG_DIR, { recursive: true });
} catch {}

const COLORS: Record<Level, string> = {
  INFO:  '\x1b[36m', // cyan
  WARN:  '\x1b[33m', // yellow
  ERROR: '\x1b[31m', // red
};
const RESET = '\x1b[0m';

function log(level: Level, mod: string, msg: string, extra?: Record<string, unknown>) {
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    mod,
    msg,
    ...extra,
  };
  const line = JSON.stringify(entry) + '\n';

  // Console：带颜色的人类可读格式
  const extras = extra && Object.keys(extra).length
    ? ' ' + Object.entries(extra).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ')
    : '';
  console.log(`${COLORS[level]}[${level}]${RESET} [${mod}] ${msg}${extras}`);

  // 文件：JSON Lines
  try { appendFileSync(LOG_FILE, line); } catch {}
}

export const logger = {
  info:  (mod: string, msg: string, extra?: Record<string, unknown>) => log('INFO',  mod, msg, extra),
  warn:  (mod: string, msg: string, extra?: Record<string, unknown>) => log('WARN',  mod, msg, extra),
  error: (mod: string, msg: string, extra?: Record<string, unknown>) => log('ERROR', mod, msg, extra),
};
