import { describe, it, expect } from 'vitest';
import { T } from '@/i18n';
import type { Lang } from '@/i18n';

describe('i18n T dictionary', () => {
  const langs: Lang[] = ['zh', 'en'];

  it('exports both zh and en translations', () => {
    expect(T.zh).toBeDefined();
    expect(T.en).toBeDefined();
  });

  it('zh and en have the same top-level keys', () => {
    const zhKeys = Object.keys(T.zh).sort();
    const enKeys = Object.keys(T.en).sort();
    expect(zhKeys).toEqual(enKeys);
  });

  it.each(langs)('all string values in %s are non-empty', (lang) => {
    const t = T[lang];
    for (const [key, val] of Object.entries(t)) {
      if (typeof val === 'string') {
        expect(val.length, `${lang}.${key} should be non-empty`).toBeGreaterThan(0);
      }
    }
  });

  it.each(langs)('chat_faq in %s has at least 3 items', (lang) => {
    expect(T[lang].chat_faq.length).toBeGreaterThanOrEqual(3);
  });

  it.each(langs)('voice_state in %s has required keys', (lang) => {
    const requiredStates = ['disconnected', 'connecting', 'idle', 'listening', 'thinking', 'responding', 'transferred'];
    for (const state of requiredStates) {
      expect(T[lang].voice_state[state], `${lang}.voice_state.${state}`).toBeDefined();
      expect(T[lang].voice_state[state].length).toBeGreaterThan(0);
    }
  });

  it.each(langs)('outbound_state in %s has required keys', (lang) => {
    const requiredStates = ['idle', 'connecting', 'ringing', 'listening', 'thinking', 'responding', 'transferred', 'ended'];
    for (const state of requiredStates) {
      expect(T[lang].outbound_state[state], `${lang}.outbound_state.${state}`).toBeDefined();
    }
  });

  it.each(langs)('voice_transfer_reason in %s has required keys', (lang) => {
    const requiredReasons = ['user_request', 'unrecognized_intent', 'emotional_complaint', 'high_risk_operation', 'tool_failure', 'identity_verify_failed', 'low_confidence'];
    for (const reason of requiredReasons) {
      expect(T[lang].voice_transfer_reason[reason], `${lang}.voice_transfer_reason.${reason}`).toBeDefined();
    }
  });

  it.each(langs)('outbound_transfer_reason in %s has required keys', (lang) => {
    const requiredReasons = ['user_request', 'emotional_complaint', 'high_risk_operation', 'dispute_review'];
    for (const reason of requiredReasons) {
      expect(T[lang].outbound_transfer_reason[reason], `${lang}.outbound_transfer_reason.${reason}`).toBeDefined();
    }
  });

  it.each(langs)('diagram_skill_labels in %s has expected skill keys', (lang) => {
    const expectedSkills = ['fault-diagnosis', 'bill-inquiry', 'service-cancel', 'plan-inquiry', 'outbound-collection', 'outbound-marketing'];
    for (const skill of expectedSkills) {
      expect(T[lang].diagram_skill_labels[skill], `${lang}.diagram_skill_labels['${skill}']`).toBeDefined();
    }
  });

  it.each(langs)('card_diag_labels in %s has required diagnostic types', (lang) => {
    const types = ['no_signal', 'slow_data', 'call_drop', 'no_network'];
    for (const type of types) {
      expect(T[lang].card_diag_labels[type]).toBeDefined();
    }
  });

  it.each(langs)('emotion_labels in %s maps all Chinese emotion keys', (lang) => {
    const emotionKeys = ['平静', '礼貌', '焦虑', '不满', '愤怒'];
    for (const key of emotionKeys) {
      expect(T[lang].emotion_labels[key], `${lang}.emotion_labels['${key}']`).toBeDefined();
    }
  });

  it('card_cancel_notice contains {date} placeholder in both languages', () => {
    expect(T.zh.card_cancel_notice).toContain('{date}');
    expect(T.en.card_cancel_notice).toContain('{date}');
  });

  it('zh translations contain Chinese characters', () => {
    expect(T.zh.tab_chat).toMatch(/[\u4e00-\u9fff]/);
    expect(T.zh.chat_bot_name).toMatch(/[\u4e00-\u9fff]/);
  });

  it('en translations do not contain Chinese characters for navigation keys', () => {
    expect(T.en.tab_chat).not.toMatch(/[\u4e00-\u9fff]/);
    expect(T.en.tab_voice).not.toMatch(/[\u4e00-\u9fff]/);
  });
});
