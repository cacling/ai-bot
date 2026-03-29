/**
 * km-client integration test
 *
 * Verifies that the main backend's km-client.ts HTTP calls
 * match the km_service endpoint contracts.
 *
 * Prerequisites: km_service running on port 18010
 *   cd km_service && bun run dev
 */
import { describe, test, expect, beforeAll } from 'bun:test';

const KM_BASE = process.env.KM_SERVICE_URL ?? 'http://localhost:18010';

async function kmFetch<T>(path: string, options?: RequestInit): Promise<{ ok: boolean; status: number; data: T | null }> {
  try {
    const res = await fetch(`${KM_BASE}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options?.headers },
    });
    const data = res.ok ? (await res.json() as T) : null;
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

describe('km_service health', () => {
  test('GET /health returns ok', async () => {
    const { ok, data } = await kmFetch<{ status: string }>('/health');
    expect(ok).toBe(true);
    expect(data?.status).toBe('ok');
  });
});

describe('reply-copilot endpoint', () => {
  test('POST /api/km/reply-copilot/build returns structured hints', async () => {
    const { ok, data } = await kmFetch<Record<string, unknown>>('/api/km/reply-copilot/build', {
      method: 'POST',
      body: JSON.stringify({ message: '查话费', phone: '13800000001' }),
    });
    expect(ok).toBe(true);
    expect(data).toBeDefined();
    // Should have scene, reply_options at minimum
    expect(data).toHaveProperty('scene');
  });
});

describe('agent-copilot endpoint', () => {
  test('POST /api/km/agent-copilot/context returns copilot data', async () => {
    const { ok, data } = await kmFetch<Record<string, unknown>>('/api/km/agent-copilot/context', {
      method: 'POST',
      body: JSON.stringify({
        message: '我想查一下话费',
        phone: '13800000001',
        conversationHistory: [],
      }),
    });
    expect(ok).toBe(true);
    expect(data).toBeDefined();
    expect(data).toHaveProperty('summary');
  });
});

describe('tools overview endpoint', () => {
  test('GET /api/mcp/tools returns tool list', async () => {
    const { ok, data } = await kmFetch<{ items: unknown[] }>('/api/mcp/tools');
    expect(ok).toBe(true);
    expect(data).toBeDefined();
    expect(Array.isArray(data?.items)).toBe(true);
  });
});

describe('KMS core routes', () => {
  test('GET /api/km/documents returns item list', async () => {
    const { ok, data } = await kmFetch<{ items: unknown[] }>('/api/km/documents');
    expect(ok).toBe(true);
    expect(data).toHaveProperty('items');
  });

  test('GET /api/km/candidates returns item list', async () => {
    const { ok, data } = await kmFetch<{ items: unknown[] }>('/api/km/candidates');
    expect(ok).toBe(true);
    expect(data).toHaveProperty('items');
  });

  test('GET /api/km/assets returns item list', async () => {
    const { ok, data } = await kmFetch<{ items: unknown[] }>('/api/km/assets');
    expect(ok).toBe(true);
    expect(data).toHaveProperty('items');
  });
});
