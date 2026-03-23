/**
 * tool-result.test.ts — 工具返回结果判断逻辑测试
 */

import { describe, test, expect } from 'bun:test';
import { isNoDataResult, NO_DATA_RE } from '../../../src/services/tool-result';

describe('isNoDataResult — 空数据检测', () => {
  test('检测中文"没找到"', () => {
    expect(isNoDataResult('没找到相关记录')).toBe(true);
  });

  test('检测中文"未找到"', () => {
    expect(isNoDataResult('未找到该用户')).toBe(true);
  });

  test('检测中文"不存在"', () => {
    expect(isNoDataResult('该账户不存在')).toBe(true);
  });

  test('检测中文"没有记录"', () => {
    expect(isNoDataResult('没有相关记录')).toBe(true);
  });

  test('检测中文"无记录"', () => {
    expect(isNoDataResult('查询结果：无记录')).toBe(true);
  });

  test('检测 null', () => {
    expect(isNoDataResult('result: null')).toBe(true);
  });

  test('检测英文 not found（不区分大小写）', () => {
    expect(isNoDataResult('Record not found')).toBe(true);
    expect(isNoDataResult('NOT FOUND')).toBe(true);
    expect(isNoDataResult('notfound')).toBe(true);
  });

  test('正常结果不误报', () => {
    expect(isNoDataResult('查询成功：余额 100 元')).toBe(false);
    expect(isNoDataResult('{"phone":"13800000001","balance":50}')).toBe(false);
    expect(isNoDataResult('')).toBe(false);
  });

  test('NO_DATA_RE 是 RegExp 实例', () => {
    expect(NO_DATA_RE).toBeInstanceOf(RegExp);
  });

  test('NO_DATA_RE 不区分大小写', () => {
    expect(NO_DATA_RE.flags).toContain('i');
  });
});
