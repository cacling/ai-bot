/**
 * outboundData.ts — outbound task types + API fetch helpers
 * Data is loaded from the backend DB via /api/outbound-tasks
 */
import type { Lang } from './i18n';

export type OutboundTaskType = 'collection' | 'marketing' | 'bank-marketing';

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

interface BankMarketingData {
  name: string;
  bank_zh: string;
  bank_en: string;
  product_name_zh: string;
  product_name_en: string;
  product_type: 'loan' | 'wealth' | 'credit_card';
  headline_zh: string;
  headline_en: string;
  expiry: string;
  segment_zh: string;
  segment_en: string;
}

export interface OutboundTask {
  id: string;
  phone: string;
  task_type: OutboundTaskType;
  label: Record<Lang, string>;
  data: CollectionData | MarketingData | BankMarketingData;
}

export type OutboundTaskData =
  | { taskType: 'collection';     name: string; phone: string; product: Record<Lang, string>; amount: number; days: number }
  | { taskType: 'marketing';      name: string; phone: string; currentPlan: Record<Lang, string>; targetPlan: Record<Lang, string>; targetFee: number; campaignName: Record<Lang, string> }
  | { taskType: 'bank-marketing'; name: string; phone: string; bankName: Record<Lang, string>; productName: Record<Lang, string>; headline: Record<Lang, string>; expiry: string; segment: Record<Lang, string> };

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
  if (task.task_type === 'marketing') {
    const d = task.data as MarketingData;
    return { taskType: 'marketing', name: d.name, phone: task.phone, currentPlan: { zh: d.current_plan_zh, en: d.current_plan_en }, targetPlan: { zh: d.target_plan_zh, en: d.target_plan_en }, targetFee: d.target_fee, campaignName: { zh: d.campaign_zh, en: d.campaign_en } };
  }
  // bank-marketing
  const d = task.data as BankMarketingData;
  return { taskType: 'bank-marketing', name: d.name, phone: task.phone, bankName: { zh: d.bank_zh, en: d.bank_en }, productName: { zh: d.product_name_zh, en: d.product_name_en }, headline: { zh: d.headline_zh, en: d.headline_en }, expiry: d.expiry, segment: { zh: d.segment_zh, en: d.segment_en } };
}

/** Find outbound task card data by phone from a pre-fetched task list */
export function findOutboundTaskByPhone(tasks: OutboundTask[], phone: string): OutboundTaskData | null {
  const task = tasks.find(t => t.phone === phone);
  return task ? taskToCardData(task) : null;
}
