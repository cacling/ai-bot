/**
 * 集中管理 skills 目录路径解析
 *
 * 支持 SKILLS_DIR 环境变量覆盖（用于容器化部署），
 * 默认基于项目结构推算：backend/skills/biz-skills, backend/skills/tech-skills
 */
import { resolve } from 'path';

/** backend/ 根目录 */
const BACKEND_ROOT = resolve(import.meta.dir, '../..');

/** skills 根目录（包含 biz-skills/ 和 tech-skills/） */
export const SKILLS_ROOT = process.env.SKILLS_DIR
  ? resolve(process.cwd(), process.env.SKILLS_DIR)
  : resolve(BACKEND_ROOT, 'skills');

/** biz-skills 目录 */
export const BIZ_SKILLS_DIR = resolve(SKILLS_ROOT, 'biz-skills');

/** tech-skills 目录 */
export const TECH_SKILLS_DIR = resolve(SKILLS_ROOT, 'tech-skills');
