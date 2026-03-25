/**
 * API tests for: src/services/user_info_service.ts (Port: 18003)
 * Tools: query_subscriber, query_bill, query_plans, analyze_bill_anomaly
 * Mock: backendGet/backendPost (mock_apis HTTP calls)
 */
import { describe, test, expect, mock, beforeEach } from 'bun:test';

// TODO: mock backendGet/backendPost, instantiate MCP server via createServer()

// ── query_subscriber ─────────────────────────────────────────────────────────

describe('query_subscriber', () => {
  test.skip('returns subscriber info with plan, balance, status', async () => {});
  test.skip('returns services list (video_pkg, sms_100 etc)', async () => {});
  test.skip('calculates arrears_level=none when balance > 0', async () => {});
  test.skip('calculates arrears_level=normal when overdue_days < 30', async () => {});
  test.skip('calculates arrears_level=pre_cancel when overdue_days 30-90', async () => {});
  test.skip('calculates arrears_level=recycled when overdue_days > 90', async () => {});
  test.skip('returns found:false for non-existent phone', async () => {});
  test.skip('returns error message when backend call fails', async () => {});
});

// ── query_bill ───────────────────────────────────────────────────────────────

describe('query_bill', () => {
  test.skip('returns current month bill when month param is omitted', async () => {});
  test.skip('returns specific month bill for YYYY-MM format', async () => {});
  test.skip('normalizes "2026-2" to "2026-02"', async () => {});
  test.skip('normalizes "2026年2月" to "2026-02"', async () => {});
  test.skip('normalizes "2月" to current year "YYYY-02"', async () => {});
  test.skip('returns fee breakdown: plan_fee, data_fee, voice_fee, value_added_fee, tax', async () => {});
  test.skip('calculates data/voice usage ratios', async () => {});
  test.skip('returns last 3 months summary when month=recent', async () => {});
  test.skip('returns found:false for non-existent phone', async () => {});
});

// ── query_plans ──────────────────────────────────────────────────────────────

describe('query_plans', () => {
  test.skip('returns all plans when plan_id is omitted', async () => {});
  test.skip('returns single plan detail when plan_id is provided', async () => {});
  test.skip('returns found:false for non-existent plan_id', async () => {});
});

// ── analyze_bill_anomaly ─────────────────────────────────────────────────────

describe('analyze_bill_anomaly', () => {
  test.skip('returns anomaly analysis with type and explanation', async () => {});
  test.skip('returns 400-equivalent when month format is invalid', async () => {});
  test.skip('handles no-anomaly case gracefully', async () => {});
});
