/**
 * logger.test.ts — 日志模块测试
 */

import { describe, test, expect } from 'bun:test';
import { logger } from '../../../src/services/logger';

describe('logger — 日志接口', () => {
  test('logger 对象存在且有 info/warn/error 方法', () => {
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  test('info 调用不抛错', () => {
    expect(() => logger.info('test', 'test message')).not.toThrow();
  });

  test('warn 调用不抛错', () => {
    expect(() => logger.warn('test', 'warning message')).not.toThrow();
  });

  test('error 调用不抛错', () => {
    expect(() => logger.error('test', 'error message')).not.toThrow();
  });

  test('带 extra 参数调用不抛错', () => {
    expect(() => logger.info('test', 'with extra', { key: 'value', count: 42 })).not.toThrow();
  });

  test('空 extra 对象调用不抛错', () => {
    expect(() => logger.info('test', 'with empty extra', {})).not.toThrow();
  });
});
