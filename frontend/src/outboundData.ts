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

export interface OutboundTask {
  id: string;
  phone: string;
  task_type: OutboundTaskType;
  label: Record<Lang, string>;
  data: CollectionData | MarketingData;
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
  if (task.task_type === 'collection') {
    const d = task.data as CollectionData;
    return { taskType: 'collection', name: d.name, phone: task.phone, product: { zh: d.product_zh, en: d.product_en }, amount: d.amount, days: d.days };
  }
  // marketing
  const d = task.data as MarketingData;
  return { taskType: 'marketing', name: d.name, phone: task.phone, currentPlan: { zh: d.current_plan_zh, en: d.current_plan_en }, targetPlan: { zh: d.target_plan_zh, en: d.target_plan_en }, targetFee: d.target_fee, campaignName: { zh: d.campaign_zh, en: d.campaign_en } };
}

/** Find outbound task card data by phone from a pre-fetched task list */
export function findOutboundTaskByPhone(tasks: OutboundTask[], phone: string): OutboundTaskData | null {
  const task = tasks.find(t => t.phone === phone);
  return task ? taskToCardData(task) : null;
}
