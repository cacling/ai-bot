/**
 * API tests for: src/agent/card/compliance.ts
 * Routes: GET/POST/DELETE /api/compliance/keywords, POST /api/compliance/keywords/reload, POST /api/compliance/check
 * Mock: keyword-filter(getAllKeywords, addKeyword, removeKeyword, reloadKeywords, checkCompliance)
 */
import { describe, test, expect, mock } from 'bun:test';

describe('GET /api/compliance/keywords', () => {
  test.skip('returns keywords array and total count', async () => {});
});

describe('POST /api/compliance/keywords', () => {
  test.skip('returns 400 when keyword is missing', async () => {});
  test.skip('returns 400 when category is invalid', async () => {});
  test.skip('creates banned keyword successfully', async () => {});
  test.skip('creates warning keyword successfully', async () => {});
  test.skip('creates pii keyword successfully', async () => {});
});

describe('DELETE /api/compliance/keywords/:id', () => {
  test.skip('deletes existing keyword and returns ok', async () => {});
  test.skip('returns 404 for non-existent keyword id', async () => {});
});

describe('POST /api/compliance/keywords/reload', () => {
  test.skip('reloads AC automaton and returns new total', async () => {});
});

describe('POST /api/compliance/check', () => {
  test.skip('returns 400 when text is missing', async () => {});
  test.skip('detects banned keyword and returns hasBlock:true', async () => {});
  test.skip('detects warning keyword and returns hasWarning:true', async () => {});
  test.skip('detects PII and returns hasPII:true with matches', async () => {});
  test.skip('returns all-false for clean text', async () => {});
});
