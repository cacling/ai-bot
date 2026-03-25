/**
 * API tests for: src/routes/outreach.ts
 * Mount: /api/outreach
 * Routes: POST calls/result, POST sms/send, POST handoff/create, POST marketing/result
 * Mock: db(outreachCallResults, outreachSmsEvents, outreachHandoffCases, outreachMarketingResults)
 */
import { describe, test, expect, mock } from 'bun:test';

describe('POST /api/outreach/calls/result', () => {
  test.skip('records call result with phone and result type', async () => {});
  test.skip('stores ptp_date and callback_time when provided', async () => {});
  test.skip('returns 400 when phone or result is missing', async () => {});
});

describe('POST /api/outreach/sms/send', () => {
  test.skip('sends SMS and creates event record', async () => {});
  test.skip('returns 400 when phone or sms_type is missing', async () => {});
  test.skip('supports sms_type: payment_link, plan_detail, callback_reminder, product_detail', async () => {});
});

describe('POST /api/outreach/handoff/create', () => {
  test.skip('creates handoff case with reason and context', async () => {});
  test.skip('returns case_id on success', async () => {});
});

describe('POST /api/outreach/marketing/result', () => {
  test.skip('records marketing result with campaign_id', async () => {});
  test.skip('returns 400 when required fields are missing', async () => {});
  test.skip('stores callback_time for callback results', async () => {});
});
