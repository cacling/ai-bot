import { describe, it, expect } from 'vitest';
import { runSecurityDiagnosis } from './run_security_diagnosis.ts';
import type { AppUserContext } from './types.ts';

// ─── 基础 Context 工厂 ────────────────────────────────────────────────────────

function baseCtx(overrides: Partial<AppUserContext> = {}): AppUserContext {
  return {
    account_status: 'active',
    lock_reason: 'unknown',
    failed_attempts: 0,
    last_successful_login_days: 1,
    installed_app_version: '5.3.0',
    latest_app_version: '5.3.0',
    device_os: 'android',
    os_version: 'Android 14',
    device_rooted: false,
    developer_mode_on: false,
    running_on_emulator: false,
    has_vpn_active: false,
    has_fake_gps: false,
    has_remote_access_app: false,
    has_screen_share_active: false,
    flagged_apps: [],
    login_location_changed: false,
    new_device: false,
    otp_delivery_issue: false,
    ...overrides,
  };
}

// ─── TC1 app_locked ───────────────────────────────────────────────────────────

describe('TC1 · app_locked', () => {
  it('版本过旧（主版本差异）→ 立即停止，不检查后续项', () => {
    const ctx = baseCtx({ installed_app_version: '4.9.0', latest_app_version: '5.3.0' });
    const result = runSecurityDiagnosis(ctx, 'app_locked');

    expect(result.diagnostic_steps).toHaveLength(1);
    expect(result.diagnostic_steps[0].step).toBe('应用版本检查');
    expect(result.diagnostic_steps[0].status).toBe('error');
    expect(result.escalation_path).toBe('self_service');
    expect(result.customer_actions).toHaveLength(1);
  });

  it('版本正常，命中黑名单应用 → #2 报 error，停止后续检查', () => {
    const ctx = baseCtx({ flagged_apps: ['com.lexa.fakegps'] });
    const result = runSecurityDiagnosis(ctx, 'app_locked');

    const steps = result.diagnostic_steps;
    expect(steps[0].step).toBe('应用版本检查');
    expect(steps[0].status).toBe('ok');
    expect(steps[1].step).toBe('近期安装应用检查（#2）');
    expect(steps[1].status).toBe('error');
    // 因 #2 已报 error，不应继续到 #3
    expect(steps).toHaveLength(2);
  });

  it('版本正常，无黑名单应用，但设备 Root → #4 报 error', () => {
    const ctx = baseCtx({ device_rooted: true });
    const result = runSecurityDiagnosis(ctx, 'app_locked');

    const rootStep = result.diagnostic_steps.find((s) => s.step === 'Root / 越狱检测');
    expect(rootStep?.status).toBe('error');
    expect(rootStep?.escalate).toBe(true);
    expect(result.escalation_path).toBe('security_team');
  });

  it('版本正常，设备 VPN 开启 → #4 报 warning，不早停', () => {
    const ctx = baseCtx({ has_vpn_active: true });
    const result = runSecurityDiagnosis(ctx, 'app_locked');

    const vpnStep = result.diagnostic_steps.find((s) => s.step === 'VPN / 代理检测');
    expect(vpnStep?.status).toBe('warning');
  });

  it('全部检查通过 → 升级至 frontline 截图审查', () => {
    const ctx = baseCtx();
    const result = runSecurityDiagnosis(ctx, 'app_locked');

    const lastStep = result.diagnostic_steps.at(-1);
    expect(lastStep?.step).toBe('内部应用黑名单审查（待升级）');
    expect(lastStep?.escalate).toBe(true);
    expect(result.escalation_path).toBe('frontline');
  });

  it('屏幕共享进行中 → 升级至 security_team', () => {
    const ctx = baseCtx({ has_screen_share_active: true });
    const result = runSecurityDiagnosis(ctx, 'app_locked');

    const screenStep = result.diagnostic_steps.find((s) => s.step === '远程控制 / 屏幕共享检测');
    expect(screenStep?.status).toBe('error');
    expect(screenStep?.escalate).toBe(true);
    expect(result.escalation_path).toBe('security_team');
  });
});

// ─── TC2 login_failed ─────────────────────────────────────────────────────────

