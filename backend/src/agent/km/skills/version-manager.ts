/**
 * version-manager.ts — Skill 文件版本管理
 *
 * 提供统一的"保存并记录版本"函数，
 * 所有修改 Skill 文件的路径（手动编辑、NL 编辑、沙箱发布、回滚）都经过此函数。
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { db } from '../../../db';
import { skillVersions, changeRequests } from '../../../db/schema';
import { eq, desc } from 'drizzle-orm';
import { logger } from '../../../services/logger';
import { detectHighRisk } from './change-requests';

// Project root for Skill files
const PROJECT_ROOT = resolve(import.meta.dir, '../../../..');

/**
 * 保存文件并创建版本快照（保存旧版本内容）
 */
export async function saveSkillWithVersion(
  skillPath: string,
  newContent: string,
  description: string,
  operator: string = 'system',
): Promise<{ versionId: number; needsApproval?: boolean; changeRequestId?: number }> {
  const absPath = resolve(PROJECT_ROOT, skillPath);
  let oldContent: string;
  try {
    oldContent = await readFile(absPath, 'utf-8');
  } catch {
    oldContent = ''; // 新文件
  }

  // 高风险检测：非 admin 用户需要审批
  if (operator !== 'admin') {
    const riskReason = detectHighRisk(oldContent, newContent);
    if (riskReason) {
      const crResult = await db.insert(changeRequests).values({
        skill_path: skillPath,
        old_content: oldContent,
        new_content: newContent,
        description,
        requester: operator,
        status: 'pending',
        risk_reason: riskReason,
      }).returning({ id: changeRequests.id });

      const changeRequestId = crResult[0]?.id ?? 0;
      logger.warn('version', 'high_risk_blocked', {
        path: skillPath, operator, riskReason, changeRequestId,
      });

      return { versionId: 0, needsApproval: true, changeRequestId };
    }
  }

  // 保存旧版本快照
  const result = await db.insert(skillVersions).values({
    skill_path: skillPath,
    content: oldContent,
    change_description: description,
    created_by: operator,
  }).returning({ id: skillVersions.id });

  const versionId = result[0]?.id ?? 0;

  // 写入新内容
  await writeFile(absPath, newContent, 'utf-8');

  logger.info('version', 'saved', {
    path: skillPath, versionId, operator,
    oldLen: oldContent.length, newLen: newContent.length,
  });

  return { versionId };
}

/**
 * 获取文件的版本列表
 */
export async function getVersionList(skillPath: string) {
  return db
    .select({
      id: skillVersions.id,
      change_description: skillVersions.change_description,
      created_by: skillVersions.created_by,
      created_at: skillVersions.created_at,
    })
    .from(skillVersions)
    .where(eq(skillVersions.skill_path, skillPath))
    .orderBy(desc(skillVersions.created_at));
}

/**
 * 获取指定版本的完整内容
 */
export async function getVersionContent(versionId: number) {
  const rows = await db
    .select()
    .from(skillVersions)
    .where(eq(skillVersions.id, versionId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * 回滚到指定版本（创建新的版本记录标记为"回滚"）
 */
export async function rollbackToVersion(
  versionId: number,
  operator: string = 'system',
): Promise<{ success: boolean; newVersionId?: number; error?: string }> {
  const target = await getVersionContent(versionId);
  if (!target) {
    return { success: false, error: `版本 ${versionId} 不存在` };
  }

  const { versionId: newId } = await saveSkillWithVersion(
    target.skill_path,
    target.content,
    `回滚至版本 #${versionId}`,
    operator,
  );

  logger.info('version', 'rollback', {
    targetVersion: versionId, newVersion: newId,
    path: target.skill_path, operator,
  });

  return { success: true, newVersionId: newId };
}
