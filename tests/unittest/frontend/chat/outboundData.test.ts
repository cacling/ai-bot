import { describe, it, expect } from 'vitest';
import { taskToCardData, findOutboundTaskByPhone } from '@/chat/outboundData';
import type { OutboundTask } from '@/chat/outboundData';

describe('outboundData', () => {
  const collectionTask: OutboundTask = {
    id: 'task-1',
    phone: '13800000001',
    task_type: 'collection',
    label: { zh: '催收任务', en: 'Collection Task' },
    data: {
      zh: {
        customer_name: '张三',
        product_name: '信用卡A',
        overdue_amount: 5000,
        overdue_days: 30,
      },
      en: {
        customer_name: 'Zhang San',
        product_name: 'Credit Card A',
        overdue_amount: 5000,
        overdue_days: 30,
      },
    },
  };

  const marketingTask: OutboundTask = {
    id: 'task-2',
    phone: '13800000002',
    task_type: 'marketing',
    label: { zh: '营销任务', en: 'Marketing Task' },
    data: {
      zh: {
        customer_name: '李四',
        current_plan: '基础套餐',
        target_plan_name: '高级套餐',
        target_plan_fee: 99,
        campaign_name: '新年促销',
      },
      en: {
        customer_name: 'Li Si',
        current_plan: 'Basic Plan',
        target_plan_name: 'Premium Plan',
        target_plan_fee: 99,
        campaign_name: 'New Year Sale',
      },
    },
  };

  describe('taskToCardData', () => {
    it('converts collection task correctly', () => {
      const result = taskToCardData(collectionTask);
      expect(result.taskType).toBe('collection');
      if (result.taskType === 'collection') {
        expect(result.name).toBe('张三');
        expect(result.phone).toBe('13800000001');
        expect(result.product).toEqual({ zh: '信用卡A', en: 'Credit Card A' });
        expect(result.amount).toBe(5000);
        expect(result.days).toBe(30);
      }
    });

    it('converts marketing task correctly', () => {
      const result = taskToCardData(marketingTask);
      expect(result.taskType).toBe('marketing');
      if (result.taskType === 'marketing') {
        expect(result.name).toBe('李四');
        expect(result.phone).toBe('13800000002');
        expect(result.currentPlan).toEqual({ zh: '基础套餐', en: 'Basic Plan' });
        expect(result.targetPlan).toEqual({ zh: '高级套餐', en: 'Premium Plan' });
        expect(result.targetFee).toBe(99);
        expect(result.campaignName).toEqual({ zh: '新年促销', en: 'New Year Sale' });
      }
    });

    it('handles missing zh data fields with defaults', () => {
      const task: OutboundTask = {
        id: 'task-3',
        phone: '13800000003',
        task_type: 'collection',
        label: { zh: '催收', en: 'Collection' },
        data: { zh: {}, en: {} },
      };
      const result = taskToCardData(task);
      if (result.taskType === 'collection') {
        expect(result.name).toBe('');
        expect(result.amount).toBe(0);
        expect(result.days).toBe(0);
        expect(result.product).toEqual({ zh: '', en: '' });
      }
    });

    it('falls back to zh data when en data is missing', () => {
      const task: OutboundTask = {
        id: 'task-4',
        phone: '13800000004',
        task_type: 'collection',
        label: { zh: '催收', en: 'Collection' },
        data: {
          zh: { customer_name: '王五', product_name: '贷款B', overdue_amount: 1000, overdue_days: 10 },
          en: undefined as any,
        },
      };
      const result = taskToCardData(task);
      if (result.taskType === 'collection') {
        // When en is undefined, falls back to zh
        expect(result.product.en).toBe('贷款B');
      }
    });
  });

  describe('findOutboundTaskByPhone', () => {
    const tasks = [collectionTask, marketingTask];

    it('finds a task by phone number', () => {
      const result = findOutboundTaskByPhone(tasks, '13800000001');
      expect(result).not.toBeNull();
      expect(result!.taskType).toBe('collection');
    });

    it('finds marketing task by phone', () => {
      const result = findOutboundTaskByPhone(tasks, '13800000002');
      expect(result).not.toBeNull();
      expect(result!.taskType).toBe('marketing');
    });

    it('returns null for unknown phone', () => {
      const result = findOutboundTaskByPhone(tasks, '99999999999');
      expect(result).toBeNull();
    });

    it('returns null for empty task list', () => {
      const result = findOutboundTaskByPhone([], '13800000001');
      expect(result).toBeNull();
    });
  });
});
