/**
 * outbound.ts — 外呼任务类型定义
 */

export interface CollectionCase {
  case_id:        string;
  customer_name:  string;
  overdue_amount: number;
  overdue_days:   number;
  due_date:       string;
  product_name:   string;
  strategy:       string;
}

export interface MarketingTask {
  campaign_id:    string;
  campaign_name:  string;
  customer_name:  string;
  current_plan:   string;
  target_plan_name: string;
  target_plan_fee:  number;
  target_plan_data: string;
  target_plan_voice: string;
  target_plan_features: string[];
  promo_note:     string;
  talk_template:  string;
}

export interface CallbackTask {
  task_id:          string;
  original_task_id: string;
  customer_name:    string;
  callback_phone:   string;
  preferred_time:   string;
  product_name:     string;
  created_at:       string;
  status:           'pending' | 'completed' | 'cancelled';
}
