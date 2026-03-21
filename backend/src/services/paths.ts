/**
 * 集中管理项目路径解析
 *
 * REPO_ROOT 是所有路径的基础，通过 existsSync 验证确保正确。
 * 支持 SKILLS_DIR 环境变量覆盖（用于容器化部署）。
 */
import { resolve } from 'path';
import { existsSync } from 'fs';

/** 项目根目录（ai-bot/）— 所有路径的基础 */
export const REPO_ROOT = (() => {
  // 优先：环境变量
  if (process.env.REPO_ROOT && existsSync(resolve(process.env.REPO_ROOT, 'backend'))) {
    return process.env.REPO_ROOT;
  }
  // 候选路径（按优先级）
  const candidates = [
    resolve(import.meta.dir, '../../..'),   // services/ → src/ → backend/ → repo root
    resolve(process.cwd(), '..'),            // cwd = backend/ → repo root
    process.cwd(),                           // cwd might be repo root
  ];
  for (const c of candidates) {
    if (existsSync(resolve(c, 'backend/skills')) && existsSync(resolve(c, 'frontend'))) return c;
  }
  return candidates[0];
})();

/** backend/ 根目录 */
export const BACKEND_ROOT = resolve(REPO_ROOT, 'backend');

/** skills 根目录（包含 biz-skills/ 和 tech-skills/） */
export const SKILLS_ROOT = process.env.SKILLS_DIR
  ? resolve(process.cwd(), process.env.SKILLS_DIR)
  : resolve(BACKEND_ROOT, 'skills');

/** biz-skills 目录 */
export const BIZ_SKILLS_DIR = resolve(SKILLS_ROOT, 'biz-skills');

/** tech-skills 目录 */
export const TECH_SKILLS_DIR = resolve(SKILLS_ROOT, 'tech-skills');
