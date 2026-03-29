/**
 * documents.test.ts — Hono route tests for KM documents
 */
import { describe, test, expect } from 'bun:test';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import documents from '../../../src/routes/documents';
import { db } from '../../../src/db';
import { kmDocVersions, kmCandidates } from '../../../src/db';

const app = new Hono();
app.route('/documents', documents);

async function req(method: string, path: string, body?: Record<string, unknown>) {
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) init.body = JSON.stringify(body);
  const res = await app.fetch(new Request(`http://localhost${path}`, init));
  return { status: res.status, data: await res.json() as Record<string, unknown> };
}

describe('documents route', () => {
  let docId: string;
  let versionId: string;
  const tempDocPath = `/tmp/km-documents-${Date.now()}.md`;

  test('POST / — create document', async () => {
    const { status, data } = await req('POST', '/documents', {
      title: 'Test Document', classification: 'public', owner: 'tester',
    });
    expect(status).toBe(201);
    expect(data.id).toBeDefined();
    expect(data.version_id).toBeDefined();
    docId = data.id as string;
    versionId = data.version_id as string;

    await Bun.write(tempDocPath, '# Test Document\n\n## Source\n\nThis is a markdown document.');
    await db.update(kmDocVersions).set({ file_path: tempDocPath }).where(eq(kmDocVersions.id, versionId));
    await db.insert(kmCandidates).values({
      id: `cand-doc-test-${Date.now()}`,
      source_type: 'parsing',
      source_ref_id: versionId,
      normalized_q: '测试文档关联候选',
      draft_answer: '测试答案',
      status: 'gate_pass',
    });
  });

  test('POST / — empty title returns 400', async () => {
    const { status } = await req('POST', '/documents', { title: '' });
    expect(status).toBe(400);
  });

  test('POST / — missing title returns 400', async () => {
    const { status } = await req('POST', '/documents', { classification: 'internal' });
    expect(status).toBe(400);
  });

  test('GET / — list documents', async () => {
    const { status, data } = await req('GET', '/documents');
    expect(status).toBe(200);
    expect(data.items).toBeDefined();
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.total).toBeDefined();
  });

  test('GET / — filter by keyword', async () => {
    const { status, data } = await req('GET', '/documents?keyword=Test');
    expect(status).toBe(200);
  });

  test('GET / — filter by classification', async () => {
    const { status, data } = await req('GET', '/documents?classification=public');
    expect(status).toBe(200);
  });

  test('GET / — pagination works', async () => {
    const { status, data } = await req('GET', '/documents?page=1&size=5');
    expect(status).toBe(200);
    expect(data.page).toBe(1);
    expect(data.size).toBe(5);
  });

  test('GET /:id — document detail', async () => {
    const { status, data } = await req('GET', `/documents/${docId}`);
    expect(status).toBe(200);
    expect(data.title).toBe('Test Document');
    expect(data.versions).toBeDefined();
    expect(Array.isArray(data.versions)).toBe(true);
    expect(data.linked_candidates).toBeDefined();
    expect(Array.isArray(data.linked_candidates)).toBe(true);
    expect((data.linked_candidates as Array<{ normalized_q: string }>)[0]?.normalized_q).toBe('测试文档关联候选');
  });

  test('GET /versions/:vid/content — returns markdown content', async () => {
    const { status, data } = await req('GET', `/documents/versions/${versionId}/content`);
    expect(status).toBe(200);
    expect(data.format).toBe('markdown');
    expect(data.file_path).toBe(tempDocPath);
    expect((data.content as string)).toContain('# Test Document');
  });

  test('GET /:id — nonexistent returns 404', async () => {
    const { status } = await req('GET', '/documents/nonexistent-id');
    expect(status).toBe(404);
  });

  test('PUT /:id — update document', async () => {
    const { status, data } = await req('PUT', `/documents/${docId}`, {
      title: 'Updated Title', status: 'active',
    });
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
  });

  test('POST /:id/versions — create new version', async () => {
    const { status, data } = await req('POST', `/documents/${docId}/versions`, {
      diff_summary: 'test change',
    });
    expect(status).toBe(201);
    expect(data.version_no).toBe(2);
  });

  test('POST /versions/:vid/parse — trigger pipeline', async () => {
    const { status, data } = await req('POST', `/documents/versions/${versionId}/parse`);
    expect(status).toBe(201);
    expect(data.jobs).toBeDefined();
    expect((data.jobs as unknown[]).length).toBe(4);
  });

  test('POST /versions/:vid/parse — custom stages', async () => {
    const { status, data } = await req('POST', `/documents/versions/${versionId}/parse`, {
      stages: ['parse', 'chunk'],
    });
    expect(status).toBe(201);
    expect((data.jobs as unknown[]).length).toBe(2);
  });
});
