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
    if (existsSync(resolve(c, 'backend/skills')) && existsSync(resolve(c, 'frontend'))) return c;
  }
  return candidates[0];
})();

/** backend/ 根目录 */
export const BACKEND_ROOT = resolve(REPO_ROOT, 'backend');

/** skills 根目录 */
export const SKILLS_ROOT = process.env.SKILLS_DIR
  ? resolve(process.cwd(), process.env.SKILLS_DIR)
  : resolve(BACKEND_ROOT, 'skills');

/** biz-skills 目录 */
export const BIZ_SKILLS_DIR = resolve(SKILLS_ROOT, 'biz-skills');

/** tech-skills 目录 */
export const TECH_SKILLS_DIR = resolve(SKILLS_ROOT, 'tech-skills');
