/**
 * API tests for: src/services/diagnosis_service.ts (Port: 18005)
 * Tools: diagnose_network, diagnose_app
 * Mock: backendPost (mock_apis HTTP calls)
 */
import { describe, test, expect, mock, beforeEach } from 'bun:test';

// TODO: mock backendPost, instantiate MCP server via createServer()

// ── diagnose_network ─────────────────────────────────────────────────────────

describe('diagnose_network', () => {
  test.skip('returns diagnostic_steps array for no_signal issue', async () => {});
  test.skip('returns diagnostic_steps array for slow_data issue', async () => {});
  test.skip('returns diagnostic_steps array for call_drop issue', async () => {});
  test.skip('returns diagnostic_steps array for no_network issue', async () => {});
  test.skip('assigns severity=high when escalation is needed', async () => {});
  test.skip('assigns severity=normal for routine diagnosis', async () => {});
  test.skip('returns zh next_action by default', async () => {});
  test.skip('returns en next_action when lang=en', async () => {});
  test.skip('detects suspended account in diagnosis results', async () => {});
  test.skip('returns error message when backend call fails', async () => {});
});

// ── diagnose_app ─────────────────────────────────────────────────────────────

describe('diagnose_app', () => {
  test.skip('returns diagnosis for app_locked issue', async () => {});
  test.skip('returns diagnosis for login_failed issue', async () => {});
  test.skip('returns diagnosis for device_incompatible issue', async () => {});
  test.skip('returns diagnosis for suspicious_activity issue', async () => {});
  test.skip('calculates risk_level=high when escalation present', async () => {});
  test.skip('calculates risk_level=none when no errors', async () => {});
  test.skip('returns error message when backend call fails', async () => {});
});
