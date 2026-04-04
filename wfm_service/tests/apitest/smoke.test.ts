/**
 * Smoke test — 验证测试基座（DB 初始化 + seed）工作正常
 */
import { describe, it, expect } from 'bun:test';
import { createApp } from '../../src/server';

const app = createApp();

describe('WFM smoke test', () => {
  it('health check should return ok', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('wfm-service');
  });
});
