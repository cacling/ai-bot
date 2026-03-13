/**
 * 银行外呼营销 Skill — 类型定义
 */

/** 通话结果类型 */
export type BankMarketingResult =
  | 'converted'       // 成功转化（客户有意向）
  | 'callback'        // 预约回访
  | 'not_interested'  // 不感兴趣
  | 'dnd'             // 加入免打扰名单
  | 'no_answer'       // 无人接听
  | 'busy';           // 占线/忙碌

/** 产品类型 */
export type BankProductType = 'loan' | 'wealth' | 'credit_card';

/** 营销任务 */
export interface BankMarketingTask {
  task_id:          string;
  bank_name:        string;
  product_type:     BankProductType;
  product_name:     string;
  customer_name:    string;
  customer_phone:   string;
  customer_segment: string;  // 如：优质客户、存量客户、高净值客户
  offer_headline:   string;  // 核心吸引点（一句话）
  offer_details:    string[]; // 产品卖点列表（2-4条）
  offer_expiry:     string;  // 活动截止日期（如 "2026-03-31"）
  talk_template:    string;  // 话术模板标识
}

/** 免打扰记录 */
export interface DndRecord {
  customer_phone: string;
  customer_name:  string;
  added_at:       string;  // ISO 8601 时间戳
  reason:         string;  // 拒绝原因（客户说的话摘要）
}

/** 回访任务 */
export interface CallbackTask {
  task_id:         string;
  original_task_id: string;
  customer_name:   string;
  callback_phone:  string;
  preferred_time:  string;  // 如 "2026-03-18 上午10点"
  product_name:    string;
  created_at:      string;  // ISO 8601 时间戳
  status:          'pending' | 'completed' | 'cancelled';
}

/** 通话记录 */
export interface BankCallRecord {
  call_id:       string;
  task_id:       string;
  customer_name: string;
  result:        BankMarketingResult;
  callback_time?: string;
  remark?:       string;
  created_at:    string;
}