describe('TC2 · login_failed', () => {
  it('账号正常，无失败记录 → 全部 ok', () => {
    const ctx = baseCtx({ account_status: 'active', failed_attempts: 0 });
    const result = runSecurityDiagnosis(ctx, 'login_failed');

    expect(result.diagnostic_steps.every((s) => s.status === 'ok')).toBe(true);
    expect(result.escalation_path).toBe('self_service');
  });

  it('失败次数 4 次 → warning，提示避免再试', () => {
    const ctx = baseCtx({ failed_attempts: 4 });
    const result = runSecurityDiagnosis(ctx, 'login_failed');

    const failStep = result.diagnostic_steps.find((s) => s.step === '登录失败次数检查');
    expect(failStep?.status).toBe('warning');
  });

  it('账号 perm_locked → 提前停止，升级至 security_team', () => {
    const ctx = baseCtx({ account_status: 'perm_locked', lock_reason: 'manual_lock' });
    const result = runSecurityDiagnosis(ctx, 'login_failed');

    const accountStep = result.diagnostic_steps.find((s) => s.step === '账号状态检查');
    expect(accountStep?.status).toBe('error');
    expect(accountStep?.escalate).toBe(true);
    expect(result.escalation_path).toBe('security_team');
  });

  it('新设备首次登录 + OTP 未送达 → 两项均报问题', () => {
    const ctx = baseCtx({ new_device: true, otp_delivery_issue: true });
    const result = runSecurityDiagnosis(ctx, 'login_failed');

    const deviceStep = result.diagnostic_steps.find((s) => s.step === '设备注册状态检查');
    const otpStep = result.diagnostic_steps.find((s) => s.step === 'OTP 验证码送达检查');
    expect(deviceStep?.status).toBe('warning');
    expect(otpStep?.status).toBe('error');
  });

  it('异地登录但账号未被锁定 → warning + action 指引', () => {
    const ctx = baseCtx({ login_location_changed: true });
    const result = runSecurityDiagnosis(ctx, 'login_failed');

    const locationStep = result.diagnostic_steps.find((s) => s.step === '登录位置检查');
    expect(locationStep?.status).toBe('warning');
    expect(locationStep?.action).toBeTruthy();
  });
});

// ─── TC3 device_incompatible ──────────────────────────────────────────────────

describe('TC3 · device_incompatible', () => {
  it('设备一切正常 → 全部 ok', () => {
    const ctx = baseCtx();
    const result = runSecurityDiagnosis(ctx, 'device_incompatible');

    expect(result.diagnostic_steps.every((s) => s.status === 'ok')).toBe(true);
  });

  it('开发者模式 + 假 GPS → 两项报 warning/error', () => {
    const ctx = baseCtx({ developer_mode_on: true, has_fake_gps: true });
    const result = runSecurityDiagnosis(ctx, 'device_incompatible');

    const devStep = result.diagnostic_steps.find((s) => s.step === '开发者模式检测');
    const gpsStep = result.diagnostic_steps.find((s) => s.step === '虚假 GPS 应用检测');
    expect(devStep?.status).toBe('warning');
    expect(gpsStep?.status).toBe('error');
  });

  it('模拟器环境 → error + escalate', () => {
    const ctx = baseCtx({ running_on_emulator: true });
    const result = runSecurityDiagnosis(ctx, 'device_incompatible');

    const emulatorStep = result.diagnostic_steps.find((s) => s.step === '模拟器环境检测');
    expect(emulatorStep?.status).toBe('error');
    expect(emulatorStep?.escalate).toBe(true);
  });
});

// ─── TC4 suspicious_activity ─────────────────────────────────────────────────

describe('TC4 · suspicious_activity', () => {
  it('账号被标记（flagged）→ escalate 至 security_team', () => {
    const ctx = baseCtx({
      account_status: 'flagged',
      lock_reason: 'security_flag',
      login_location_changed: true,
    });
    const result = runSecurityDiagnosis(ctx, 'suspicious_activity');

    expect(result.escalation_path).toBe('security_team');
  });

  it('可疑应用 + 远程控制组合 → 多项 error', () => {
    const ctx = baseCtx({
      flagged_apps: ['com.teamviewer.teamviewer'],
      has_remote_access_app: true,
    });
    const result = runSecurityDiagnosis(ctx, 'suspicious_activity');

    const appStep = result.diagnostic_steps.find((s) => s.step === '近期安装应用检查（#2）');
    const remoteStep = result.diagnostic_steps.find((s) => s.step === '远程控制 / 屏幕共享检测');
    expect(appStep?.status).toBe('error');
    expect(remoteStep?.status).toBe('error');
  });

  it('全部正常 → 结论包含"账号和设备环境正常"', () => {
    const ctx = baseCtx();
    const result = runSecurityDiagnosis(ctx, 'suspicious_activity');

    expect(result.conclusion).toContain('正常');
    expect(result.escalation_path).toBe('self_service');
  });
});
