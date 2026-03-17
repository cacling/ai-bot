/**
 * skills.test.ts — 技能管理模块测试
 */

import { describe, test, expect } from 'bun:test';
import {
  getSkillsByChannel,
  getSkillsDescriptionByChannel,
  getSkillContentByChannel,
  refreshSkillsCache,
  getAvailableSkillsDescription,
  type SkillEntry,
} from '../../../../backend/src/engine/skills';

describe('getSkillsByChannel — 按 channel 过滤技能', () => {
  test('返回数组', () => {
    const skills = getSkillsByChannel('online');
    expect(Array.isArray(skills)).toBe(true);
  });

  test('每个技能有 name、description、channels 字段', () => {
    const skills = getSkillsByChannel('online');
    for (const s of skills) {
      expect(typeof s.name).toBe('string');
      expect(typeof s.description).toBe('string');
      expect(Array.isArray(s.channels)).toBe(true);
    }
  });

  test('返回的技能都包含指定 channel', () => {
    const skills = getSkillsByChannel('online');
    for (const s of skills) {
      expect(s.channels).toContain('online');
    }
  });

  test('不存在的 channel 返回空数组', () => {
    const skills = getSkillsByChannel('nonexistent_channel_xyz');
    expect(skills).toHaveLength(0);
  });
});

describe('getSkillsDescriptionByChannel', () => {
  test('返回字符串', () => {
    const desc = getSkillsDescriptionByChannel('online');
    expect(typeof desc).toBe('string');
  });

  test('包含箭头分隔的技能描述', () => {
    const desc = getSkillsDescriptionByChannel('online');
    if (desc) {
      // 格式：description→name；description→name
      expect(desc).toContain('→');
    }
  });
});

describe('getSkillContentByChannel', () => {
  test('返回字符串', () => {
    const content = getSkillContentByChannel('online');
    expect(typeof content).toBe('string');
  });
});

describe('refreshSkillsCache', () => {
  test('调用不抛错', () => {
    expect(() => refreshSkillsCache()).not.toThrow();
  });

  test('刷新后仍能正常获取技能', () => {
    refreshSkillsCache();
    const skills = getSkillsByChannel('online');
    expect(Array.isArray(skills)).toBe(true);
  });
});

describe('getAvailableSkillsDescription (deprecated)', () => {
  test('返回字符串', () => {
    const desc = getAvailableSkillsDescription();
    expect(typeof desc).toBe('string');
  });

  test('等同于 getSkillsDescriptionByChannel("online")', () => {
    expect(getAvailableSkillsDescription()).toBe(getSkillsDescriptionByChannel('online'));
  });
});
