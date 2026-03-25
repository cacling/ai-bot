/**
 * API tests for: src/routes/risk.ts
 * Mount: /api/risk
 * Routes: GET accounts/:msisdn
 * Mock: db(subscribers)
 */
import { describe, test, expect, mock } from 'bun:test';

describe('GET /api/risk/accounts/:msisdn', () => {
  test.skip('returns risk assessment for valid phone', async () => {});
  test.skip('returns 404 for non-existent phone', async () => {});
  test.skip('includes risk_level and risk_factors', async () => {});
});
