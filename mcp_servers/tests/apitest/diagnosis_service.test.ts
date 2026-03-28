/**
 * API tests for: src/services/diagnosis_service.ts (Port: 18005)
 * Tools: diagnose_network, diagnose_app
 * Mock: backendPost (mock_apis HTTP calls)
 */
import { describe, test, expect, beforeAll } from 'bun:test';
import { mockBackend, loadService, createTestClient, callTool } from './helpers';
import { type Client } from '@modelcontextprotocol/sdk/client/index.js';

let client: Client;

beforeAll(async () => {
  const createServer = await loadService('src/services/diagnosis_service.ts');
  client = await createTestClient(createServer);
});

// ── diagnose_network ────────────────────────────────────────────────────────

describe('diagnose_network', () => {
  test('returns diagnostic_steps, severity, conclusion for normal case', async () => {
    mockBackend({
      post: () => ({
        success: true,
        msisdn: '13800001111',
        issue_type: 'slow_data',
        severity: 'normal',
        escalate: false,
        diagnostic_steps: [
          { name: 'signal_check', status: 'ok', detail: 'Signal strong' },
          { name: 'dns_check', status: 'ok', detail: 'DNS resolved' },
        ],
        conclusion: 'All checks passed.',
      }),
    });

    const res = await callTool(client, 'diagnose_network', {
      phone: '13800001111',
      issue_type: 'slow_data',
    });

    expect(res.phone).toBe('13800001111');
    expect(res.issue_type).toBe('slow_data');
    expect(res.severity).toBe('normal');
    expect(res.should_escalate).toBe(false);
    expect(res.conclusion).toBe('All checks passed.');
    expect(Array.isArray(res.diagnostic_steps)).toBe(true);
    expect((res.diagnostic_steps as any[]).length).toBe(2);
  });

  test('severity=normal returns zh next_action by default', async () => {
    mockBackend({
      post: () => ({
        success: true,
        severity: 'normal',
        escalate: false,
        diagnostic_steps: [{ name: 'check1', status: 'ok' }],
        conclusion: 'OK',
      }),
    });

    const res = await callTool(client, 'diagnose_network', {
      phone: '13800001111',
      issue_type: 'no_signal',
    });

    expect(res.next_action).toContain('各项检测正常');
  });

  test('severity=normal with lang=en returns English next_action', async () => {
    mockBackend({
      post: () => ({
        success: true,
        severity: 'normal',
        escalate: false,
        diagnostic_steps: [],
        conclusion: 'OK',
      }),
    });

    const res = await callTool(client, 'diagnose_network', {
      phone: '13800001111',
      issue_type: 'no_signal',
      lang: 'en',
    });

    expect(res.next_action).toContain('All checks passed');
  });

  test('escalate=true returns escalation next_action (zh)', async () => {
    mockBackend({
      post: () => ({
        success: true,
        severity: 'critical',
        escalate: true,
        diagnostic_steps: [
          { name: 'signal', status: 'error' },
          { name: 'base_station', status: 'error' },
        ],
        conclusion: 'Multiple failures.',
      }),
    });

    const res = await callTool(client, 'diagnose_network', {
      phone: '13800001111',
      issue_type: 'no_signal',
    });

    expect(res.severity).toBe('critical');
    expect(res.should_escalate).toBe(true);
    expect(res.next_action).toContain('转接人工客服');
  });

  test('escalate=true with lang=en returns English escalation', async () => {
    mockBackend({
      post: () => ({
        success: true,
        severity: 'critical',
        escalate: true,
        diagnostic_steps: [],
        conclusion: 'Failures.',
      }),
    });

    const res = await callTool(client, 'diagnose_network', {
      phone: '13800001111',
      issue_type: 'call_drop',
      lang: 'en',
    });

    expect(res.should_escalate).toBe(true);
    expect(res.next_action).toContain('transferring to a human agent');
  });

  test('non-normal non-escalate returns issue-specific suggestion for slow_data (zh)', async () => {
    mockBackend({
      post: () => ({
        success: true,
        severity: 'warning',
        escalate: false,
        diagnostic_steps: [{ name: 'dns', status: 'warning' }],
        conclusion: 'Minor issue.',
      }),
    });

    const res = await callTool(client, 'diagnose_network', {
      phone: '13800001111',
      issue_type: 'slow_data',
    });

    expect(res.severity).toBe('warning');
    expect(res.should_escalate).toBe(false);
    expect(res.next_action).toContain('关闭后台高流量应用');
  });

  test('non-normal non-escalate returns issue-specific suggestion for no_network (en)', async () => {
    mockBackend({
      post: () => ({
        success: true,
        severity: 'warning',
        escalate: false,
        diagnostic_steps: [],
        conclusion: 'Minor.',
      }),
    });

    const res = await callTool(client, 'diagnose_network', {
      phone: '13800001111',
      issue_type: 'no_network',
      lang: 'en',
    });

    expect(res.next_action).toContain('APN settings');
  });

  test('non-normal non-escalate returns suggestion for call_drop (zh)', async () => {
    mockBackend({
      post: () => ({
        success: true,
        severity: 'warning',
        escalate: false,
        diagnostic_steps: [],
        conclusion: 'Signal weak.',
      }),
    });

    const res = await callTool(client, 'diagnose_network', {
      phone: '13800001111',
      issue_type: 'call_drop',
    });

    expect(res.next_action).toContain('信号弱');
  });

  test('non-normal non-escalate returns suggestion for no_signal (zh)', async () => {
    mockBackend({
      post: () => ({
        success: true,
        severity: 'warning',
        escalate: false,
        diagnostic_steps: [],
        conclusion: 'SIM issue.',
      }),
    });

    const res = await callTool(client, 'diagnose_network', {
      phone: '13800001111',
      issue_type: 'no_signal',
    });

    expect(res.next_action).toContain('SIM 卡');
  });

  test('returns empty result when backend returns success:false', async () => {
    mockBackend({
      post: () => ({ success: false }),
    });

    const res = await callTool(client, 'diagnose_network', {
      phone: '13800009999',
      issue_type: 'no_signal',
    });

    expect(res.diagnostic_steps).toEqual([]);
    expect(res.conclusion).toBeNull();
    expect(res.severity).toBeNull();
    expect(res.should_escalate).toBe(false);
    expect(res.next_action).toBeNull();
  });

  test('returns empty result when backend throws error', async () => {
    mockBackend({
      post: () => { throw new Error('network timeout'); },
    });

    const res = await callTool(client, 'diagnose_network', {
      phone: '13800009999',
      issue_type: 'call_drop',
    });

    expect(res.diagnostic_steps).toEqual([]);
    expect(res.conclusion).toBeNull();
    expect(res.severity).toBeNull();
    expect(res.should_escalate).toBe(false);
  });
});

