/**
 * API tests for: src/services/account_service.ts (Port: 18007)
 * Tools: verify_identity, check_account_balance, check_contracts, apply_service_suspension
 * Mock: backendGet/backendPost (mock_apis HTTP calls)
 */
import { describe, test, expect, beforeAll } from 'bun:test';
import { mockBackend, loadService, createTestClient, callTool } from './helpers';
import { type Client } from '@modelcontextprotocol/sdk/client/index.js';

let client: Client;

beforeAll(async () => {
  const createServer = await loadService('src/services/account_service.ts');
  client = await createTestClient(createServer);
});

// ── verify_identity ─────────────────────────────────────────────────────────

describe('verify_identity', () => {
  test('returns verified:true with customer_name for correct OTP', async () => {
    mockBackend({
      post: (path) => {
        if (path === '/api/identity/verify') {
          return { success: true, verified: true, customer_name: 'Zhang San' };
        }
      },
    });

    const res = await callTool(client, 'verify_identity', {
      phone: '13800001111',
      otp: '123456',
    });

    expect(res.verified).toBe(true);
    expect(res.customer_name).toBe('Zhang San');
    expect(res.verification_method).toBe('otp');
  });

  test('returns verified:false for incorrect OTP', async () => {
    mockBackend({
      post: () => ({ success: true, verified: false, message: 'Invalid OTP' }),
    });

    const res = await callTool(client, 'verify_identity', {
      phone: '13800001111',
      otp: '000000',
    });

    expect(res.verified).toBe(false);
    expect(res.customer_name).toBeNull();
    expect(res.verification_method).toBe('otp');
  });

  test('returns verified:false when backend throws', async () => {
    mockBackend({
      post: () => { throw new Error('service unavailable'); },
    });

    const res = await callTool(client, 'verify_identity', {
      phone: '13800009999',
      otp: '123456',
    });

    expect(res.verified).toBe(false);
    expect(res.customer_name).toBeNull();
    expect(res.verification_method).toBe('otp');
  });
});

// ── check_account_balance ───────────────────────────────────────────────────

describe('check_account_balance', () => {
  test('returns balance, has_arrears, arrears_amount, status for valid phone', async () => {
    mockBackend({
      get: (path) => {
        if (path.includes('/account-summary')) {
          return {
            success: true,
            balance: 128.50,
            has_arrears: false,
            arrears_amount: 0,
            status: 'active',
          };
        }
      },
    });

    const res = await callTool(client, 'check_account_balance', {
      phone: '13800001111',
    });

    expect(res.phone).toBe('13800001111');
    expect(res.balance).toBe(128.50);
    expect(res.has_arrears).toBe(false);
    expect(res.arrears_amount).toBe(0);
    expect(res.status).toBe('active');
  });

  test('returns arrears info when account has arrears', async () => {
    mockBackend({
      get: () => ({
        success: true,
        balance: -50.00,
        has_arrears: true,
        arrears_amount: 50.00,
        status: 'suspended',
      }),
    });

    const res = await callTool(client, 'check_account_balance', {
      phone: '13800002222',
    });

    expect(res.balance).toBe(-50.00);
    expect(res.has_arrears).toBe(true);
    expect(res.arrears_amount).toBe(50.00);
    expect(res.status).toBe('suspended');
  });

  test('returns defaults when backend returns success:false', async () => {
    mockBackend({
      get: () => ({ success: false }),
    });

    const res = await callTool(client, 'check_account_balance', {
      phone: '13800009999',
    });

    expect(res.phone).toBe('13800009999');
    expect(res.balance).toBe(0);
    expect(res.has_arrears).toBe(false);
    expect(res.arrears_amount).toBe(0);
    expect(res.status).toBeNull();
  });

  test('returns defaults when backend throws', async () => {
    mockBackend({
      get: () => { throw new Error('timeout'); },
    });

    const res = await callTool(client, 'check_account_balance', {
      phone: '13800009999',
    });

    expect(res.balance).toBe(0);
    expect(res.has_arrears).toBe(false);
    expect(res.arrears_amount).toBe(0);
    expect(res.status).toBeNull();
  });
});

// ── check_contracts ─────────────────────────────────────────────────────────

