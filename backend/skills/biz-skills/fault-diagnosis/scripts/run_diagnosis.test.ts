/**
 * run_diagnosis.test.ts
 * 使用 Bun 内置测试运行器对诊断脚本进行单元测试
 * 运行：cd backend && bun test skills/fault-diagnosis/scripts/run_diagnosis.test.ts
 */
import { describe, test, expect } from 'bun:test';
import { runDiagnosis } from './run_diagnosis.ts';
import { checkAccount } from './check_account.ts';
import { checkData } from './check_data.ts';
import { checkCall } from './check_call.ts';
import { checkSignal } from './check_signal.ts';
import type { SubscriberContext } from './types.ts';

// ── 测试数据 ─────────────────────────────────────────────────────────────────

const activeSub: SubscriberContext = {
  status: 'active',
  data_used_gb: 32.5,
  data_total_gb: 50,
  voice_used_min: 280,
  voice_total_min: 500,
};

const suspendedSub: SubscriberContext = {
  status: 'suspended',
  data_used_gb: 10,
  data_total_gb: 10,
  voice_used_min: 200,
  voice_total_min: 200,
};

const unlimitedSub: SubscriberContext = {
  status: 'active',
  data_used_gb: 89.2,
  data_total_gb: -1,
  voice_used_min: 0,
  voice_total_min: -1,
};

// ── check_account ─────────────────────────────────────────────────────────────

describe('checkAccount', () => {
  test('账号正常时返回 ok', () => {
    const step = checkAccount(activeSub);
    expect(step.status).toBe('ok');
    expect(step.step).toBe('账号状态检查');
    expect(step.detail).toContain('正常');
  });

  test('账号停机时返回 error', () => {
    const step = checkAccount(suspendedSub);
    expect(step.status).toBe('error');
    expect(step.detail).toContain('停机');
  });
});

// ── check_signal ──────────────────────────────────────────────────────────────

describe('checkSignal', () => {
  test('返回 3 个检测步骤', () => {
    const steps = checkSignal();
    expect(steps.length).toBe(3);
  });

  test('包含基站、SIM、APN 三项检测', () => {
    const steps = checkSignal();
    const names = steps.map((s) => s.step);
    expect(names).toContain('基站信号检测');
    expect(names).toContain('SIM 卡状态');
    expect(names).toContain('APN 配置检查');
  });

  test('APN 配置返回 warning', () => {
    const steps = checkSignal();
    const apn = steps.find((s) => s.step === 'APN 配置检查');
    expect(apn?.status).toBe('warning');
  });
});

// ── check_data ────────────────────────────────────────────────────────────────

describe('checkData', () => {
  test('返回 3 个检测步骤', () => {
    const steps = checkData(activeSub);
    expect(steps.length).toBe(3);
  });

  test('流量未超 90% 时返回 ok', () => {
    // activeSub: 32.5 / 50 = 65%
    const steps = checkData(activeSub);
    const data = steps.find((s) => s.step === '流量余额检查');
    expect(data?.status).toBe('ok');
    expect(data?.detail).toContain('65%');
  });

  test('流量耗尽时返回 error', () => {
    const fullSub: SubscriberContext = { ...activeSub, data_used_gb: 50, data_total_gb: 50 };
    const steps = checkData(fullSub);
    const data = steps.find((s) => s.step === '流量余额检查');
    expect(data?.status).toBe('error');
  });

  test('流量超 90% 时返回 warning', () => {
    const nearSub: SubscriberContext = { ...activeSub, data_used_gb: 46, data_total_gb: 50 };
    const steps = checkData(nearSub);
    const data = steps.find((s) => s.step === '流量余额检查');
    expect(data?.status).toBe('warning');
  });

  test('无限流量套餐显示不限量', () => {
    const steps = checkData(unlimitedSub);
    const data = steps.find((s) => s.step === '流量余额检查');
    expect(data?.status).toBe('ok');
    expect(data?.detail).toContain('不限量');
  });
});

// ── check_call ────────────────────────────────────────────────────────────────

describe('checkCall', () => {
  test('返回 3 个检测步骤', () => {
    const steps = checkCall(activeSub);
    expect(steps.length).toBe(3);
  });

  test('计算剩余通话分钟数', () => {
    // activeSub: 500 - 280 = 220 分钟
    const steps = checkCall(activeSub);
    const voice = steps.find((s) => s.step === '通话时长余额');
    expect(voice?.detail).toContain('220');
  });

  test('不限量通话时显示不限量', () => {
    const steps = checkCall(unlimitedSub);
    const voice = steps.find((s) => s.step === '通话时长余额');
    expect(voice?.detail).toContain('不限量');
  });

  test('基站切换检测返回 warning', () => {
    const steps = checkCall(activeSub);
    const station = steps.find((s) => s.step === '基站切换检测');
    expect(station?.status).toBe('warning');
  });
});

// ── runDiagnosis 编排器 ────────────────────────────────────────────────────────

describe('runDiagnosis', () => {
  test('no_signal：返回账号+信号检测共 4 步', () => {
    const result = runDiagnosis(activeSub, 'no_signal');
    expect(result.issue_type).toBe('no_signal');
    expect(result.diagnostic_steps.length).toBe(4); // 1 account + 3 signal
  });

  test('no_network：同 no_signal，返回 4 步', () => {
    const result = runDiagnosis(activeSub, 'no_network');
    expect(result.diagnostic_steps.length).toBe(4);
  });

  test('slow_data：返回账号+流量检测共 4 步', () => {
    const result = runDiagnosis(activeSub, 'slow_data');
    expect(result.diagnostic_steps.length).toBe(4); // 1 account + 3 data
  });

  test('call_drop：返回账号+通话检测共 4 步', () => {
    const result = runDiagnosis(activeSub, 'call_drop');
    expect(result.diagnostic_steps.length).toBe(4); // 1 account + 3 call
  });

  test('账号停机时 conclusion 包含严重问题', () => {
    const result = runDiagnosis(suspendedSub, 'no_signal');
    expect(result.conclusion).toContain('严重问题');
  });

  test('账号正常但有 warning 时 conclusion 包含潜在问题', () => {
    const result = runDiagnosis(activeSub, 'slow_data');
    // slow_data 有网络拥塞 warning
    expect(result.conclusion).toContain('潜在问题');
  });

  test('结果包含必要字段', () => {
    const result = runDiagnosis(activeSub, 'call_drop');
    expect(result).toHaveProperty('issue_type');
    expect(result).toHaveProperty('diagnostic_steps');
    expect(result).toHaveProperty('conclusion');
    expect(Array.isArray(result.diagnostic_steps)).toBe(true);
  });
});
