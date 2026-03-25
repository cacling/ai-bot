/**
 * Tool Contract: query_subscriber
 * Server: user-info-service (:18003)
 * Input:  { phone: string }  (required: [phone])
 * Output: packages/shared-db/src/schemas/query_subscriber.json
 */
import { describe, test, expect } from 'bun:test';

// TODO: MCP client → call tool → validate response against output_schema

describe('query_subscriber — required output fields', () => {
  test.skip('response has required: balance(number), is_arrears(bool), overdue_days(int), services(array), vas_total_fee(number)', async () => {});
});

describe('query_subscriber — optional field types', () => {
  test.skip('phone is string|null', async () => {});
  test.skip('name is string|null', async () => {});
  test.skip('status is enum: active|suspended|cancelled', async () => {});
  test.skip('arrears_level is enum: none|normal|pre_cancel|recycled', async () => {});
  test.skip('data_usage_ratio is number|null', async () => {});
  test.skip('voice_usage_ratio is number|null', async () => {});
});

describe('query_subscriber — services array items', () => {
  test.skip('each item has service_id(string), name(string), monthly_fee(number)', async () => {});
});

describe('query_subscriber — additionalProperties:false', () => {
  test.skip('response has no extra fields beyond schema', async () => {});
});

describe('query_subscriber — error case', () => {
  test.skip('non-existent phone returns found:false structured response', async () => {});
});
