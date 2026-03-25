/**
 * API tests for: src/agent/km/skills/files.ts
 * Routes: GET /api/files/tree, GET/PUT /api/files/content, PUT /api/files/draft, DELETE /api/files/draft, POST /api/files/create-file, POST /api/files/create-folder
 * Mock: fs(readdir, readFile, writeFile, unlink, mkdir)
 */
import { describe, test, expect, mock } from 'bun:test';

describe('GET /api/files/tree', () => {
  test.skip('returns tree structure with skills directory', async () => {});
  test.skip('tree nodes have name, type, path, children fields', async () => {});
});

describe('GET /api/files/content', () => {
  test.skip('returns 400 when path param is missing', async () => {});
  test.skip('returns 400 for unsupported file extension', async () => {});
  test.skip('returns 404 for non-existent file', async () => {});
  test.skip('returns file content for valid .md path', async () => {});
});

describe('PUT /api/files/content', () => {
  test.skip('returns 400 when path is missing', async () => {});
  test.skip('returns 400 when content is missing', async () => {});
  test.skip('returns 400 for unsupported file extension', async () => {});
  test.skip('writes content and returns ok:true', async () => {});
});

describe('PUT /api/files/draft', () => {
  test.skip('creates .draft file alongside original', async () => {});
});

describe('DELETE /api/files/draft', () => {
  test.skip('removes .draft file and returns ok:true', async () => {});
});

describe('POST /api/files/create-file', () => {
  test.skip('creates new file at specified path', async () => {});
  test.skip('returns 400 when path already exists', async () => {});
});

describe('POST /api/files/create-folder', () => {
  test.skip('creates new directory at specified path', async () => {});
});
