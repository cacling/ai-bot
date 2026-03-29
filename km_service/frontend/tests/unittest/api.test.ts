/**
 * KM API client unit test — verifies request helpers build correct URLs/params.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ items: [], total: 0 }),
  });
});

describe('kmApi', () => {
  test('listDocuments calls correct endpoint', async () => {
    const { kmApi } = await import('../../src/pages/api');
    await kmApi.listDocuments();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/km/documents'),
      expect.objectContaining({ headers: expect.objectContaining({ 'Content-Type': 'application/json' }) }),
    );
  });

  test('listDocuments passes query params', async () => {
    const { kmApi } = await import('../../src/pages/api');
    await kmApi.listDocuments({ classification: 'policy' });
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('classification=policy');
  });
});
