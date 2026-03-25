/**
 * Tool Contract: verify_identity
 * Server: account-service (:18007)
 * Input:  { phone: string, otp: string }  (required: [phone, otp])
 * Output: packages/shared-db/src/schemas/verify_identity.json
 */
import { describe, test, expect } from 'bun:test';

describe('verify_identity — required output fields', () => {
  test.skip('response has required: verified(bool)', async () => {});
});

describe('verify_identity — optional fields', () => {
  test.skip('customer_name is string|null', async () => {});
  test.skip('verification_method is enum: otp', async () => {});
});
