/**
 * run_security_diagnosis.ts
 * 安全诊断编排器
 *
 * 根据 issue_type 执行对应的多阶段检查链，实现流程图中的分支逻辑：
 *
 *   app_locked (TC1 流程)
 *   ─────────────────────────────────────────────────────────────────
 *   #1 版本检查 → error/warning → 停止，要求更新
 *              → ok → #2 近期安装应用
 *                        → error → 删除应用并重试
 *                        → ok → #3 不熟悉应用
 *                                  → error → 删除应用并重试
 *                                  → ok → #4 设备安全（VPN/GPS/远控）
 *                                              → error/warning → 修复设备环境
 *                                              → all ok → 升级至 frontline 截图审查
 *
 *   login_failed (TC2 流程)
 *   ─────────────────────────────────────────────────────────────────
 *   账号状态 → 失败次数 → 新设备检查 → OTP 送达 → 登录位置
 *
 *   device_incompatible (TC3 流程)
 *   ─────────────────────────────────────────────────────────────────
 *   版本检查 → Root/越狱 → 开发者模式 → 模拟器检测
 *
 *   suspicious_activity (TC4 流程)
 *   ─────────────────────────────────────────────────────────────────
 *   账号状态 → 登录位置 → 可疑应用（全套）→ 设备安全（全套）
 */

import { checkAppVersion } from './check_app_version.ts';
import { checkDeviceSecurity } from './check_device_security.ts';
import { checkSuspiciousApps } from './check_suspicious_apps.ts';
import { checkLoginHistory } from './check_login_history.ts';
import type {
  AppUserContext,
  SecurityCheckStep,
  SecurityDiagnosticResult,
  SecurityIssueType,
  EscalationPath,
} from './app_types.ts';

// ─── 辅助：早停策略 ───────────────────────────────────────────────────────────

/**
 * 将检查步骤逐一推入结果列表。
 * 若某步骤状态为 error，返回 true（编排器据此决定是否继续后续检查）。
 */
function pushAndCheckError(steps: SecurityCheckStep[], step: SecurityCheckStep): boolean {
  steps.push(step);
  return step.status === 'error';
}

// ─── TC1 — app_locked 排查链 ──────────────────────────────────────────────────

function runAppLockedFlow(ctx: AppUserContext): SecurityCheckStep[] {
  const steps: SecurityCheckStep[] = [];

  // #1 版本检查：版本过低时直接停止，无需继续后续检查
  const versionStep = checkAppVersion(ctx);
  if (pushAndCheckError(steps, versionStep)) return steps;

  // #2 近期安装的可疑应用
  const [recentAppsStep, unfamiliarAppsStep] = checkSuspiciousApps(ctx);
  if (pushAndCheckError(steps, recentAppsStep)) return steps;

  // #3 不熟悉的应用（只有 #2 无问题时才到达）
  if (pushAndCheckError(steps, unfamiliarAppsStep)) return steps;

  // #4 设备安全检查（VPN / GPS / 远控 / Root 等）
  const deviceSteps = checkDeviceSecurity(ctx);
  for (const step of deviceSteps) {
    if (pushAndCheckError(steps, step)) return steps;
  }

  // 所有检查均通过 → 升级至 frontline
  steps.push({
    step: '内部应用黑名单审查（待升级）',
    status: 'warning',
    detail:
      '所有自助排查项均通过，但 App 仍处于锁定状态。' +
      '需由一线客服获取客户完整应用列表截图，提交至内部安全团队与黑名单进行人工比对。',
    action:
      '请告知客户：（1）前往 设置 → 应用管理，截取完整应用列表截图；' +
      '（2）将截图通过官方渠道发送给客服；' +
      '（3）安全团队将在 1 个工作日内完成审查并通知结果。',
    escalate: true,
  });

  return steps;
}

// ─── TC2 — login_failed 排查链 ───────────────────────────────────────────────

function runLoginFailedFlow(ctx: AppUserContext): SecurityCheckStep[] {
  const steps: SecurityCheckStep[] = [];
  const loginHistory = checkLoginHistory(ctx);

  for (const step of loginHistory) {
    steps.push(step);
    // 账号已被永久锁定或标记为高风险时，无需继续
    if (step.status === 'error' && step.escalate) return steps;
  }

  return steps;
}

