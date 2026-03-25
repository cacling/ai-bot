/**
 * API tests for: src/routes/identity.ts
 * Mount: /api/identity
 * Routes: POST otp/send, POST verify, GET accounts/:msisdn/login-events
 * Mock: db(subscribers, identityOtpRequests, identityLoginEvents)
 */
import { describe, test, expect, mock } from 'bun:test';

describe('POST /api/identity/otp/send', () => {
  test.skip('generates OTP and stores in db', async () => {});
  test.skip('returns 400 when phone is missing', async () => {});
  test.skip('returns 404 for non-existent phone', async () => {});
});

describe('POST /api/identity/verify', () => {
  test.skip('returns verified:true for correct OTP', async () => {});
  test.skip('returns verified:false for incorrect OTP', async () => {});
  test.skip('returns 400 when phone or otp is missing', async () => {});
});

describe('GET /api/identity/accounts/:msisdn/login-events', () => {
  test.skip('returns login event history', async () => {});
  test.skip('returns empty array for phone with no events', async () => {});
});
