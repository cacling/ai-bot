// 外呼催收 — 共享类型定义

// ─── 催收策略类型 ──────────────────────────────────────────────────────────────

/**
 * light   轻催：语气温和，以提醒为主
 * medium  中催：适度提示逾期影响
 * strong  强催：明确告知后续措施
 */
export type CollectionStrategy = 'light' | 'medium' | 'strong';

// ─── 案件信息（由催收任务平台下发） ──────────────────────────────────────────

export interface CollectionCase {
  task_id: string;
  phone: string;
  customer_name: string;
  product_name: string;           // 产品名称，如"宽带包年套餐"
  overdue_amount: number;         // 逾期金额（元）
  overdue_days: number;           // 逾期天数
  due_date: string;               // 应还日期，格式 YYYY-MM-DD
  strategy: CollectionStrategy;
  max_retry: number;              // 最大重拨次数
  max_ptp_days: number;           // 承诺还款最大允许天数（通常 ≤ 7）
  force_transfer: boolean;        // 是否强制触发转人工
  talk_template_id: string;       // 话术模板 ID
  allowed_hours: [number, number]; // 允许拨打时段，如 [8, 21]
}

// ─── 身份核验 ─────────────────────────────────────────────────────────────────

export type VerifyMethod = 'name' | 'id_last4' | 'birthday' | 'phone_last4';

export interface IdentityVerifyResult {
  passed: boolean;
  method_used: VerifyMethod[];
  is_owner: boolean;              // false = 非本人接听
}

// ─── 客户意向 ─────────────────────────────────────────────────────────────────

/**
 * ptp       承诺还款（Promise To Pay）
 * refusal   明确拒绝
 * dispute   提出异议
 * transfer  主动要求转人工
 */
export type IntentType = 'ptp' | 'refusal' | 'dispute' | 'transfer';

/**
 * paid          客户称已还款
 * amount_wrong  金额有误
 * not_owner     非本人借款
 * other         其他异议
 */
export type DisputeType = 'paid' | 'amount_wrong' | 'not_owner' | 'other';

export interface PtpDetail {
  promise_date: string;           // 承诺还款日期，格式 YYYY-MM-DD
  payment_method: string;         // 还款方式，如"App缴费"
}

export interface DisputeDetail {
  dispute_type: DisputeType;
  description: string;            // 客户描述的异议内容
}

// ─── 情绪标签（由 NLU 系统输出） ─────────────────────────────────────────────

/**
 * neutral    平静
 * anxious    焦虑
 * anger      愤怒
 * high_risk  高风险（含法律投诉意向等）
 */
export type EmotionLabel = 'neutral' | 'anxious' | 'anger' | 'high_risk';

// ─── 通话结果 ─────────────────────────────────────────────────────────────────

export type CallResult =
  | 'ptp'             // 承诺还款
  | 'refusal'         // 明确拒绝
  | 'dispute'         // 提出异议
  | 'transfer'        // 已转人工
  | 'verify_failed'   // 身份核验失败
  | 'non_owner'       // 非本人接听
  | 'no_answer'       // 未接通
  | 'busy'            // 忙线
  | 'power_off'       // 关机/停机
  | 'callback_request'; // 客户要求回电

export interface CallRecord {
  task_id: string;
  phone: string;
  call_result: CallResult;
  intent_type?: IntentType;
  emotion_label?: EmotionLabel;
  ptp_detail?: PtpDetail;
  dispute_detail?: DisputeDetail;
  sms_sent: boolean;
  transferred_to_agent: boolean;
  duration_seconds: number;
  notes?: string;
}

// ─── 重试策略（由案件系统返回） ──────────────────────────────────────────────

export interface RetryStrategy {
  retry_count: number;            // 当前已重试次数
  next_retry_at: string;          // 下次拨打时间，ISO 格式
  remaining_retries: number;      // 剩余可重试次数
}
