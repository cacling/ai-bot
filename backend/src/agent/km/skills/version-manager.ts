/**
 * version-manager.ts — Skill 版本管理
 *
 * 概念模型：
 * - 每个版本有编辑状态（draft/saved）和发布状态（published/unpublished）
 * - status: 'draft' = 有未保存修改, 'saved' = 已保存, 'published' = 已发布
 * - 所有版本中有且仅有一个 published
 * - 草稿态不能沙盒测试，必须先保存
 * - 发布任意版本会自动取消旧发布
 */

import { resolve } from 'node:path';
import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { db } from '../../../db';
import { skillRegistry, skillVersions } from '../../../db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { logger } from '../../../services/logger';
import { syncSkillMetadata, refreshSkillsCache } from '../../../engine/skills';

import { REPO_ROOT, SKILLS_ROOT } from '../../../services/paths';
const PROJECT_ROOT = REPO_ROOT;
const BIZ_SKILLS_DIR = resolve(SKILLS_ROOT, 'biz-skills');
const VERSIONS_DIR = resolve(SKILLS_ROOT, '.versions');

// ── Registry ─────────────────────────────────────────────────────────────────

export function getSkillRegistry(skillId: string) {
  return db.select().from(skillRegistry).where(eq(skillRegistry.id, skillId)).get();
}

export function listSkillRegistry() {
  return db.select().from(skillRegistry).all();
}

// ── Create version from existing ─────────────────────────────────────────────

/**
 * 基于某版本创建新版本（复制快照）
 */
export async function createVersionFrom(
  skillId: string,
  fromVersionNo: number,
  description: string = '',
  operator: string = 'system',
): Promise<{ versionNo: number; snapshotPath: string }> {
  const reg = getSkillRegistry(skillId);
  if (!reg) throw new Error(`Skill ${skillId} 未注册`);

  const from = db.select().from(skillVersions)
    .where(and(eq(skillVersions.skill_id, skillId), eq(skillVersions.version_no, fromVersionNo)))
    .get();
  if (!from || !from.snapshot_path) throw new Error(`版本 v${fromVersionNo} 不存在`);

  const fromAbsPath = resolve(SKILLS_ROOT, from.snapshot_path);
  if (!existsSync(fromAbsPath)) throw new Error(`快照目录不存在: ${from.snapshot_path}`);

  const versionNo = (reg.latest_version ?? 0) + 1;
  const snapshotRelPath = `.versions/${skillId}/v${versionNo}`;
  const snapshotAbsPath = resolve(SKILLS_ROOT, snapshotRelPath);

  await mkdir(snapshotAbsPath, { recursive: true });
  await cp(fromAbsPath, snapshotAbsPath, { recursive: true });

  db.insert(skillVersions).values({
    skill_id: skillId,
    version_no: versionNo,
    status: 'saved',
    snapshot_path: snapshotRelPath,
    change_description: description || `基于 v${fromVersionNo} 创建`,
    created_by: operator,
  }).run();

  db.update(skillRegistry).set({
    latest_version: versionNo,
    updated_at: new Date().toISOString(),
  }).where(eq(skillRegistry.id, skillId)).run();

  logger.info('version', 'created_from', { skillId, fromVersionNo, versionNo, operator });
  return { versionNo, snapshotPath: snapshotRelPath };
}

// ── Create new skill with v1 (for skill-creator) ─────────────────────────────

/**
 * 创建全新技能的 v1 版本。
 * 直接在 .versions/{skillId}/v1/ 下创建文件，不写 biz-skills/ 主目录。
 */
export async function createNewSkillVersion(
  skillId: string,
  skillMd: string,
  references: Array<{ filename: string; content: string }>,
  description: string = '',
  operator: string = 'system',
): Promise<{ versionNo: number; snapshotPath: string }> {
  // Ensure registry
  let reg = getSkillRegistry(skillId);
  if (!reg) {
    db.insert(skillRegistry).values({ id: skillId, latest_version: 0, description }).run();
    reg = getSkillRegistry(skillId)!;
  }

  const versionNo = (reg.latest_version ?? 0) + 1;
  const snapshotRelPath = `.versions/${skillId}/v${versionNo}`;
  const snapshotAbsPath = resolve(SKILLS_ROOT, snapshotRelPath);

  // Create dirs + write files
  await mkdir(resolve(snapshotAbsPath, 'references'), { recursive: true });
  await writeFile(resolve(snapshotAbsPath, 'SKILL.md'), skillMd, 'utf-8');
  for (const ref of references) {
    await writeFile(resolve(snapshotAbsPath, 'references', ref.filename), ref.content, 'utf-8');
  }

  db.insert(skillVersions).values({
    skill_id: skillId, version_no: versionNo, status: 'saved',
    snapshot_path: snapshotRelPath, change_description: description, created_by: operator,
  }).run();

  db.update(skillRegistry).set({
    latest_version: versionNo,
    updated_at: new Date().toISOString(),
  }).where(eq(skillRegistry.id, skillId)).run();

  logger.info('version', 'new_skill_created', { skillId, versionNo, operator });
  return { versionNo, snapshotPath: snapshotRelPath };
}

// ── Write file to a version snapshot ──────────────────────────────────────────

/**
 * 写入文件到指定版本的快照目录。
 * filePath 是相对于快照根目录的路径（如 "SKILL.md" 或 "references/billing-rules.md"）
 */
