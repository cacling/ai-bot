import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_USER_PHONE, clearSession } from '@/chat/api';

describe('chat/api', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('DEFAULT_USER_PHONE', () => {
    it('is a valid phone number string', () => {
      expect(typeof DEFAULT_USER_PHONE).toBe('string');
      expect(DEFAULT_USER_PHONE.length).toBeGreaterThan(0);
      expect(DEFAULT_USER_PHONE).toBe('13800000001');
    });
  });

  describe('clearSession', () => {
    it('sends DELETE request to /api/sessions/:sessionId', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      } as Response);

      await clearSession('test-session-123');
      expect(fetchSpy).toHaveBeenCalledWith('/api/sessions/test-session-123', { method: 'DELETE' });
    });

    it('handles different session IDs', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      } as Response);

      await clearSession('abc-def-ghi');
      expect(fetchSpy).toHaveBeenCalledWith('/api/sessions/abc-def-ghi', { method: 'DELETE' });
    });
  });

  describe('sendChatMessageWS', () => {
    // WebSocket-based function - test structure and protocol
    it('module exports sendChatMessageWS function', async () => {
      const { sendChatMessageWS } = await import('@/chat/api');
      expect(typeof sendChatMessageWS).toBe('function');
    });
  });
});
