/**
 * Tool Contract: cancel_service
 * Server: business-service (:18004)
 * Input:  { phone: string, service_id: string, operator?: string, reason?: string, traceId?: string, idempotencyKey?: string }
 * Output: packages/shared-db/src/schemas/cancel_service.json
 */
import { describe, test, expect } from 'bun:test';

describe('cancel_service — required output fields', () => {
  test.skip('response has required: monthly_fee(number), refund_eligible(bool)', async () => {});
});

describe('cancel_service — optional fields', () => {
  test.skip('phone is string|null', async () => {});
  test.skip('service_id is string|null', async () => {});
  test.skip('service_name is string|null', async () => {});
  test.skip('effective_end is string|null', async () => {});
  test.skip('refund_note is string|null', async () => {});
});

describe('cancel_service — error case', () => {
  test.skip('non-existent service returns error structure', async () => {});
});
