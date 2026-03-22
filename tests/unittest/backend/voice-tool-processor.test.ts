import { describe, test, expect } from 'bun:test';
import { inferSkillName, buildSystemPrompt, buildUserMessage } from '../../../backend/src/services/voice-tool-processor';

describe('voice-tool-processor', () => {
  describe('inferSkillName', () => {
    test('returns current if already set', () => {
      expect(inferSkillName('query_bill', 'bill-inquiry')).toBe('bill-inquiry');
    });

    test('returns null for unknown tool with no current', () => {
      const result = inferSkillName('nonexistent_tool_xyz', null);
      expect(result).toBeNull();
    });
  });
});
