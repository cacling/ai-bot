// 营业厅 App 安全诊断 — 共享类型定义

// ─── 故障大类 ────────────────────────────────────────────────────────────────

/**
 * app_locked         App 被安全锁定，用户无法登录
 * login_failed       登录失败（密码/OTP 错误、账号冻结）
 * device_incompatible 设备安全检测不通过（Root/越狱/模拟器等）
 * suspicious_activity 检测到可疑操作，账号被风控限制
 */
export type SecurityIssueType =
  | 'app_locked'
  | 'login_failed'
  | 'device_incompatible'
  | 'suspicious_activity';

// ─── 锁定原因 ─────────────────────────────────────────────────────────────────

export type LockReason =
  | 'too_many_attempts'   // 密码/OTP 错误次数超限
  | 'security_flag'       // 风控系统标记（可疑应用 / 环境异常）
  | 'device_change'       // 新设备首次登录未完成验证
  | 'manual_lock'         // 用户/客服手动锁定
  | 'unknown';

// ─── 用户与设备上下文（由后端 API 注入） ────────────────────────────────────

export interface AppUserContext {
  // 账号信息
  account_status: 'active' | 'temp_locked' | 'perm_locked' | 'flagged';
  lock_reason: LockReason;
  failed_attempts: number;          // 连续失败次数
  last_successful_login_days: number; // 距上次成功登录的天数

  // App 版本信息
  installed_app_version: string;    // 用户当前安装版本，如 "5.1.2"
  latest_app_version: string;       // 最新版本，如 "5.3.0"

  // 设备安全状态
  device_os: 'ios' | 'android';
  os_version: string;               // 如 "Android 13" / "iOS 17.4"
  device_rooted: boolean;           // Root / 越狱
  developer_mode_on: boolean;       // 开发者模式
  running_on_emulator: boolean;     // 模拟器环境

  // 可疑环境标志
  has_vpn_active: boolean;
  has_fake_gps: boolean;
  has_remote_access_app: boolean;   // TeamViewer / AnyDesk 等
  has_screen_share_active: boolean; // 屏幕共享进行中

  // 可疑应用列表（后端与黑名单比对后输出）
  flagged_apps: string[];           // 命中黑名单的应用包名

  // 登录行为
  login_location_changed: boolean;  // 与上次登录国家/城市不同
  new_device: boolean;              // 首次在该设备登录
  otp_delivery_issue: boolean;      // OTP 短信/邮件未送达
}

// ─── 诊断步骤结果 ─────────────────────────────────────────────────────────────

export type StepStatus = 'ok' | 'warning' | 'error';

export interface SecurityCheckStep {
  step: string;          // 检查项名称
  status: StepStatus;
  detail: string;        // 详细说明
  action?: string;       // 建议客户执行的操作（warning/error 时必填）
  escalate?: boolean;    // true = 需转人工/升级处理
}

// ─── 升级路径 ─────────────────────────────────────────────────────────────────

/**
 * self_service   用户可自助解决
 * frontline      转一线客服处理（截图审查、人工解锁等）
 * security_team  转安全团队处理（账号被盗/高风险操作）
 */
export type EscalationPath = 'self_service' | 'frontline' | 'security_team';

// ─── 最终诊断结果 ─────────────────────────────────────────────────────────────

export interface SecurityDiagnosticResult {
  issue_type: SecurityIssueType;
  lock_reason: LockReason;
  diagnostic_steps: SecurityCheckStep[];
  conclusion: string;
  escalation_path: EscalationPath;
  customer_actions: string[];   // 给客户的分步操作指引（ordered list）
}
