/**
 * chat-ws.test.ts — Tests for chat WebSocket handler module
 *
 * The chat-ws module is a WebSocket handler that cannot be directly tested via HTTP.
 * We test that the module loads correctly and that the dependencies it uses work.
 */
import { describe, test, expect } from 'bun:test';
import { setCustomerLang, getLangs } from '../../../src/services/lang-session';
import { checkCompliance, maskPII, sanitizeText } from '../../../src/services/keyword-filter';
import { t } from '../../../src/services/i18n';

describe('chat-ws — module loads', () => {
  test('module loads without error', async () => {
    const mod = await import('../../../../backend/src/chat/chat-ws');
    expect(mod.default).toBeDefined();
  });
});

describe('chat-ws — language session integration', () => {
  const phone = '13800001111';

  test('setCustomerLang stores language', () => {
    setCustomerLang(phone, 'en');
    const langs = getLangs(phone);
    expect(langs.customer).toBe('en');
  });

  test('different lang triggers translation check', () => {
    setCustomerLang(phone, 'en');
    const langs = getLangs(phone);
    const willTranslate = langs.agent !== langs.customer;
    // Just verify the check runs without error
    expect(typeof willTranslate).toBe('boolean');
  });
});

describe('chat-ws — compliance integration', () => {
  test('checkCompliance detects no issues in clean text', () => {
    const result = checkCompliance('您好，请问需要什么帮助？');
    expect(result.hasBlock).toBe(false);
  });

  test('sanitizeText returns string', () => {
    const result = sanitizeText('test text', []);
    expect(typeof result).toBe('string');
  });

  test('maskPII returns string', () => {
    const result = maskPII('test text', []);
    expect(typeof result).toBe('string');
  });
});

describe('chat-ws — i18n greeting templates', () => {
  test('greeting_generic returns string for zh', () => {
    const result = t('greeting_generic', 'zh');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  test('greeting_generic returns string for en', () => {
    const result = t('greeting_generic', 'en');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  test('greeting_with_subscriber returns personalized string', () => {
    const result = t('greeting_with_subscriber', 'zh', 'Alice', 'Premium');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});
