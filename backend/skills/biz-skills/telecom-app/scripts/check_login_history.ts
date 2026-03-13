/**
 * check_login_history.ts
 * TC2 — 登录历史与账号状态检查
 *
 * 适用于 issue_type = 'login_failed' | 'suspicious_activity'
 * 涵盖以下检测项（每项独立返回一个 Step）：
 *
 *   A. 连续失败次数（密码/OTP 错误触发锁定）
 *   B. 账号冻结状态（临时 vs 永久）
 *   C. 新设备首次登录（设备注册未完成）
 *   D. OTP 送达问题（短信/邮件未收到）
 *   E. 登录地点异常（异地 / 跨境登录）
 */
import type { AppUserContext, SecurityCheckStep } from './types.ts';

// ─── A. 连续失败次数 ───────────────────────────────────────────────────────────

export function checkFailedAttempts(ctx: AppUserContext): SecurityCheckStep {
  const { failed_attempts } = ctx;

  if (failed_attempts === 0) {
    return {
      step: '登录失败次数检查',
      status: 'ok',
      detail: '无连续登录失败记录，密码认证状态正常。',
    };
  }

  if (failed_attempts < 3) {
    return {
      step: '登录失败次数检查',
      status: 'warning',
      detail: `检测到 ${failed_attempts} 次连续登录失败。当前未触发锁定，但需注意：累计 5 次将触发 24 小时临时锁定。`,
      action: '请协助客户确认密码是否正确，或引导使用"忘记密码"功能重置。',
    };
  }

  if (failed_attempts < 5) {
    return {
      step: '登录失败次数检查',
      status: 'warning',
      detail: `检测到 ${failed_attempts} 次连续登录失败，距离触发锁定仅剩 ${5 - failed_attempts} 次。`,
      action: '请立即停止尝试密码，引导客户使用"忘记密码"功能重置密码，避免账号被锁定。',
    };
  }

  return {
    step: '登录失败次数检查',
    status: 'error',
    detail: `检测到 ${failed_attempts} 次连续登录失败，已达锁定阈值，账号已被临时冻结。`,
    action:
      '账号因多次登录失败已被临时锁定（通常 24 小时后自动解锁）。' +
      '如需提前解锁，请引导客户完成身份验证（如视频核身或营业厅核查），由客服手动解锁。',
  };
}

// ─── B. 账号冻结状态 ──────────────────────────────────────────────────────────

export function checkAccountStatus(ctx: AppUserContext): SecurityCheckStep {
  switch (ctx.account_status) {
    case 'active':
      return {
        step: '账号状态检查',
        status: 'ok',
        detail: '账号状态正常，未处于冻结或限制状态。',
      };

    case 'temp_locked':
      return {
        step: '账号状态检查',
        status: 'error',
        detail: `账号当前处于临时锁定状态（原因：${describeLockReason(ctx.lock_reason)}）。`,
        action:
          '临时锁定通常 24 小时后自动解除。如需立即解锁，请完成身份核验流程，或前往营业厅出示证件办理人工解锁。',
      };

    case 'flagged':
      return {
        step: '账号状态检查',
        status: 'error',
        detail: '账号已被风控系统标记，存在异常交易或登录行为。账号功能已受到限制。',
        action: '请将问题升级至安全团队，由专员进行人工审查。在审查完成前，请提示客户暂停账号操作。',
        escalate: true,
      };

    case 'perm_locked':
      return {
        step: '账号状态检查',
        status: 'error',
        detail: '账号已被永久锁定，无法通过自助流程解锁。',
        action: '请将问题升级至安全团队，引导客户携带有效证件前往营业厅办理账号申诉及重新开户流程。',
        escalate: true,
      };
  }
}

function describeLockReason(reason: AppUserContext['lock_reason']): string {
  const map: Record<AppUserContext['lock_reason'], string> = {
    too_many_attempts: '多次登录失败',
    security_flag: '触发风控规则',
    device_change: '新设备未完成验证',
    manual_lock: '客服或用户手动锁定',
    unknown: '原因未知',
  };
  return map[reason];
}

// ─── C. 新设备首次登录 ────────────────────────────────────────────────────────

export function checkNewDevice(ctx: AppUserContext): SecurityCheckStep {
  if (!ctx.new_device) {
    return {
      step: '设备注册状态检查',
      status: 'ok',
      detail: '当前设备已为已注册设备，无需额外验证。',
    };
  }

  return {
    step: '设备注册状态检查',
    status: 'warning',
    detail: '检测到用户正在使用新设备（首次在该设备上登录）。App 需要完成额外的设备注册验证。',
    action:
      '请引导客户完成设备注册流程：' +
      '（1）登录时选择"这是我的新设备"；' +
      '（2）通过已注册邮箱或短信接收验证码；' +
      '（3）完成身份核验后，设备将自动注册。如客户无法接收验证码，进入 OTP 排查流程。',
  };
}

// ─── D. OTP 送达问题 ──────────────────────────────────────────────────────────

export function checkOtpDelivery(ctx: AppUserContext): SecurityCheckStep {
  if (!ctx.otp_delivery_issue) {
    return {
      step: 'OTP 验证码送达检查',
      status: 'ok',
      detail: 'OTP 验证码送达渠道正常，无延迟或失败记录。',
    };
  }

  return {
    step: 'OTP 验证码送达检查',
    status: 'error',
    detail: '检测到 OTP 验证码送达异常（短信或邮件未成功送达）。',
    action:
      '请按以下顺序排查：' +
      '（1）确认客户当前手机号/邮箱是否与账号注册信息一致；' +
      '（2）确认手机信号正常，未被设置为勿扰模式；' +
      '（3）等待 2 分钟后点击"重新发送"；' +
      '（4）如仍未收到，请尝试切换验证方式（短信 ↔ 邮箱）；' +
      '（5）如所有渠道均失败，需升级至人工客服核身后手动完成注册。',
    escalate: false,
  };
}

// ─── E. 异地 / 跨境登录 ───────────────────────────────────────────────────────

export function checkLoginLocation(ctx: AppUserContext): SecurityCheckStep {
  if (!ctx.login_location_changed) {
    return {
      step: '登录位置检查',
      status: 'ok',
      detail: '登录位置与历史记录一致，未检测到异地登录风险。',
    };
  }

  return {
    step: '登录位置检查',
    status: 'warning',
    detail:
      '检测到本次登录位置与上次成功登录位置不一致（可能为异地或跨境登录）。' +
      '这可能是正常的出行，也可能是账号被未授权访问的信号。',
    action:
      '请向客户确认：（1）是否为本人在新地点登录（出差/旅行）；' +
      '（2）如是本人，引导完成额外验证（OTP/人脸核身）后正常使用；' +
      '（3）如客户否认该次登录，请立即升级至安全团队并引导客户挂失账号。',
    escalate: false,
  };
}

// ─── 联合入口 ─────────────────────────────────────────────────────────────────

/** 返回全部登录历史相关检查步骤（供编排器使用） */
export function checkLoginHistory(ctx: AppUserContext): SecurityCheckStep[] {
  return [
    checkAccountStatus(ctx),
    checkFailedAttempts(ctx),
    checkNewDevice(ctx),
    checkOtpDelivery(ctx),
    checkLoginLocation(ctx),
  ];
}
