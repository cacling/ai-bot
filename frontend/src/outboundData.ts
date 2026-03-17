/**
 * outboundData.ts — outbound task types + API fetch helpers
 * Data is loaded from the backend DB via /api/outbound-tasks
 */
import type { Lang } from './i18n';

export type OutboundTaskType = 'collection' | 'marketing';

interface CollectionData {
  name: string;
  product_zh: string;
  product_en: string;
  amount: number;
  days: number;
}

interface MarketingData {
  name: string;
  current_plan_zh: string;
  current_plan_en: string;
  target_plan_zh: string;
  target_plan_en: string;
  target_fee: number;
  campaign_zh: string;
  campaign_en: string;
}

/** Raw API response shape — data contains both zh & en variants */
export interface OutboundTask {
  id: string;
  phone: string;
  task_type: OutboundTaskType;
  label: Record<Lang, string>;
  data: Record<Lang, Record<string, unknown>>;
}

export type OutboundTaskData =
  | { taskType: 'collection';     name: string; phone: string; product: Record<Lang, string>; amount: number; days: number }
  | { taskType: 'marketing';      name: string; phone: string; currentPlan: Record<Lang, string>; targetPlan: Record<Lang, string>; targetFee: number; campaignName: Record<Lang, string> };

export async function fetchOutboundTasks(): Promise<OutboundTask[]> {
  const res = await fetch('/api/outbound-tasks');
  if (!res.ok) throw new Error('Failed to fetch outbound tasks');
  return res.json() as Promise<OutboundTask[]>;
}

/** Convert raw API task to the card-compatible OutboundTaskData shape */
export function taskToCardData(task: OutboundTask): OutboundTaskData {
  const zh = task.data.zh ?? {};
  const en = task.data.en ?? zh;

  if (task.task_type === 'collection') {
    return {
      taskType: 'collection',
      name: (zh.customer_name ?? '') as string,
      phone: task.phone,
      product: { zh: (zh.product_name ?? '') as string, en: (en.product_name ?? '') as string },
      amount: (zh.overdue_amount ?? 0) as number,
      days: (zh.overdue_days ?? 0) as number,
    };
  }
  // marketing
  return {
    taskType: 'marketing',
    name: (zh.customer_name ?? '') as string,
    phone: task.phone,
    currentPlan: { zh: (zh.current_plan ?? '') as string, en: (en.current_plan ?? '') as string },
    targetPlan: { zh: (zh.target_plan_name ?? '') as string, en: (en.target_plan_name ?? '') as string },
    targetFee: (zh.target_plan_fee ?? 0) as number,
    campaignName: { zh: (zh.campaign_name ?? '') as string, en: (en.campaign_name ?? '') as string },
  };
}

/** Find outbound task card data by phone from a pre-fetched task list */
export function findOutboundTaskByPhone(tasks: OutboundTask[], phone: string): OutboundTaskData | null {
  const task = tasks.find(t => t.phone === phone);
  return task ? taskToCardData(task) : null;
}
