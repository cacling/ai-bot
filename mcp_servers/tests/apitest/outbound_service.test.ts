/**
 * API tests for: src/services/outbound_service.ts (Port: 18006)
 * Tools: record_call_result, send_followup_sms, create_callback_task, record_marketing_result
 * Mock: backendPost (mock_apis HTTP calls)
 */
import { describe, test, expect, mock, beforeEach } from 'bun:test';

// TODO: mock backendPost, instantiate MCP server via createServer()

// ── record_call_result ───────────────────────────────────────────────────────

describe('record_call_result', () => {
  test.skip('records ptp result with ptp_date', async () => {});
  test.skip('records refusal result', async () => {});
  test.skip('records callback result with callback_time', async () => {});
  test.skip('records no_answer result', async () => {});
  test.skip('records dispute result', async () => {});
  test.skip('rejects ptp_date more than 7 days in future', async () => {});
  test.skip('categorizes ptp/converted/callback as positive', async () => {});
  test.skip('categorizes refusal/non_owner/dnd as negative', async () => {});
  test.skip('categorizes busy/no_answer as neutral', async () => {});
  test.skip('includes remark in recorded result when provided', async () => {});
});

// ── send_followup_sms ────────────────────────────────────────────────────────

describe('send_followup_sms', () => {
  test.skip('sends payment_link SMS in collection context', async () => {});
  test.skip('sends plan_detail SMS in marketing context', async () => {});
  test.skip('sends callback_reminder SMS', async () => {});
  test.skip('blocks SMS during quiet hours (21:00-08:00)', async () => {});
  test.skip('marketing context restricts to plan_detail/product_detail types only', async () => {});
  test.skip('returns error when backend call fails', async () => {});
});

// ── create_callback_task ─────────────────────────────────────────────────────

describe('create_callback_task', () => {
  test.skip('creates callback task with original_task_id and preferred_time', async () => {});
  test.skip('includes customer_name and product_name when provided', async () => {});
  test.skip('returns task_id on success', async () => {});
  test.skip('returns error when backend call fails', async () => {});
});

// ── record_marketing_result ──────────────────────────────────────────────────

describe('record_marketing_result', () => {
  test.skip('records converted result with conversion tag', async () => {});
  test.skip('records callback result with callback_time', async () => {});
  test.skip('records not_interested result', async () => {});
  test.skip('records no_answer result', async () => {});
  test.skip('records dnd result (do not call)', async () => {});
  test.skip('maps converted → warm_lead conversion tag', async () => {});
  test.skip('maps not_interested → cold conversion tag', async () => {});
  test.skip('maps dnd → dnd conversion tag', async () => {});
  test.skip('returns error when backend call fails', async () => {});
});