// ─── TC3 — device_incompatible 排查链 ────────────────────────────────────────

function runDeviceIncompatibleFlow(ctx: AppUserContext): SecurityCheckStep[] {
  const steps: SecurityCheckStep[] = [];

  // 版本检查优先
  const versionStep = checkAppVersion(ctx);
  steps.push(versionStep);

  // 设备安全全套检查（不早停，汇总所有问题给客服）
  const deviceSteps = checkDeviceSecurity(ctx);
  steps.push(...deviceSteps);

  return steps;
}

// ─── TC4 — suspicious_activity 排查链 ────────────────────────────────────────

function runSuspiciousActivityFlow(ctx: AppUserContext): SecurityCheckStep[] {
  const steps: SecurityCheckStep[] = [];

  // 账号状态 + 登录位置
  const loginHistory = checkLoginHistory(ctx);
  steps.push(...loginHistory);

  // 可疑应用（近期 + 不熟悉）
  const [recentApps, unfamiliarApps] = checkSuspiciousApps(ctx);
  steps.push(recentApps, unfamiliarApps);

  // 设备安全全套
  const deviceSteps = checkDeviceSecurity(ctx);
  steps.push(...deviceSteps);

  return steps;
}

// ─── 升级路径决策 ─────────────────────────────────────────────────────────────

function determineEscalation(steps: SecurityCheckStep[]): EscalationPath {
  if (steps.some((s) => s.escalate && s.status === 'error')) {
    return 'security_team';
  }
  if (steps.some((s) => s.escalate)) {
    return 'frontline';
  }
  if (steps.some((s) => s.status === 'error')) {
    return 'self_service';
  }
  return 'self_service';
}

// ─── 客户操作指引生成 ─────────────────────────────────────────────────────────

function buildCustomerActions(steps: SecurityCheckStep[]): string[] {
  return steps
    .filter((s) => s.action)
    .map((s) => `[${s.step}] ${s.action}`);
}

// ─── 结论文本 ─────────────────────────────────────────────────────────────────

function buildConclusion(steps: SecurityCheckStep[], issueType: SecurityIssueType): string {
  const hasError = steps.some((s) => s.status === 'error');
  const hasWarning = steps.some((s) => s.status === 'warning');
  const needsEscalation = steps.some((s) => s.escalate);

  if (needsEscalation && hasError) {
    return '诊断发现高风险问题，需升级至安全团队人工处理，请勿让客户继续尝试登录。';
  }
  if (needsEscalation) {
    return '自助排查已完成，但问题无法通过客户自行操作解决，需转一线客服获取截图并提交内部审查。';
  }
  if (hasError) {
    return '诊断发现可修复的问题，请按建议操作引导客户处理，处理完成后重新登录 App。';
  }
  if (hasWarning) {
    return '未发现严重故障，但存在潜在风险项，建议客户按提示操作后重新尝试登录。';
  }
  return '所有检查项均通过，账号和设备环境正常，请引导客户重新尝试登录。';
}

// ─── 主入口 ───────────────────────────────────────────────────────────────────

export function runSecurityDiagnosis(
  ctx: AppUserContext,
  issueType: SecurityIssueType,
): SecurityDiagnosticResult {
  const steps: SecurityCheckStep[] = (() => {
    switch (issueType) {
      case 'app_locked':
        return runAppLockedFlow(ctx);
      case 'login_failed':
        return runLoginFailedFlow(ctx);
      case 'device_incompatible':
        return runDeviceIncompatibleFlow(ctx);
      case 'suspicious_activity':
        return runSuspiciousActivityFlow(ctx);
    }
  })();

  return {
    issue_type: issueType,
    lock_reason: ctx.lock_reason,
    diagnostic_steps: steps,
    conclusion: buildConclusion(steps, issueType),
    escalation_path: determineEscalation(steps),
    customer_actions: buildCustomerActions(steps),
  };
}
