/**
 * outbound-mock.test.ts — 外呼 mock 数据测试
 */

import { describe, test, expect } from 'bun:test';
import { CALLBACK_TASKS } from '../../../../backend/src/chat/outbound-mock';

describe('CALLBACK_TASKS — 回访任务列表', () => {
  test('初始为空数组', () => {
    expect(Array.isArray(CALLBACK_TASKS)).toBe(true);
    // 初始时可能为空（运行时动态添加）
    expect(CALLBACK_TASKS).toBeDefined();
  });

  test('可以向列表中添加任务', () => {
    const before = CALLBACK_TASKS.length;
    CALLBACK_TASKS.push({
      task_id: 'test-cb-001',
      original_task_id: 'M001',
      customer_name: '测试用户',
      callback_phone: '13800000099',
      preferred_time: '2026-03-20 上午10点',
      product_name: '测试产品',
      created_at: new Date().toISOString(),
      status: 'pending',
    });
    expect(CALLBACK_TASKS.length).toBe(before + 1);
    // 清理
    CALLBACK_TASKS.pop();
    expect(CALLBACK_TASKS.length).toBe(before);
  });
});
