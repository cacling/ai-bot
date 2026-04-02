import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { getProxyUrl, needsProxy, getServiceProxyUrl } from './proxy';

describe('proxy utilities', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore env
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  });

  describe('getProxyUrl', () => {
    test('returns PROXY_URL from env', () => {
      process.env.PROXY_URL = 'http://127.0.0.1:8080';
      expect(getProxyUrl()).toBe('http://127.0.0.1:8080');
    });

    test('returns empty string when not set', () => {
      delete process.env.PROXY_URL;
      expect(getProxyUrl()).toBe('');
    });
  });

  describe('needsProxy', () => {
    test('returns true when *_NEEDS_PROXY is "true"', () => {
      process.env.WHATSAPP_NEEDS_PROXY = 'true';
      expect(needsProxy('WHATSAPP')).toBe(true);
    });

    test('returns false when *_NEEDS_PROXY is "false"', () => {
      process.env.FEISHU_NEEDS_PROXY = 'false';
      expect(needsProxy('FEISHU')).toBe(false);
    });

    test('returns false when not set', () => {
      delete process.env.UNKNOWN_SERVICE_NEEDS_PROXY;
      expect(needsProxy('UNKNOWN_SERVICE')).toBe(false);
    });

    test('returns false for empty string', () => {
      process.env.SILICONFLOW_NEEDS_PROXY = '';
      expect(needsProxy('SILICONFLOW')).toBe(false);
    });
  });

  describe('getServiceProxyUrl', () => {
    test('returns proxy URL when service needs proxy and URL is set', () => {
      process.env.PROXY_URL = 'http://127.0.0.1:58309';
      process.env.SKILL_CREATOR_OPENAI_NEEDS_PROXY = 'true';
      expect(getServiceProxyUrl('SKILL_CREATOR_OPENAI')).toBe('http://127.0.0.1:58309');
    });

    test('returns undefined when service does not need proxy', () => {
      process.env.PROXY_URL = 'http://127.0.0.1:58309';
      process.env.FEISHU_NEEDS_PROXY = 'false';
      expect(getServiceProxyUrl('FEISHU')).toBeUndefined();
    });

    test('returns undefined when PROXY_URL is empty', () => {
      process.env.PROXY_URL = '';
      process.env.WHATSAPP_NEEDS_PROXY = 'true';
      expect(getServiceProxyUrl('WHATSAPP')).toBeUndefined();
    });

    test('returns undefined when PROXY_URL is not set', () => {
      delete process.env.PROXY_URL;
      process.env.WHATSAPP_NEEDS_PROXY = 'true';
      expect(getServiceProxyUrl('WHATSAPP')).toBeUndefined();
    });

    test('domestic services return undefined (integration scenario)', () => {
      process.env.PROXY_URL = 'http://127.0.0.1:58309';
      process.env.SILICONFLOW_NEEDS_PROXY = 'false';
      process.env.GLM_REALTIME_NEEDS_PROXY = 'false';
      process.env.SKILL_CREATOR_NEEDS_PROXY = 'false';
      process.env.FEISHU_NEEDS_PROXY = 'false';

      expect(getServiceProxyUrl('SILICONFLOW')).toBeUndefined();
      expect(getServiceProxyUrl('GLM_REALTIME')).toBeUndefined();
      expect(getServiceProxyUrl('SKILL_CREATOR')).toBeUndefined();
      expect(getServiceProxyUrl('FEISHU')).toBeUndefined();
    });

    test('overseas services return proxy URL (integration scenario)', () => {
      process.env.PROXY_URL = 'http://127.0.0.1:58309';
      process.env.SKILL_CREATOR_OPENAI_NEEDS_PROXY = 'true';
      process.env.WHATSAPP_NEEDS_PROXY = 'true';

      expect(getServiceProxyUrl('SKILL_CREATOR_OPENAI')).toBe('http://127.0.0.1:58309');
      expect(getServiceProxyUrl('WHATSAPP')).toBe('http://127.0.0.1:58309');
    });
  });
});
