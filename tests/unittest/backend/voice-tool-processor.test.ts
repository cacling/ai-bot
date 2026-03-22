import { describe, test, expect } from 'bun:test';
import { inferSkillName, preprocessToolCall } from '../../../backend/src/services/tool-call-middleware';

describe('tool-call-middleware', () => {
  describe('inferSkillName', () => {
    test('returns current if already set', () => {
      expect(inferSkillName('query_bill', 'bill-inquiry')).toBe('bill-inquiry');
    });

    test('returns null for unknown tool with no current', () => {
      const result = inferSkillName('nonexistent_tool_xyz', null);
      expect(result).toBeNull();
    });
  });

  describe('preprocessToolCall', () => {
    test('normalizes month param "2026-2" to "2026-02"', () => {
      const args = { phone: '13800000001', month: '2026-2' };
      const result = preprocessToolCall({
        channel: 'voice', toolName: 'query_bill', toolArgs: args,
        userPhone: '13800000001', lang: 'zh', activeSkillName: null,
      });
      expect(args.month).toBe('2026-02');
      expect(result.normalizedArgs.month).toBe('2026-02');
    });

    test('normalizes Chinese month "2026年2月" to "2026-02"', () => {
      const args = { phone: '13800000001', month: '2026年2月' };
      preprocessToolCall({
        channel: 'online', toolName: 'query_bill', toolArgs: args,
        userPhone: '13800000001', lang: 'zh', activeSkillName: null,
      });
      expect(args.month).toBe('2026-02');
    });

    test('leaves valid month unchanged', () => {
      const args = { phone: '13800000001', month: '2026-02' };
      preprocessToolCall({
        channel: 'outbound', toolName: 'query_bill', toolArgs: args,
        userPhone: '13800000001', lang: 'zh', activeSkillName: null,
      });
      expect(args.month).toBe('2026-02');
    });

    test('works without month param', () => {
      const args = { phone: '13800000001' };
      const result = preprocessToolCall({
        channel: 'voice', toolName: 'query_subscriber', toolArgs: args,
        userPhone: '13800000001', lang: 'zh', activeSkillName: null,
      });
      expect(result.normalizedArgs).toEqual({ phone: '13800000001' });
    });
  });
});
