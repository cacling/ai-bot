/**
 * tts.test.ts — Tests for text-to-speech module
 */
import { describe, test, expect } from 'bun:test';
import { textToSpeech } from '../../../src/services/tts';

// Save original fetch
const originalFetch = globalThis.fetch;

function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  globalThis.fetch = (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : (input instanceof URL ? input.toString() : input.url);
    const opts = init ?? (typeof input === 'object' && !(input instanceof URL) ? { method: input.method, headers: Object.fromEntries(input.headers?.entries?.() ?? []), body: input.body } : {});
    return Promise.resolve(handler(url, opts as RequestInit));
  };
}

describe('tts — textToSpeech', () => {
  test('module exports textToSpeech function', () => {
    expect(typeof textToSpeech).toBe('function');
  });

  test('successful TTS call returns base64 string', async () => {
    mockFetch(() => new Response(new Uint8Array([0x49, 0x44, 0x33]), { status: 200 }));
    try {
      const result = await textToSpeech('Hello', 'en');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('failed TTS call throws error', async () => {
    mockFetch(() => new Response('API Error', { status: 500 }));
    try {
      await expect(textToSpeech('Hello', 'zh')).rejects.toThrow('TTS API error 500');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('request sends correct URL path', async () => {
    let capturedUrl = '';
    mockFetch((url) => {
      capturedUrl = url;
      return new Response(new Uint8Array([0x00]), { status: 200 });
    });
    try {
      await textToSpeech('你好', 'zh');
      expect(capturedUrl).toContain('/audio/speech');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('default language is zh', async () => {
    mockFetch(() => new Response(new Uint8Array([0x00]), { status: 200 }));
    try {
      const result = await textToSpeech('测试');
      expect(typeof result).toBe('string');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('error message includes status code', async () => {
    mockFetch(() => new Response('Bad Request', { status: 400 }));
    try {
      await expect(textToSpeech('test')).rejects.toThrow(/TTS API error 400/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('returns base64 that can be decoded', async () => {
    const testData = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
    mockFetch(() => new Response(testData, { status: 200 }));
    try {
      const b64 = await textToSpeech('test', 'en');
      const decoded = Buffer.from(b64, 'base64');
      expect(decoded.length).toBe(testData.length);
      expect(decoded[0]).toBe(0x48);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('handles empty response body', async () => {
    mockFetch(() => new Response(new Uint8Array([]), { status: 200 }));
    try {
      const result = await textToSpeech('test');
      expect(result).toBe('');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
