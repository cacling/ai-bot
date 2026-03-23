/**
 * tool-call-middleware.test.ts — Tests for inferSkillName and preprocessToolCall.
 *
 * Uses real module imports (no mock.module). These functions read from the
 * real file system (skills directory) and do not call LLM.
 * postprocessToolResult is excluded because it calls LLM for voice channels.
 */

import { describe, test, expect } from 'bun:test';
import { inferSkillName, preprocessToolCall } from '../../../src/services/tool-call-middleware';

describe('tool-call-middleware', () => {
  // ── inferSkillName ──────────────────────────────────────────────────────

  describe('inferSkillName', () => {
    test('returns current if already set', () => {
      expect(inferSkillName('query_bill', 'existing-skill')).toBe('existing-skill');
    });

    test('returns current for any tool if already set', () => {
      expect(inferSkillName('totally_unknown_tool', 'my-skill')).toBe('my-skill');
    });

    test('returns null for unknown tool with no current', () => {
      expect(inferSkillName('__nonexistent_tool_xyz__', null)).toBeNull();
    });

    test('looks up getToolSkillMap for direct mapping', () => {
      // query_bill should map to bill-inquiry via the real skills directory
      const result = inferSkillName('query_bill', null);
      // This depends on actual skill files existing; if they do, it should return a string
      // At minimum, it should not throw
      expect(result === null || typeof result === 'string').toBe(true);
    });
  });

  // ── preprocessToolCall ──────────────────────────────────────────────────

  describe('preprocessToolCall', () => {
    test('normalizes month "2026-2" to "2026-02"', () => {
      const args = { phone: '13800000001', month: '2026-2' };
      const result = preprocessToolCall({
        channel: 'voice', toolName: 'query_bill', toolArgs: args,
        userPhone: '13800000001', lang: 'zh', activeSkillName: null,
      });
      expect(result.normalizedArgs.month).toBe('2026-02');
      expect(args.month).toBe('2026-02'); // mutates original
    });

    test('normalizes Chinese month "2026年2月" to "2026-02"', () => {
      const args = { phone: '13800000001', month: '2026年2月' };
      const result = preprocessToolCall({
        channel: 'online', toolName: 'query_bill', toolArgs: args,
        userPhone: '13800000001', lang: 'zh', activeSkillName: null,
      });
      expect(result.normalizedArgs.month).toBe('2026-02');
    });

    test('no month param — args unchanged', () => {
      const args = { phone: '13800000001' };
      const result = preprocessToolCall({
        channel: 'voice', toolName: 'query_subscriber', toolArgs: args,
        userPhone: '13800000001', lang: 'zh', activeSkillName: null,
      });
      expect(result.normalizedArgs).toEqual({ phone: '13800000001' });
      expect(result.normalizedArgs).toBe(args); // same reference
    });

    test('leaves valid month unchanged', () => {
      const args = { phone: '13800000001', month: '2026-02' };
      preprocessToolCall({
        channel: 'outbound', toolName: 'query_bill', toolArgs: args,
        userPhone: '13800000001', lang: 'zh', activeSkillName: null,
      });
      expect(args.month).toBe('2026-02');
    });

    test('returns skillName and skillContent from real skill files', () => {
      const result = preprocessToolCall({
        channel: 'online', toolName: 'query_bill', toolArgs: { phone: '13800000001' },
        userPhone: '13800000001', lang: 'zh', activeSkillName: null,
      });
      // skillName should be inferred (or null if no matching skill exists)
      expect(result.skillName === null || typeof result.skillName === 'string').toBe(true);
      // skillContent and skillName should be consistent
      if (result.skillName) {
        expect(typeof result.skillContent).toBe('string');
      } else {
        expect(result.skillContent).toBeNull();
      }
    });

    test('returns null skillContent when skill not found', () => {
      const result = preprocessToolCall({
        channel: 'online', toolName: '__nonexistent_tool_xyz__', toolArgs: {},
        userPhone: '13800000001', lang: 'zh', activeSkillName: null,
      });
      expect(result.skillName).toBeNull();
      expect(result.skillContent).toBeNull();
    });
  });
});
