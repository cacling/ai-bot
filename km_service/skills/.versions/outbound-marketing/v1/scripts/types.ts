/**
 * 外呼营销类型定义
 */

/** 营销结果类型 */
export type MarketingResult =
  | 'converted'      // 成功转化，客户同意办理
  | 'callback'       // 客户需要考虑，约定回访
  | 'not_interested' // 明确拒绝
  | 'no_answer'      // 未接通
  | 'busy';          // 忙线

/** 客户异议类型 */
export type ObjectionType =
  | 'price_too_high'       // 价格太贵
  | 'current_plan_ok'      // 现在套餐够用
  | 'in_contract'          // 在合约期内
  | 'prefer_store'         // 想去营业厅办理
  | 'need_family_approval' // 需要和家人商量
  | 'other';               // 其他

/** 营销任务 */
export interface MarketingTask {
  campaign_id:   string;
  campaign_name: string;
  customer_name: string;
  customer_phone: string;
  current_plan:  string;  // 客户当前套餐名称
  target_plan:   TargetPlan;
  talk_template: string;
}

/** 推介套餐 */
export interface TargetPlan {
  plan_id:      string;
  name:         string;
  monthly_fee:  number;
  data_gb:      number;
  voice_min:    number;
  features:     string[];
  selling_points: string[];  // 核心卖点（最多3条）
  promo_note:   string;      // 活动说明
}

/** 通话记录 */
export interface MarketingCallRecord {
  campaign_id:    string;
  customer_phone: string;
  result:         MarketingResult;
  objections:     ObjectionType[];
  callback_time?: string;   // 回访时间，result=callback 时填写
  remark?:        string;
  duration_s:     number;   // 通话时长（秒）
  created_at:     string;
}
