/**
 * Tool Contract: query_bill
 * Server: user-info-service (:18003)
 * Input:  { phone: string, month?: string(YYYY-MM) }  (required: [phone])
 * Output: packages/shared-db/src/schemas/query_bill.json
 */
import { describe, test, expect } from 'bun:test';

describe('query_bill — required output fields', () => {
  test.skip('response has required: count(int), bills(array)', async () => {});
});

describe('query_bill — bills array items', () => {
  test.skip('each bill has id(int), phone(string), month(string), total(number)', async () => {});
  test.skip('each bill has breakdown: plan_fee, data_fee, voice_fee, sms_fee, value_added_fee, tax', async () => {});
  test.skip('bill.status is enum: paid|unpaid|overdue', async () => {});
  test.skip('bill.payable is boolean', async () => {});
  test.skip('bill.breakdown items have item(string), amount(number), ratio(number)', async () => {});
});

describe('query_bill — optional fields', () => {
  test.skip('requested_month is string|null', async () => {});
  test.skip('note is string|null', async () => {});
});

describe('query_bill — error case', () => {
  test.skip('non-existent phone returns count:0, bills:[]', async () => {});
});
