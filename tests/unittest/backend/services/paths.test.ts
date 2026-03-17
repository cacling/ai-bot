/**
 * paths.test.ts — 路径解析测试
 */

import { describe, test, expect } from 'bun:test';
import { SKILLS_ROOT, BIZ_SKILLS_DIR, TECH_SKILLS_DIR } from '../../../../backend/src/services/paths';

describe('paths — 技能目录路径', () => {
  test('SKILLS_ROOT 是绝对路径', () => {
    expect(SKILLS_ROOT.startsWith('/')).toBe(true);
  });

  test('BIZ_SKILLS_DIR 在 SKILLS_ROOT 下', () => {
    expect(BIZ_SKILLS_DIR.startsWith(SKILLS_ROOT)).toBe(true);
    expect(BIZ_SKILLS_DIR).toContain('biz-skills');
  });

  test('TECH_SKILLS_DIR 在 SKILLS_ROOT 下', () => {
    expect(TECH_SKILLS_DIR.startsWith(SKILLS_ROOT)).toBe(true);
    expect(TECH_SKILLS_DIR).toContain('tech-skills');
  });

  test('BIZ_SKILLS_DIR 和 TECH_SKILLS_DIR 不同', () => {
    expect(BIZ_SKILLS_DIR).not.toBe(TECH_SKILLS_DIR);
  });

  test('路径不包含 .. 或 ./', () => {
    // resolve 后不应有相对路径片段
    expect(SKILLS_ROOT).not.toContain('/..');
    expect(BIZ_SKILLS_DIR).not.toContain('/..');
    expect(TECH_SKILLS_DIR).not.toContain('/..');
  });
});
