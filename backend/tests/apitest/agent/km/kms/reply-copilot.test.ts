/**
 * API tests for: src/agent/km/kms/reply-copilot.ts
 * Routes: POST /api/km/reply-copilot/preview, POST /api/km/reply-copilot/feedback
 * Mock: reply-copilot(buildReplyHints), db(kmReplyFeedback)
 */
import { describe, test, expect, mock } from 'bun:test';

describe('POST /api/km/reply-copilot/preview', () => {
  test.skip('returns reply hints with scene, risk, and candidates', async () => {});
  test.skip('returns 400 when message is missing', async () => {});
});

describe('POST /api/km/reply-copilot/feedback', () => {
  test.skip('records positive feedback (used hint)', async () => {});
  test.skip('records negative feedback (rejected hint)', async () => {});
});
