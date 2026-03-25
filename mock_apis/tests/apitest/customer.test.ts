/**
 * API tests for: src/routes/customer.ts
 * Mount: /api/customer
 * Routes: GET subscribers/:msisdn, GET account-summary, GET preferences, GET contracts, GET services, GET household, GET subscription-history
 * Mock: db(subscribers, plans, valueAddedServices, subscriberSubscriptions, customerHouseholds, contracts, customerPreferences)
 */
import { describe, test, expect, mock } from 'bun:test';

// TODO: import createApp(), mock db module, use app.request() for in-process testing

describe('GET /api/customer/subscribers/:msisdn', () => {
  test.skip('returns subscriber with plan info for valid phone', async () => {});
  test.skip('returns 404 for non-existent phone', async () => {});
  test.skip('includes balance, status, overdue_days', async () => {});
});

describe('GET /api/customer/subscribers/:msisdn/account-summary', () => {
  test.skip('returns account summary with balance and credit_limit', async () => {});
  test.skip('returns 404 for non-existent phone', async () => {});
});

describe('GET /api/customer/subscribers/:msisdn/preferences', () => {
  test.skip('returns customer preferences', async () => {});
});

describe('GET /api/customer/subscribers/:msisdn/contracts', () => {
  test.skip('returns active contracts list', async () => {});
  test.skip('returns empty array for phone with no contracts', async () => {});
});

describe('GET /api/customer/subscribers/:msisdn/services', () => {
  test.skip('returns subscribed services list', async () => {});
  test.skip('each service has service_id, name, monthly_fee', async () => {});
});

describe('GET /api/customer/subscribers/:msisdn/household', () => {
  test.skip('returns household members', async () => {});
});

describe('GET /api/customer/subscribers/:msisdn/subscription-history', () => {
  test.skip('returns subscription history ordered by date desc', async () => {});
});