export async function writeVersionFile(
  skillId: string,
  versionNo: number,
  filePath: string,
  content: string,
): Promise<void> {
  const version = getVersionDetail(skillId, versionNo);
  if (!version?.snapshot_path) throw new Error(`版本 v${versionNo} 不存在`);
  const absPath = resolve(SKILLS_ROOT, version.snapshot_path, filePath);
  const dir = resolve(absPath, '..');
  await mkdir(dir, { recursive: true });
  await writeFile(absPath, content, 'utf-8');
  logger.info('version', 'file_written', { skillId, versionNo, filePath });
}

// ── Save (draft → saved) ─────────────────────────────────────────────────────

/**
 * 保存版本（draft → saved）
 */
export function markVersionSaved(skillId: string, versionNo: number): void {
  db.update(skillVersions).set({ status: 'saved' })
    .where(and(eq(skillVersions.skill_id, skillId), eq(skillVersions.version_no, versionNo)))
    .run();
  logger.info('version', 'marked_saved', { skillId, versionNo });
}

// ── Publish ──────────────────────────────────────────────────────────────────

/**
 * 发布版本 — 该版本→published，旧 published→saved，复制快照到 skill 目录
 */
export async function publishVersion(
  skillId: string,
  versionNo: number,
  operator: string = 'system',
): Promise<{ success: boolean; error?: string }> {
  const reg = getSkillRegistry(skillId);
  if (!reg) return { success: false, error: `Skill ${skillId} 未注册` };

  const version = db.select().from(skillVersions)
    .where(and(eq(skillVersions.skill_id, skillId), eq(skillVersions.version_no, versionNo)))
    .get();
  if (!version) return { success: false, error: `版本 v${versionNo} 不存在` };
  if (!version.snapshot_path) return { success: false, error: '版本快照路径缺失' };

  const snapshotAbsPath = resolve(SKILLS_ROOT, version.snapshot_path);
  if (!existsSync(snapshotAbsPath)) return { success: false, error: `快照目录不存在` };

  // Check for unsaved draft files
  const { readdirSync } = await import('node:fs');
  function hasDraftFiles(dir: string): boolean {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.endsWith('.draft')) return true;
      if (entry.isDirectory()) {
        if (hasDraftFiles(resolve(dir, entry.name))) return true;
      }
    }
    return false;
  }
  if (hasDraftFiles(snapshotAbsPath)) {
    return { success: false, error: '该版本有未保存的文件，请先保存后再发布' };
  }

  const skillDir = resolve(BIZ_SKILLS_DIR, skillId);

  // Unpublish old published version → saved
  db.update(skillVersions).set({ status: 'saved' })
    .where(and(eq(skillVersions.skill_id, skillId), eq(skillVersions.status, 'published')))
    .run();

  // Copy snapshot to skill dir (exclude .draft files as safety net)
  await cp(snapshotAbsPath, skillDir, {
    recursive: true,
    force: true,
    filter: (src) => !src.endsWith('.draft'),
  });

  // Mark as published
  db.update(skillVersions).set({ status: 'published' })
    .where(eq(skillVersions.id, version.id))
    .run();

  db.update(skillRegistry).set({
    published_version: versionNo,
    updated_at: new Date().toISOString(),
  }).where(eq(skillRegistry.id, skillId)).run();

  // 发布后同步元数据到 skill_registry（从刚复制的 SKILL.md 提取）
  const publishedMdPath = resolve(BIZ_SKILLS_DIR, skillId, 'SKILL.md');
  if (existsSync(publishedMdPath)) {
    try {
      const { readFileSync } = await import('node:fs');
      syncSkillMetadata(skillId, readFileSync(publishedMdPath, 'utf-8'));
    } catch (e) {
      logger.warn('version', 'metadata_sync_error', { skillId, error: String(e) });
    }
  }
  refreshSkillsCache();

  logger.info('version', 'published', { skillId, versionNo, operator });
  return { success: true };
}

// ── Query ────────────────────────────────────────────────────────────────────

export function getVersionList(skillId: string) {
  return db.select().from(skillVersions)
    .where(eq(skillVersions.skill_id, skillId))
    .orderBy(desc(skillVersions.version_no));
}

export function getVersionDetail(skillId: string, versionNo: number) {
  return db.select().from(skillVersions)
    .where(and(eq(skillVersions.skill_id, skillId), eq(skillVersions.version_no, versionNo)))
    .get();
}

// ── Initialize (for seed) ────────────────────────────────────────────────────

export async function initializeSkillVersion(
  skillId: string,
  description: string,
): Promise<void> {
  const skillDir = resolve(BIZ_SKILLS_DIR, skillId);
  if (!existsSync(skillDir)) return;

  // Check if already initialized
  const existing = db.select().from(skillVersions)
    .where(and(eq(skillVersions.skill_id, skillId), eq(skillVersions.version_no, 1)))
    .get();
  if (existing) {
    db.insert(skillRegistry).values({
      id: skillId, published_version: 1, latest_version: 1, description,
    }).onConflictDoNothing().run();
    return;
  }

  const snapshotRelPath = `.versions/${skillId}/v1`;
  const snapshotAbsPath = resolve(SKILLS_ROOT, snapshotRelPath);

  await mkdir(snapshotAbsPath, { recursive: true });
  await cp(skillDir, snapshotAbsPath, { recursive: true });

  db.insert(skillRegistry).values({
    id: skillId, published_version: 1, latest_version: 1, description,
  }).onConflictDoNothing().run();

  db.insert(skillVersions).values({
    skill_id: skillId, version_no: 1, status: 'published',
    snapshot_path: snapshotRelPath, change_description: '初始版本', created_by: 'seed',
  }).run();
}

