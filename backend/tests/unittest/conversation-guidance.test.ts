import { describe, test, expect, beforeAll } from 'bun:test';
import { getWelcomeSuggestions, type SuggestionPayload } from '../../src/services/conversation-guidance';
import { refreshSkillsCache, getSkillsByChannel } from '../../src/engine/skills';

// Ensure skill cache is populated before tests
beforeAll(() => {
  refreshSkillsCache();
});

describe('getWelcomeSuggestions', () => {
  test('returns a valid SuggestionPayload for zh', () => {
    const result = getWelcomeSuggestions({ lang: 'zh', channel: 'online' });

    expect(result.type).toBe('suggestions');
    expect(result.title).toBe('根据您的问题，推荐您这样问');
    expect(result.options.length).toBeGreaterThan(0);
    expect(result.options.length).toBeLessThanOrEqual(6);
  });

  test('returns a valid SuggestionPayload for en', () => {
    const result = getWelcomeSuggestions({ lang: 'en', channel: 'online' });

    expect(result.type).toBe('suggestions');
    expect(result.title).toBe('Based on your question, try asking:');
    expect(result.options.length).toBeGreaterThan(0);
  });

  test('each option has required fields', () => {
    const result = getWelcomeSuggestions({ lang: 'zh', channel: 'online' });

    for (const opt of result.options) {
      expect(opt.label).toBeTruthy();
      expect(opt.text).toBeTruthy();
      expect(opt.text).toBe(opt.label); // text = label in Phase 1
      expect(['direct', 'followup', 'next_step', 'transfer']).toContain(opt.category);
    }
  });

  test('transfer option is always last', () => {
    const result = getWelcomeSuggestions({ lang: 'zh', channel: 'online' });
    const transferIdx = result.options.findIndex(o => o.category === 'transfer');
    if (transferIdx >= 0) {
      // All items after transfer should also be transfer (i.e., transfer is at the end)
      for (let i = transferIdx; i < result.options.length; i++) {
        expect(result.options[i].category).toBe('transfer');
      }
    }
  });

  test('only includes options for published skills on the channel', () => {
    const publishedSkills = new Set(getSkillsByChannel('online').map(s => s.name));
    const result = getWelcomeSuggestions({ lang: 'zh', channel: 'online' });

    for (const opt of result.options) {
      if (opt.skill_hint !== null) {
        expect(publishedSkills.has(opt.skill_hint)).toBe(true);
      }
    }
  });

  test('returns empty options for a channel with no published skills', () => {
    const result = getWelcomeSuggestions({ lang: 'zh', channel: 'nonexistent-channel' });

    // Should only contain transfer options (skill_hint === null)
    for (const opt of result.options) {
      expect(opt.skill_hint).toBeNull();
    }
  });

  test('accepts optional phone parameter without error', () => {
    const result = getWelcomeSuggestions({ lang: 'zh', channel: 'online', phone: '13800000001' });
    expect(result.type).toBe('suggestions');
    expect(result.options.length).toBeGreaterThan(0);
  });
});