describe('check_contracts', () => {
  test('returns only active contracts, filters out expired', async () => {
    mockBackend({
      get: () => ({
        success: true,
        contracts: [
          { id: 'C001', name: '5G Plan', status: 'active', risk_level: 'low' },
          { id: 'C002', name: 'Old Plan', status: 'expired', risk_level: 'low' },
          { id: 'C003', name: 'Data Add-on', status: 'active', risk_level: 'low' },
        ],
      }),
    });

    const res = await callTool(client, 'check_contracts', {
      phone: '13800001111',
    });

    expect(res.phone).toBe('13800001111');
    const contracts = res.contracts as any[];
    expect(contracts.length).toBe(2);
    expect(contracts.every((c: any) => c.status === 'active')).toBe(true);
    expect(res.has_active_contracts).toBe(true);
    expect(res.has_high_risk).toBe(false);
  });

  test('flags has_high_risk when any active contract has risk_level=high', async () => {
    mockBackend({
      get: () => ({
        success: true,
        contracts: [
          { id: 'C001', name: '5G Plan', status: 'active', risk_level: 'low' },
          { id: 'C002', name: 'Premium Plan', status: 'active', risk_level: 'high' },
        ],
      }),
    });

    const res = await callTool(client, 'check_contracts', {
      phone: '13800001111',
    });

    expect(res.has_high_risk).toBe(true);
    expect(res.has_active_contracts).toBe(true);
  });

  test('has_high_risk is false when high-risk contract is expired', async () => {
    mockBackend({
      get: () => ({
        success: true,
        contracts: [
          { id: 'C001', name: 'Normal', status: 'active', risk_level: 'low' },
          { id: 'C002', name: 'Risky', status: 'expired', risk_level: 'high' },
        ],
      }),
    });

    const res = await callTool(client, 'check_contracts', {
      phone: '13800001111',
    });

    expect(res.has_high_risk).toBe(false);
    expect((res.contracts as any[]).length).toBe(1);
  });

  test('returns empty contracts for phone with no contracts', async () => {
    mockBackend({
      get: () => ({
        success: true,
        contracts: [],
      }),
    });

    const res = await callTool(client, 'check_contracts', {
      phone: '13800003333',
    });

    expect(res.contracts).toEqual([]);
    expect(res.has_active_contracts).toBe(false);
    expect(res.has_high_risk).toBe(false);
  });

  test('returns empty contracts when backend throws', async () => {
    mockBackend({
      get: () => { throw new Error('timeout'); },
    });

    const res = await callTool(client, 'check_contracts', {
      phone: '13800009999',
    });

    expect(res.contracts).toEqual([]);
    expect(res.has_active_contracts).toBe(false);
    expect(res.has_high_risk).toBe(false);
  });
});

// ── apply_service_suspension ────────────────────────────────────────────────

describe('apply_service_suspension', () => {
  test('returns suspension details for valid subscriber', async () => {
    mockBackend({
      get: (path) => {
        if (path.includes('/subscribers/13800001111') && !path.includes('/account') && !path.includes('/contracts')) {
          return { success: true, name: 'Zhang San' };
        }
        return { success: false };
      },
    });

    const res = await callTool(client, 'apply_service_suspension', {
      phone: '13800001111',
    });

    expect(res.success).toBe(true);
    expect(res.phone).toBe('13800001111');
    expect(res.suspension_type).toBe('temporary');
    expect(res.monthly_fee).toBe(5.00);
    // effective_date should be today
    const today = new Date().toISOString().split('T')[0];
    expect(res.effective_date).toBe(today);
    // resume_deadline should be ~3 months from now
    expect(res.resume_deadline).toBeTruthy();
    expect(typeof res.message).toBe('string');
    expect((res.message as string)).toContain('停机保号');
  });

  test('resume_deadline is approximately 3 months from now', async () => {
    mockBackend({
      get: () => ({ success: true, name: 'Test User' }),
    });

    const res = await callTool(client, 'apply_service_suspension', {
      phone: '13800001111',
    });

    const deadline = new Date(res.resume_deadline as string);
    const now = new Date();
    const diffMonths = (deadline.getFullYear() - now.getFullYear()) * 12 + (deadline.getMonth() - now.getMonth());
    expect(diffMonths).toBeGreaterThanOrEqual(2);
    expect(diffMonths).toBeLessThanOrEqual(3);
  });

  test('returns failure for non-existent phone', async () => {
    mockBackend({
      get: () => ({ success: false }),
    });

    const res = await callTool(client, 'apply_service_suspension', {
      phone: '13800009999',
    });

    expect(res.success).toBe(false);
    expect((res.message as string)).toContain('13800009999');
  });

  test('returns failure when backend throws', async () => {
    mockBackend({
      get: () => { throw new Error('connection refused'); },
    });

    const res = await callTool(client, 'apply_service_suspension', {
      phone: '13800009999',
    });

    expect(res.success).toBe(false);
    expect((res.message as string)).toContain('停机保号操作失败');
  });
});
