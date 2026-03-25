/**
 * Tool Contract: send_followup_sms
 * Server: outbound-service (:18006)
 * Input:  { phone: string, sms_type: enum[payment_link|plan_detail|callback_reminder|product_detail], context?: enum[collection|marketing] }
 * Output: packages/shared-db/src/schemas/send_followup_sms.json
 */
import { describe, test, expect } from 'bun:test';

describe('send_followup_sms — output fields', () => {
  test.skip('phone is string|null', async () => {});
  test.skip('sms_type is enum: payment_link|plan_detail|callback_reminder|product_detail', async () => {});
  test.skip('context is string|null', async () => {});
  test.skip('status is enum: sent', async () => {});
});
