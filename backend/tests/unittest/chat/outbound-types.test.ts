/**
 * outbound-types.test.ts — 外呼类型定义测试
 */

import { describe, test, expect } from 'bun:test';
import type { CollectionCase, MarketingTask, CallbackTask } from '../../../src/chat/outbound-types';

describe('外呼类型定义', () => {
  test('CollectionCase 结构正确', () => {
    const c: CollectionCase = {
      case_id: 'C001',
      customer_name: '张三',
      overdue_amount: 500,
      overdue_days: 30,
      due_date: '2026-02-15',
      product_name: '信用卡',
      strategy: '友好催收',
    };
    expect(c.case_id).toBe('C001');
    expect(c.overdue_amount).toBe(500);
    expect(c.overdue_days).toBe(30);
  });

  test('MarketingTask 结构正确', () => {
    const m: MarketingTask = {
      campaign_id: 'M001',
      campaign_name: '春季促销',
      customer_name: '李四',
      current_plan: '基础套餐',
      target_plan_name: '豪华套餐',
      target_plan_fee: 199,
      target_plan_data: '100GB',
      target_plan_voice: '1000分钟',
      target_plan_features: ['5G 加速', '视频会员'],
      promo_note: '限时优惠',
      talk_template: '您好，我们有一个特别优惠...',
    };
    expect(m.campaign_id).toBe('M001');
    expect(m.target_plan_features).toHaveLength(2);
    expect(m.target_plan_fee).toBe(199);
  });

  test('CallbackTask 结构正确', () => {
    const cb: CallbackTask = {
      task_id: 'CB001',
      original_task_id: 'M001',
      customer_name: '王五',
      callback_phone: '13800000002',
      preferred_time: '2026-03-20 上午10点',
      product_name: '豪华套餐',
      created_at: '2026-03-18T10:00:00Z',
      status: 'pending',
    };
    expect(cb.task_id).toBe('CB001');
    expect(cb.status).toBe('pending');
    expect(cb.callback_phone).toBe('13800000002');
  });

  test('CallbackTask status 类型约束', () => {
    const statuses: CallbackTask['status'][] = ['pending', 'completed', 'cancelled'];
    expect(statuses).toHaveLength(3);
  });
});
