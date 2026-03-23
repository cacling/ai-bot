import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchTestPersonas } from '@/chat/testPersonas';

describe('testPersonas API helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchTestPersonas', () => {
    it('calls fetch with /api/test-personas', async () => {
      const mockData = [
        { id: 'U001', label: '正常用户', category: 'inbound', tag: '正常', tagColor: 'green', context: {} },
      ];
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      } as Response);

      const result = await fetchTestPersonas();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy.mock.calls[0][0]).toContain('/api/test-personas');
      expect(result).toEqual(mockData);
    });

    it('passes category filter', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response);

      await fetchTestPersonas('inbound');
      expect(fetchSpy.mock.calls[0][0]).toContain('category=inbound');
    });

    it('throws on non-ok response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
      } as Response);

      await expect(fetchTestPersonas()).rejects.toThrow('Failed to fetch test personas');
    });
  });
});
