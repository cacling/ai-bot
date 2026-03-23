/**
 * nanoid.test.ts — ID 生成器测试
 */

import { describe, test, expect } from 'bun:test';
import { nanoid } from '../../../src/db/nanoid';

describe('nanoid — ID 生成', () => {
  test('默认生成 16 位 ID', () => {
    const id = nanoid();
    expect(id).toHaveLength(16);
  });

  test('自定义长度', () => {
    expect(nanoid(8)).toHaveLength(8);
    expect(nanoid(32)).toHaveLength(32);
    expect(nanoid(1)).toHaveLength(1);
  });

  test('仅包含小写字母和数字', () => {
    const id = nanoid(100);
    expect(/^[0-9a-z]+$/.test(id)).toBe(true);
  });

  test('每次生成不同的 ID', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(nanoid());
    }
    // 100 个 ID 应该全部唯一
    expect(ids.size).toBe(100);
  });

  test('返回类型为 string', () => {
    expect(typeof nanoid()).toBe('string');
  });
});
