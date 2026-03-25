/**
 * API tests for: src/chat/mock-data.ts
 * Routes: GET /api/test-personas, GET /api/outbound-tasks
 * Mock: db(testPersonas, outboundTasks)
 */
import { describe, test, expect, mock } from 'bun:test';

describe('GET /api/test-personas', () => {
  test.skip('returns array of test personas from db', async () => {});
  test.skip('each persona has phone, name, gender fields', async () => {});
});

describe('GET /api/outbound-tasks', () => {
  test.skip('returns array of outbound tasks from db', async () => {});
  test.skip('each task has id, type, phone, customer_name fields', async () => {});
});
