/**
 * API tests for: src/routes/offers.ts
 * Mount: /api/offers
 * Routes: GET eligible, GET campaigns/:campaignId
 * Mock: db(offersCampaigns, plans)
 */
import { describe, test, expect, mock } from 'bun:test';

describe('GET /api/offers/eligible', () => {
  test.skip('returns eligible offers for phone', async () => {});
  test.skip('filters by campaign status', async () => {});
});

describe('GET /api/offers/campaigns/:campaignId', () => {
  test.skip('returns campaign detail', async () => {});
  test.skip('returns 404 for non-existent campaignId', async () => {});
});
