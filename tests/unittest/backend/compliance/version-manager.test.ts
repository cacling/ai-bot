/**
 * version-manager.test.ts — Skill 版本管理测试
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { db } from '../../../../backend/src/db/index.ts';
import { skillVersions } from '../../../../backend/src/db/schema.ts';
import { eq } from 'drizzle-orm';
import {
  saveSkillWithVersion,
  getVersionList,
  getVersionContent,
  rollbackToVersion,
} from '../../../../backend/src/agent/km/skills/version-manager.ts';

const PROJECT_ROOT = resolve(import.meta.dir, '../../../../backend');
const TEST_SKILL_PATH = 'skills/biz-skills/_test_version/SKILL.md';
const TEST_SKILL_ABS = resolve(PROJECT_ROOT, TEST_SKILL_PATH);

beforeAll(async () => {
  // 创建测试文件
  await mkdir(dirname(TEST_SKILL_ABS), { recursive: true });
  await writeFile(TEST_SKILL_ABS, '# 版本1\n初始内容', 'utf-8');
});

afterAll(async () => {
  // 清理测试文件和版本记录
  await rm(dirname(TEST_SKILL_ABS), { recursive: true, force: true });
  db.delete(skillVersions).where(eq(skillVersions.skill_path, TEST_SKILL_PATH)).run();
});

describe('saveSkillWithVersion', () => {
  test('保存新版本并记录旧版本快照', async () => {
    const { versionId } = await saveSkillWithVersion(
      TEST_SKILL_PATH,
      '# 版本2\n修改后的内容',
      '测试修改',
      'test_user',
    );

    expect(versionId).toBeGreaterThan(0);

    // 验证文件内容已更新
    const content = await readFile(TEST_SKILL_ABS, 'utf-8');
    expect(content).toBe('# 版本2\n修改后的内容');

    // 验证版本记录保存了旧内容
    const version = await getVersionContent(versionId);
    expect(version).not.toBeNull();
    expect(version!.content).toBe('# 版本1\n初始内容');
    expect(version!.change_description).toBe('测试修改');
    expect(version!.created_by).toBe('test_user');
  });

  test('连续保存创建多个版本', async () => {
    await saveSkillWithVersion(TEST_SKILL_PATH, '# 版本3\n第三版', '第二次修改', 'test');
    await saveSkillWithVersion(TEST_SKILL_PATH, '# 版本4\n第四版', '第三次修改', 'test');

    const versions = await getVersionList(TEST_SKILL_PATH);
    expect(versions.length).toBeGreaterThanOrEqual(3); // 至少3个版本记录
  });
});

describe('getVersionList', () => {
  test('返回按时间倒序排列的版本列表', async () => {
    const versions = await getVersionList(TEST_SKILL_PATH);
    expect(versions.length).toBeGreaterThan(0);

    // 检查时间倒序
    for (let i = 1; i < versions.length; i++) {
      expect(versions[i - 1].created_at >= versions[i].created_at).toBe(true);
    }
  });

  test('查询不存在的路径返回空数组', async () => {
    const versions = await getVersionList('nonexistent/path.md');
    expect(versions).toHaveLength(0);
  });
});

describe('getVersionContent', () => {
  test('获取存在的版本', async () => {
    const versions = await getVersionList(TEST_SKILL_PATH);
    const latest = versions[0];
    const content = await getVersionContent(latest.id);
    expect(content).not.toBeNull();
    expect(content!.skill_path).toBe(TEST_SKILL_PATH);
    expect(content!.content.length).toBeGreaterThan(0);
  });

  test('获取不存在的版本返回 null', async () => {
    const content = await getVersionContent(999999);
    expect(content).toBeNull();
  });
});

describe('rollbackToVersion', () => {
  test('回滚到指定版本', async () => {
    // 获取最早的版本（包含初始内容）
    const versions = await getVersionList(TEST_SKILL_PATH);
    const earliest = versions[versions.length - 1];

    const result = await rollbackToVersion(earliest.id, 'test_rollback');
    expect(result.success).toBe(true);
    expect(result.newVersionId).toBeGreaterThan(0);

    // 验证文件内容已回滚
    const content = await readFile(TEST_SKILL_ABS, 'utf-8');
    const targetContent = (await getVersionContent(earliest.id))!.content;
    expect(content).toBe(targetContent);
  });

  test('回滚不存在的版本返回错误', async () => {
    const result = await rollbackToVersion(999999);
    expect(result.success).toBe(false);
    expect(result.error).toContain('不存在');
  });
});
