/**
 * API tests for: src/routes/diagnosis.ts
 * Mount: /api/diagnosis
 * Routes: POST network/analyze, POST app/analyze
 * Mock: db(subscribers, deviceContexts)
 */
import { describe, test, expect, mock } from 'bun:test';

describe('POST /api/diagnosis/network/analyze', () => {
  test.skip('returns diagnostic_steps for no_signal issue', async () => {});
  test.skip('returns diagnostic_steps for slow_data issue', async () => {});
  test.skip('returns diagnostic_steps for call_drop issue', async () => {});
  test.skip('returns diagnostic_steps for no_network issue', async () => {});
  test.skip('includes subscriber status check in steps', async () => {});
  test.skip('detects suspended account and flags in result', async () => {});
  test.skip('returns 400 when msisdn or issue_type is missing', async () => {});
  test.skip('returns zh/en localized results based on lang param', async () => {});
});

describe('POST /api/diagnosis/app/analyze', () => {
  test.skip('returns diagnosis for app_locked issue', async () => {});
  test.skip('returns diagnosis for login_failed issue', async () => {});
  test.skip('returns diagnosis for device_incompatible issue', async () => {});
  test.skip('returns diagnosis for suspicious_activity issue', async () => {});
  test.skip('queries device_contexts for relevant diagnostics', async () => {});
  test.skip('returns 400 when msisdn or issue_type is missing', async () => {});
});
