/**
 * API tests for: src/chat/chat.ts
 * Routes: POST /api/chat, DELETE /api/sessions/:id
 * Mock: db(sessions, messages), runAgent, getMcpToolsForRuntime, skill-router, skill-runtime
 */
import { describe, test, expect, mock, beforeEach } from 'bun:test';

// TODO: setup Hono test client + mock db/runAgent

describe('POST /api/chat', () => {
  test.skip('returns 400 when message is missing', async () => {});
  test.skip('returns 400 when session_id is missing', async () => {});
  test.skip('returns 200 with response and card fields on valid request', async () => {});
  test.skip('persists user and assistant messages to db', async () => {});
  test.skip('returns bill_card when runAgent resolves bill query', async () => {});
  test.skip('returns cancel_card when runAgent resolves cancel request', async () => {});
  test.skip('routes to skill-runtime when SOP guard matches', async () => {});
  test.skip('falls back to runAgent when no SOP route matches', async () => {});
  test.skip('streams text_delta events via onTextDelta callback', async () => {});
  test.skip('applies compliance check on bot response before sending', async () => {});
});

describe('DELETE /api/sessions/:id', () => {
  test.skip('returns ok:true and deletes session messages', async () => {});
  test.skip('returns ok:true for non-existent session (idempotent)', async () => {});
});
