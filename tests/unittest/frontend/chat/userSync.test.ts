import { describe, it, expect, vi, beforeEach } from 'vitest';
import { broadcastUserSwitch } from '@/chat/userSync';

describe('userSync', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('broadcastUserSwitch', () => {
    it('creates a BroadcastChannel and posts message', () => {
      const postMessageSpy = vi.fn();
      const MockBC = vi.fn().mockImplementation(() => ({
        postMessage: postMessageSpy,
        close: vi.fn(),
      }));
      (globalThis as any).BroadcastChannel = MockBC;

      broadcastUserSwitch('13800000001');

      expect(MockBC).toHaveBeenCalledWith('ai-bot-user-sync');
      expect(postMessageSpy).toHaveBeenCalledWith({
        type: 'user_switch',
        phone: '13800000001',
      });
    });

    it('does not throw when BroadcastChannel is unavailable', () => {
      (globalThis as any).BroadcastChannel = vi.fn().mockImplementation(() => {
        throw new Error('Not supported');
      });

      // Should not throw
      expect(() => broadcastUserSwitch('13800000001')).not.toThrow();
    });
  });

  describe('useAgentUserSync', () => {
    it('is exported as a function', async () => {
      const { useAgentUserSync } = await import('@/chat/userSync');
      expect(typeof useAgentUserSync).toBe('function');
    });
  });
});
