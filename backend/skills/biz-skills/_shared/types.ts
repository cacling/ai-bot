/**
 * 业务 Skill 公共基础类型
 *
 * 各 Skill 的 scripts/types.ts 可继承这些接口进行扩展，
 * 无需重复定义通用字段。
 */

// ─── 诊断类（inbound 场景） ─────────────────────────────────────────────────

/** 诊断步骤基础接口 */
export interface BaseCheckStep {
  step: string;                          // 检查项名称
  status: 'ok' | 'warning' | 'error';   // 状态
  detail: string;                        // 详细说明
  action?: string;                       // 建议操作（warning/error 时必填）
  escalate?: boolean;                    // 是否需要升级处理
}

/** 诊断结果基础接口 */
export interface BaseDiagnosticResult {
  issue_type: string;
  diagnostic_steps: BaseCheckStep[];
  conclusion: string;
}

// ─── 外呼类（outbound 场景） ────────────────────────────────────────────────

/** 通话记录基础接口 */
export interface BaseCallRecord {
  task_id: string;
  phone: string;
  result: string;
  duration_seconds: number;
  sms_sent: boolean;
  transferred_to_agent: boolean;
  notes?: string;
}
