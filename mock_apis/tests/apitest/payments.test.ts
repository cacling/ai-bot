/**
 * API tests for: src/routes/payments.ts
 * Mount: /api/payments
 * Routes: GET transactions, GET transactions/:paymentId, POST payment-link
 * Mock: db(paymentsTransactions)
 */
import { describe, test, expect, mock } from 'bun:test';

describe('GET /api/payments/transactions', () => {
  test.skip('returns transaction list filtered by phone', async () => {});
});

describe('GET /api/payments/transactions/:paymentId', () => {
  test.skip('returns transaction detail', async () => {});
  test.skip('returns 404 for non-existent paymentId', async () => {});
});

describe('POST /api/payments/payment-link', () => {
  test.skip('generates payment link for phone and amount', async () => {});
  test.skip('returns 400 when phone or amount is missing', async () => {});
});