// ── diagnose_app ────────────────────────────────────────────────────────────

describe('diagnose_app', () => {
  test('returns risk_level=none when all steps pass (no error, no escalate)', async () => {
    mockBackend({
      post: () => ({
        success: true,
        issue_type: 'login_failed',
        diagnostic_steps: [
          { name: 'version_check', status: 'ok' },
          { name: 'cache_check', status: 'ok' },
        ],
        conclusion: 'No issues found.',
        escalation_path: 'self_service',
        customer_actions: ['Retry login'],
      }),
    });

    const res = await callTool(client, 'diagnose_app', {
      phone: '13800001111',
      issue_type: 'login_failed',
    });

    expect(res.phone).toBe('13800001111');
    expect(res.issue_type).toBe('login_failed');
    expect(res.risk_level).toBe('none');
    expect(res.escalation_path).toBe('self_service');
    expect((res.customer_actions as any[]).length).toBe(1);
    expect(res.action_count).toBe(1);
    // self_service + no error => "所有检查项通过"
    expect(res.next_step).toContain('所有检查项通过');
  });

  test('returns risk_level=low when steps have error but no escalate', async () => {
    mockBackend({
      post: () => ({
        success: true,
        issue_type: 'app_locked',
        diagnostic_steps: [
          { name: 'lock_check', status: 'error', escalate: false },
          { name: 'attempt_count', status: 'ok' },
        ],
        conclusion: 'Account locked.',
        escalation_path: 'self_service',
        customer_actions: ['Wait 30 minutes', 'Reset password'],
      }),
    });

    const res = await callTool(client, 'diagnose_app', {
      phone: '13800001111',
      issue_type: 'app_locked',
    });

    expect(res.risk_level).toBe('low');
    // hasError + self_service => "发现可修复问题"
    expect(res.next_step).toContain('发现可修复问题');
  });

  test('returns risk_level=medium when steps have escalate but no error', async () => {
    mockBackend({
      post: () => ({
        success: true,
        diagnostic_steps: [
          { name: 'security_check', status: 'warning', escalate: true },
        ],
        conclusion: 'Needs review.',
        escalation_path: 'frontline',
        customer_actions: [],
      }),
    });

    const res = await callTool(client, 'diagnose_app', {
      phone: '13800001111',
      issue_type: 'device_incompatible',
    });

    expect(res.risk_level).toBe('medium');
    expect(res.escalation_path).toBe('frontline');
    // frontline => "转一线客服"
    expect(res.next_step).toContain('转一线客服');
  });

  test('returns risk_level=high when steps have both error and escalate', async () => {
    mockBackend({
      post: () => ({
        success: true,
        issue_type: 'suspicious_activity',
        diagnostic_steps: [
          { name: 'ip_check', status: 'error', escalate: true },
          { name: 'device_check', status: 'error', escalate: true },
        ],
        conclusion: 'Suspicious login detected.',
        escalation_path: 'security_team',
        customer_actions: ['Do not login', 'Contact support'],
      }),
    });

    const res = await callTool(client, 'diagnose_app', {
      phone: '13800001111',
      issue_type: 'suspicious_activity',
    });

    expect(res.risk_level).toBe('high');
    expect(res.escalation_path).toBe('security_team');
    // security_team => "转接安全团队"
    expect(res.next_step).toContain('转接安全团队');
    expect(res.action_count).toBe(2);
  });

  test('lock_reason is null when backend returns "unknown"', async () => {
    mockBackend({
      post: () => ({
        success: true,
        diagnostic_steps: [],
        conclusion: 'Unknown lock.',
        escalation_path: 'self_service',
        customer_actions: [],
        lock_reason: 'unknown',
      }),
    });

    const res = await callTool(client, 'diagnose_app', {
      phone: '13800001111',
      issue_type: 'app_locked',
    });

    expect(res.lock_reason).toBeNull();
  });

  test('lock_reason is passed through when not "unknown"', async () => {
    mockBackend({
      post: () => ({
        success: true,
        diagnostic_steps: [],
        conclusion: 'Locked.',
        escalation_path: 'self_service',
        customer_actions: [],
        lock_reason: 'too_many_attempts',
      }),
    });

    const res = await callTool(client, 'diagnose_app', {
      phone: '13800001111',
      issue_type: 'app_locked',
    });

    expect(res.lock_reason).toBe('too_many_attempts');
  });

  test('returns empty result when backend returns success:false', async () => {
    mockBackend({
      post: () => ({ success: false }),
    });

    const res = await callTool(client, 'diagnose_app', {
      phone: '13800009999',
      issue_type: 'login_failed',
    });

    expect(res.diagnostic_steps).toEqual([]);
    expect(res.conclusion).toBeNull();
    expect(res.escalation_path).toBeNull();
    expect(res.customer_actions).toEqual([]);
    expect(res.risk_level).toBe('none');
    expect(res.action_count).toBe(0);
    expect(res.lock_reason).toBeNull();
  });

  test('returns empty result when backend throws error', async () => {
    mockBackend({
      post: () => { throw new Error('server down'); },
    });

    const res = await callTool(client, 'diagnose_app', {
      phone: '13800009999',
      issue_type: 'suspicious_activity',
    });

    expect(res.diagnostic_steps).toEqual([]);
    expect(res.risk_level).toBe('none');
    expect(res.lock_reason).toBeNull();
    expect(res.action_count).toBe(0);
  });
});
