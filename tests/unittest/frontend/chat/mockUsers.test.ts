import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchMockUsers, fetchInboundUsers } from '@/chat/mockUsers';

describe('mockUsers API helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchMockUsers', () => {
    it('calls fetch with /api/mock-users', async () => {
      const mockData = [
        { id: '1', phone: '13800000001', name: 'Test', plan: { zh: '套餐', en: 'Plan' }, status: 'active', tag: { zh: '标签', en: 'Tag' }, tagColor: 'blue', type: 'inbound' },
      ];
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      } as Response);

      const result = await fetchMockUsers();
      expect(fetchSpy).toHaveBeenCalledWith('/api/mock-users');
      expect(result).toEqual(mockData);
    });

    it('throws on non-ok response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      } as Response);

      await expect(fetchMockUsers()).rejects.toThrow('Failed to fetch mock users');
    });
  });

  describe('fetchInboundUsers', () => {
    it('calls fetch with type=inbound query param', async () => {
      const mockData = [
        { id: '1', phone: '13800000001', name: 'Test', plan: { zh: '套餐', en: 'Plan' }, status: 'active', tag: { zh: '标签', en: 'Tag' }, tagColor: 'blue', type: 'inbound' },
      ];
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      } as Response);

      const result = await fetchInboundUsers();
      expect(fetchSpy).toHaveBeenCalledWith('/api/mock-users?type=inbound');
      expect(result).toEqual(mockData);
    });

    it('throws on non-ok response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({}),
      } as Response);

      await expect(fetchInboundUsers()).rejects.toThrow('Failed to fetch inbound users');
    });
  });
});
