/**
 * 集中管理项目路径解析（km_service 版）
 */
import { resolve } from 'path';
import { existsSync } from 'fs';

/** 项目根目录（ai-bot/） */
export const REPO_ROOT = (() => {
  if (process.env.REPO_ROOT && existsSync(resolve(process.env.REPO_ROOT, 'backend'))) {
    return process.env.REPO_ROOT;
  }
  const candidates = [
    resolve(import.meta.dir ?? process.cwd(), '../..'),  // km_service/src/ → km_service/ → repo root
    resolve(process.cwd(), '..'),
    process.cwd(),
  ];
  for (const c of candidates) {
    if ((existsSync(resolve(c, 'km_service/skills')) || existsSync(resolve(c, 'backend/skills'))) && existsSync(resolve(c, 'frontend'))) return c;
  }
  return candidates[0];
})();

/** backend/ 根目录 */
export const BACKEND_ROOT = resolve(REPO_ROOT, 'backend');

/** skills 根目录 */
export const SKILLS_ROOT = process.env.SKILLS_DIR
  ? resolve(process.cwd(), process.env.SKILLS_DIR)
  : resolve(REPO_ROOT, 'km_service/skills');

/** 解析文档内容文件路径（支持绝对/相对路径，fallback 到 REPO_ROOT） */
export function resolveDocContentPath(filePath: string | null): string | null {
  if (!filePath) return null;
  if (filePath.startsWith('/')) return filePath;

  const cwdResolved = resolve(process.cwd(), filePath);
  if (existsSync(cwdResolved)) return cwdResolved;

  const repoResolved = resolve(REPO_ROOT, filePath);
  if (existsSync(repoResolved)) return repoResolved;

  return cwdResolved;
}

/** biz-skills 目录 */
export const BIZ_SKILLS_DIR = resolve(SKILLS_ROOT, 'biz-skills');

/** tech-skills 目录 */
export const TECH_SKILLS_DIR = resolve(SKILLS_ROOT, 'tech-skills');
