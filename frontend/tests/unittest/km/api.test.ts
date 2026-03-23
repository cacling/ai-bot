import { describe, it, expect, vi, beforeEach } from 'vitest';
import { kmApi } from '@/km/api';

describe('km/api', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function mockFetchOk(data: unknown) {
    return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(data),
    } as Response);
  }

  function mockFetchError(status: number, error?: string) {
    return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status,
      json: () => Promise.resolve({ error: error ?? `HTTP ${status}` }),
    } as Response);
  }

  describe('listDocuments', () => {
    it('calls GET /api/km/documents with query params', async () => {
      const data = { items: [], total: 0 };
      const spy = mockFetchOk(data);

      const result = await kmApi.listDocuments({ page: '1', limit: '10' });
      expect(result).toEqual(data);
      expect(spy).toHaveBeenCalledTimes(1);
      const url = spy.mock.calls[0][0] as string;
      expect(url).toContain('/api/km/documents');
      expect(url).toContain('page=1');
      expect(url).toContain('limit=10');
    });
  });

  describe('getDocument', () => {
    it('calls GET /api/km/documents/:id', async () => {
      const data = { id: 'doc-1', title: 'Test', versions: [] };
      const spy = mockFetchOk(data);

      const result = await kmApi.getDocument('doc-1');
      expect(result).toEqual(data);
      expect(spy.mock.calls[0][0]).toContain('/api/km/documents/doc-1');
    });
  });

  describe('createDocument', () => {
    it('sends POST to /api/km/documents', async () => {
      const spy = mockFetchOk({ id: 'new-doc', version_id: 'v1' });

      await kmApi.createDocument({ title: 'New Doc' });
      expect(spy).toHaveBeenCalledTimes(1);
      const [url, opts] = spy.mock.calls[0];
      expect(url).toContain('/api/km/documents');
      expect(opts).toBeDefined();
      expect((opts as RequestInit).method).toBe('POST');
      expect(JSON.parse((opts as RequestInit).body as string)).toEqual({ title: 'New Doc' });
    });
  });

  describe('createVersion', () => {
    it('sends POST to /api/km/documents/:docId/versions', async () => {
      const spy = mockFetchOk({ id: 'v2', version_no: 2 });

      await kmApi.createVersion('doc-1', { content: 'new content' });
      const [url, opts] = spy.mock.calls[0];
      expect(url).toContain('/api/km/documents/doc-1/versions');
      expect((opts as RequestInit).method).toBe('POST');
    });
  });

  describe('triggerParse', () => {
    it('sends POST to /api/km/documents/versions/:vid/parse', async () => {
      const spy = mockFetchOk({});

      await kmApi.triggerParse('v1');
      const [url, opts] = spy.mock.calls[0];
      expect(url).toContain('/api/km/documents/versions/v1/parse');
      expect((opts as RequestInit).method).toBe('POST');
    });
  });

  describe('listCandidates', () => {
    it('calls GET /api/km/candidates', async () => {
      const data = { items: [], total: 0 };
      const spy = mockFetchOk(data);

      const result = await kmApi.listCandidates();
      expect(result).toEqual(data);
      expect(spy.mock.calls[0][0]).toContain('/api/km/candidates');
    });
  });

  describe('getCandidate', () => {
    it('calls GET /api/km/candidates/:id', async () => {
      const spy = mockFetchOk({ id: 'c1', evidences: [], conflicts: [], gate_card: {} });

      await kmApi.getCandidate('c1');
      expect(spy.mock.calls[0][0]).toContain('/api/km/candidates/c1');
    });
  });

  describe('createCandidate', () => {
    it('sends POST to /api/km/candidates', async () => {
      const spy = mockFetchOk({ id: 'c2' });

      await kmApi.createCandidate({ normalized_q: 'test' });
      const [url, opts] = spy.mock.calls[0];
      expect(url).toContain('/api/km/candidates');
      expect((opts as RequestInit).method).toBe('POST');
    });
  });

  describe('updateCandidate', () => {
    it('sends PUT to /api/km/candidates/:id', async () => {
      const spy = mockFetchOk({});

      await kmApi.updateCandidate('c1', { draft_answer: 'updated' });
      const [url, opts] = spy.mock.calls[0];
      expect(url).toContain('/api/km/candidates/c1');
      expect((opts as RequestInit).method).toBe('PUT');
    });
  });

  describe('gateCheck', () => {
    it('sends POST to /api/km/candidates/:id/gate-check', async () => {
      const spy = mockFetchOk({ gate_evidence: 'pass', gate_conflict: 'pass', gate_ownership: 'pass', all_pass: true });

      const result = await kmApi.gateCheck('c1');
      expect(result.all_pass).toBe(true);
      const [url, opts] = spy.mock.calls[0];
      expect(url).toContain('/api/km/candidates/c1/gate-check');
      expect((opts as RequestInit).method).toBe('POST');
    });
  });

  describe('evidence endpoints', () => {
    it('listEvidence calls GET /api/km/evidence', async () => {
      const spy = mockFetchOk({ items: [] });
      await kmApi.listEvidence();
      expect(spy.mock.calls[0][0]).toContain('/api/km/evidence');
    });

    it('createEvidence sends POST', async () => {
      const spy = mockFetchOk({ id: 'e1' });
      await kmApi.createEvidence({ candidate_id: 'c1' });
      expect((spy.mock.calls[0][1] as RequestInit).method).toBe('POST');
    });

    it('updateEvidence sends PUT', async () => {
      const spy = mockFetchOk({});
      await kmApi.updateEvidence('e1', { status: 'pass' });
      expect((spy.mock.calls[0][1] as RequestInit).method).toBe('PUT');
    });
  });

  describe('conflict endpoints', () => {
    it('listConflicts calls GET /api/km/conflicts', async () => {
      const spy = mockFetchOk({ items: [] });
      await kmApi.listConflicts();
      expect(spy.mock.calls[0][0]).toContain('/api/km/conflicts');
    });

    it('resolveConflict sends PUT', async () => {
      const spy = mockFetchOk({});
      await kmApi.resolveConflict('cf1', { resolution: 'merged' });
      const [url, opts] = spy.mock.calls[0];
      expect(url).toContain('/api/km/conflicts/cf1/resolve');
      expect((opts as RequestInit).method).toBe('PUT');
    });
  });

  describe('review package endpoints', () => {
    it('listReviewPackages calls GET', async () => {
      const spy = mockFetchOk({ items: [], total: 0 });
      await kmApi.listReviewPackages();
      expect(spy.mock.calls[0][0]).toContain('/api/km/review-packages');
    });

    it('getReviewPackage calls GET with id', async () => {
      const spy = mockFetchOk({ id: 'rp1', candidates: [] });
      await kmApi.getReviewPackage('rp1');
      expect(spy.mock.calls[0][0]).toContain('/api/km/review-packages/rp1');
    });

    it('createReviewPackage sends POST', async () => {
      const spy = mockFetchOk({ id: 'rp2' });
      await kmApi.createReviewPackage({ title: 'Review' });
      expect((spy.mock.calls[0][1] as RequestInit).method).toBe('POST');
    });

    it('submitReview sends POST', async () => {
      const spy = mockFetchOk({});
      await kmApi.submitReview('rp1');
      expect(spy.mock.calls[0][0]).toContain('/api/km/review-packages/rp1/submit');
    });

    it('approveReview sends POST', async () => {
      const spy = mockFetchOk({});
      await kmApi.approveReview('rp1');
      expect(spy.mock.calls[0][0]).toContain('/api/km/review-packages/rp1/approve');
    });

    it('rejectReview sends POST', async () => {
      const spy = mockFetchOk({});
      await kmApi.rejectReview('rp1');
      expect(spy.mock.calls[0][0]).toContain('/api/km/review-packages/rp1/reject');
    });
  });

  describe('action draft endpoints', () => {
    it('listActionDrafts calls GET', async () => {
      const spy = mockFetchOk({ items: [], total: 0 });
      await kmApi.listActionDrafts();
      expect(spy.mock.calls[0][0]).toContain('/api/km/action-drafts');
    });

    it('getActionDraft calls GET with id', async () => {
      const spy = mockFetchOk({ id: 'ad1' });
      await kmApi.getActionDraft('ad1');
      expect(spy.mock.calls[0][0]).toContain('/api/km/action-drafts/ad1');
    });

    it('createActionDraft sends POST', async () => {
      const spy = mockFetchOk({ id: 'ad2' });
      await kmApi.createActionDraft({ action_type: 'upsert' });
      expect((spy.mock.calls[0][1] as RequestInit).method).toBe('POST');
    });

    it('executeActionDraft sends POST', async () => {
      const spy = mockFetchOk({});
      await kmApi.executeActionDraft('ad1');
      expect(spy.mock.calls[0][0]).toContain('/api/km/action-drafts/ad1/execute');
    });
  });

  describe('asset endpoints', () => {
    it('listAssets calls GET', async () => {
      const spy = mockFetchOk({ items: [], total: 0 });
      await kmApi.listAssets();
      expect(spy.mock.calls[0][0]).toContain('/api/km/assets');
    });

    it('getAsset calls GET with id', async () => {
      const spy = mockFetchOk({ id: 'a1' });
      await kmApi.getAsset('a1');
      expect(spy.mock.calls[0][0]).toContain('/api/km/assets/a1');
    });

    it('getAssetVersions calls GET', async () => {
      const spy = mockFetchOk({ items: [] });
      await kmApi.getAssetVersions('a1');
      expect(spy.mock.calls[0][0]).toContain('/api/km/assets/a1/versions');
    });
  });

  describe('task endpoints', () => {
    it('listTasks calls GET', async () => {
      const spy = mockFetchOk({ items: [], total: 0 });
      await kmApi.listTasks();
      expect(spy.mock.calls[0][0]).toContain('/api/km/tasks');
    });

    it('createTask sends POST', async () => {
      const spy = mockFetchOk({ id: 't1' });
      await kmApi.createTask({ task_type: 'review' });
      expect((spy.mock.calls[0][1] as RequestInit).method).toBe('POST');
    });

    it('updateTask sends PUT', async () => {
      const spy = mockFetchOk({});
      await kmApi.updateTask('t1', { status: 'done' });
      expect((spy.mock.calls[0][1] as RequestInit).method).toBe('PUT');
    });
  });

  describe('audit log endpoint', () => {
    it('listAuditLogs calls GET', async () => {
      const spy = mockFetchOk({ items: [], total: 0 });
      await kmApi.listAuditLogs();
      expect(spy.mock.calls[0][0]).toContain('/api/km/audit-logs');
    });
  });

  describe('error handling', () => {
    it('throws error message from response body', async () => {
      mockFetchError(400, 'Invalid input');
      await expect(kmApi.listDocuments()).rejects.toThrow('Invalid input');
    });

    it('throws HTTP status when no error message in body', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      } as Response);
      await expect(kmApi.listDocuments()).rejects.toThrow('HTTP 500');
    });
  });
});
