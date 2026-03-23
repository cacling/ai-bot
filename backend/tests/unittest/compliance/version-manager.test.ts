/**
 * version-manager.test.ts — Skill 版本管理测试
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { rm, mkdir, writeFile as writeFileAsync } from 'node:fs/promises';
import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import {
  createNewSkillVersion,
  createVersionFrom,
  writeVersionFile,
  publishVersion,
  getVersionList,
  getVersionDetail,
  getSkillRegistry,
  listSkillRegistry,
  markVersionSaved,
  initializeSkillVersion,
} from '../../../src/agent/km/skills/version-manager';
import { db } from '../../../src/db/index';
import { skillRegistry, skillVersions } from '../../../src/db/schema/index';
import { eq, and } from 'drizzle-orm';

const TEST_SKILL_ID = '_test_version_mgr';
const TEST_SKILL_INIT = '_test_version_init';
const PROJECT_ROOT = resolve(import.meta.dir, '../../../../backend');
const SKILLS_ROOT = resolve(PROJECT_ROOT, 'skills');

afterAll(async () => {
  // 清理测试数据
  db.delete(skillVersions).where(eq(skillVersions.skill_id, TEST_SKILL_ID)).run();
  db.delete(skillRegistry).where(eq(skillRegistry.id, TEST_SKILL_ID)).run();
  db.delete(skillVersions).where(eq(skillVersions.skill_id, TEST_SKILL_INIT)).run();
  db.delete(skillRegistry).where(eq(skillRegistry.id, TEST_SKILL_INIT)).run();
  await rm(resolve(SKILLS_ROOT, '.versions', TEST_SKILL_ID), { recursive: true, force: true });
  await rm(resolve(SKILLS_ROOT, 'biz-skills', TEST_SKILL_ID), { recursive: true, force: true });
  await rm(resolve(SKILLS_ROOT, '.versions', TEST_SKILL_INIT), { recursive: true, force: true });
  await rm(resolve(SKILLS_ROOT, 'biz-skills', TEST_SKILL_INIT), { recursive: true, force: true });
});

describe('createNewSkillVersion', () => {
  test('创建全新技能的 v1 版本', async () => {
    const result = await createNewSkillVersion(
      TEST_SKILL_ID,
      '# 测试技能\n初始内容',
      [{ filename: 'test-ref.md', content: '# 参考文档' }],
      '测试创建',
      'test_user',
    );
    expect(result.versionNo).toBe(1);
    expect(result.snapshotPath).toContain(TEST_SKILL_ID);

    // 快照文件应存在
    const snapshotDir = resolve(SKILLS_ROOT, result.snapshotPath);
    expect(existsSync(resolve(snapshotDir, 'SKILL.md'))).toBe(true);
    expect(existsSync(resolve(snapshotDir, 'references', 'test-ref.md'))).toBe(true);
  });

  test('连续创建递增版本号', async () => {
    const result = await createNewSkillVersion(
      TEST_SKILL_ID,
      '# 测试技能 v2\n修改后',
      [],
      '第二版',
      'test_user',
    );
    expect(result.versionNo).toBe(2);
  });
});

describe('createVersionFrom', () => {
  test('基于已有版本创建新版本', async () => {
    const result = await createVersionFrom(TEST_SKILL_ID, 1, '基于 v1 创建', 'test_user');
    expect(result.versionNo).toBe(3);
    // 快照应包含 v1 的内容
    const content = readFileSync(resolve(SKILLS_ROOT, result.snapshotPath, 'SKILL.md'), 'utf-8');
    expect(content).toContain('初始内容');
  });
});

describe('getVersionList', () => {
  test('返回版本列表', () => {
    const versions = getVersionList(TEST_SKILL_ID).all();
    expect(versions.length).toBeGreaterThanOrEqual(3);
  });

  test('查询不存在的技能返回空数组', () => {
    const versions = getVersionList('nonexistent_skill_xyz').all();
    expect(versions).toHaveLength(0);
  });
});

describe('getVersionDetail', () => {
  test('获取存在的版本详情', () => {
    const detail = getVersionDetail(TEST_SKILL_ID, 1);
    expect(detail).not.toBeNull();
    expect(detail!.skill_id).toBe(TEST_SKILL_ID);
    expect(detail!.version_no).toBe(1);
    expect(detail!.snapshot_path).toBeTruthy();
  });

  test('获取不存在的版本返回 undefined', () => {
    const detail = getVersionDetail(TEST_SKILL_ID, 999);
    expect(detail).toBeUndefined();
  });
});

describe('writeVersionFile', () => {
  test('写入文件到版本快照', async () => {
    await writeVersionFile(TEST_SKILL_ID, 1, 'SKILL.md', '# 更新后的内容\n已修改');
    const detail = getVersionDetail(TEST_SKILL_ID, 1);
    const content = readFileSync(resolve(SKILLS_ROOT, detail!.snapshot_path!, 'SKILL.md'), 'utf-8');
    expect(content).toContain('更新后的内容');
  });
});

describe('publishVersion', () => {
  test('发布版本到 biz-skills 目录', async () => {
    const result = await publishVersion(TEST_SKILL_ID, 1, 'test_user');
    expect(result.success).toBe(true);

    // biz-skills 目录应有文件
    const publishedPath = resolve(SKILLS_ROOT, 'biz-skills', TEST_SKILL_ID, 'SKILL.md');
    expect(existsSync(publishedPath)).toBe(true);

    // registry 应更新
    const reg = getSkillRegistry(TEST_SKILL_ID);
    expect(reg?.published_version).toBe(1);
  });

  test('发布不存在的版本返回错误', async () => {
    const result = await publishVersion(TEST_SKILL_ID, 999);
    expect(result.success).toBe(false);
    expect(result.error).toContain('不存在');
  });

  test('发布未注册的技能返回错误', async () => {
    const result = await publishVersion('nonexistent_skill_xyz', 1);
    expect(result.success).toBe(false);
    expect(result.error).toContain('未注册');
  });

  test('发布含 .draft 文件的版本返回错误', async () => {
    // Create a version with a .draft file
    const v = await createNewSkillVersion(
      TEST_SKILL_ID,
      '# Draft test\ncontent',
      [],
      'draft test',
      'test_user',
    );
    // Write a .draft file into the snapshot
    const snapshotDir = resolve(SKILLS_ROOT, v.snapshotPath);
    const { writeFileSync } = require('fs');
    writeFileSync(resolve(snapshotDir, 'SKILL.md.draft'), 'draft content');

    const result = await publishVersion(TEST_SKILL_ID, v.versionNo);
    expect(result.success).toBe(false);
    expect(result.error).toContain('未保存');

    // Clean up the draft file
    const { unlinkSync } = require('fs');
    unlinkSync(resolve(snapshotDir, 'SKILL.md.draft'));
  });
});

describe('listSkillRegistry', () => {
  test('返回包含测试技能的注册表列表', () => {
    const list = listSkillRegistry();
    expect(Array.isArray(list)).toBe(true);
    const found = list.find((r: { id: string }) => r.id === TEST_SKILL_ID);
    expect(found).toBeDefined();
  });
});

describe('markVersionSaved', () => {
  test('将版本状态标记为 saved', () => {
    // First set a version to draft manually
    db.update(skillVersions).set({ status: 'draft' })
      .where(and(eq(skillVersions.skill_id, TEST_SKILL_ID), eq(skillVersions.version_no, 1)))
      .run();

    markVersionSaved(TEST_SKILL_ID, 1);

    const detail = getVersionDetail(TEST_SKILL_ID, 1);
    expect(detail?.status).toBe('saved');
  });
});

describe('initializeSkillVersion', () => {
  test('从 biz-skills 目录初始化 v1 版本', async () => {
    // Create a fake skill dir in biz-skills
    const skillDir = resolve(SKILLS_ROOT, 'biz-skills', TEST_SKILL_INIT);
    await mkdir(skillDir, { recursive: true });
    await writeFileAsync(resolve(skillDir, 'SKILL.md'), '# Init Test\ncontent', 'utf-8');

    await initializeSkillVersion(TEST_SKILL_INIT, '初始化测试');

    // Registry should exist
    const reg = getSkillRegistry(TEST_SKILL_INIT);
    expect(reg).toBeDefined();
    expect(reg?.published_version).toBe(1);
    expect(reg?.latest_version).toBe(1);

    // Version record should exist
    const detail = getVersionDetail(TEST_SKILL_INIT, 1);
    expect(detail).toBeDefined();
    expect(detail?.status).toBe('published');
    expect(detail?.snapshot_path).toContain(TEST_SKILL_INIT);

    // Snapshot should exist on disk
    expect(existsSync(resolve(SKILLS_ROOT, detail!.snapshot_path!, 'SKILL.md'))).toBe(true);
  });

  test('对不存在的 biz-skills 目录不执行操作', async () => {
    await initializeSkillVersion('nonexistent_skill_abc', '不存在');
    const reg = getSkillRegistry('nonexistent_skill_abc');
    expect(reg).toBeUndefined();
  });

  test('重复初始化不会重复创建版本', async () => {
    // Call again for the same skill
    await initializeSkillVersion(TEST_SKILL_INIT, '再次初始化');
    // Should still have only v1
    const versions = getVersionList(TEST_SKILL_INIT).all();
    const v1Count = versions.filter((v: { version_no: number }) => v.version_no === 1).length;
    expect(v1Count).toBe(1);
  });
});

describe('createVersionFrom — error cases', () => {
  test('未注册的技能抛出错误', async () => {
    expect(() => createVersionFrom('nonexistent_xyz', 1)).toThrow('未注册');
  });

  test('不存在的源版本号抛出错误', async () => {
    expect(() => createVersionFrom(TEST_SKILL_ID, 999)).toThrow('不存在');
  });
});
