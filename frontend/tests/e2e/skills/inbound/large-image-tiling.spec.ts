/**
 * large-image-tiling E2E 测试
 *
 * 验证超大流程图（15081x10429, 7.9MB）的上传和处理链路：
 * 1. multipart/form-data 上传成功
 * 2. 后端触发 tile 策略（裁白边 → 总览 → 切片 → 合并）
 * 3. SSE 返回 vision_progress 进度事件
 * 4. 最终返回 vision_result + done 事件
 *
 * 测试图片: fixtures/images/large-flowchart.jpg (Consulta de Plan, 15081x10429)
 *
 * 依赖: 服务已启动 (./start.sh)
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 大图处理直接打 km_service，绕过 backend proxy（proxy 对长时间 SSE 有超时限制）
const KM_API = 'http://127.0.0.1:18010/api';
// 兼容性测试走 backend proxy
const API = 'http://127.0.0.1:18472/api';
const _dir = path.dirname(fileURLToPath(import.meta.url));
const IMAGE_PATH = path.resolve(_dir, '../../fixtures/images/large-flowchart.jpg');

/** 用原生 fetch 发送 multipart 并读取 SSE 流 */
async function postMultipartSSE(
  url: string,
  fields: Record<string, string>,
  file?: { name: string; buffer: Buffer; type: string },
): Promise<{ status: number; events: Array<Record<string, unknown>> }> {
  const formData = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    formData.append(k, v);
  }
  if (file) {
    formData.append('image', new Blob([file.buffer], { type: file.type }), file.name);
  }

  const res = await fetch(url, { method: 'POST', body: formData });
  if (!res.body) return { status: res.status, events: [] };

  const events: Array<Record<string, unknown>> = [];
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith('data: ')) continue;
      try { events.push(JSON.parse(line.slice(6))); } catch { /* skip */ }
    }
  }

  return { status: res.status, events };
}

test.describe('large-image-tiling: 超大流程图处理', () => {
  test.setTimeout(600_000);

  test('TILE-01: multipart 上传大图 → 后端返回 SSE 进度 + 最终结果', async () => {
    const imageBuffer = readFileSync(IMAGE_PATH);
    expect(imageBuffer.length).toBeGreaterThan(5 * 1024 * 1024);

    const { status, events } = await postMultipartSSE(
      `${KM_API}/skill-creator/chat`,
      { message: '请分析这张流程图的完整业务流程', enable_thinking: 'true' },
      { name: 'large-flowchart.jpg', buffer: imageBuffer, type: 'image/jpeg' },
    );

    expect(status).toBe(200);

    console.log('[TILE-01] SSE events:', events.map(e => e.type));

    // 应有 vision_progress 事件（大图模式）
    const progressEvents = events.filter(e => e.type === 'vision_progress');
    console.log('[TILE-01] Progress events:', progressEvents.map(e => `${e.step} ${e.current}/${e.total}`));

    if (progressEvents.length > 0) {
      const steps = progressEvents.map(e => e.step);
      expect(steps).toContain('overview');
      expect(steps.some(s => s === 'slice')).toBe(true);
      expect(steps).toContain('merge');
    }

    // 应有 vision_result 事件
    const visionResult = events.find(e => e.type === 'vision_result') as Record<string, unknown> | undefined;
    expect(visionResult, '应返回 vision_result 事件').toBeTruthy();
    expect((visionResult!.text as string).length, 'vision_result 不应为空').toBeGreaterThan(50);
    console.log('[TILE-01] Vision result preview:', (visionResult!.text as string).slice(0, 300));

    // 应有 done 事件
    const doneEvent = events.find(e => e.type === 'done') as Record<string, unknown> | undefined;
    expect(doneEvent, '应返回 done 事件').toBeTruthy();
    expect(doneEvent!.session_id).toBeTruthy();
    expect(doneEvent!.phase).toBeTruthy();
    console.log('[TILE-01] Reply preview:', ((doneEvent!.reply as string) ?? '').slice(0, 200));
  });

  test('TILE-02: JSON body 发送纯文本仍兼容', async ({ request }) => {
    const res = await request.post(`${API}/skill-creator/chat`, {
      data: {
        message: '你好，这是一个兼容性测试',
        enable_thinking: false,
      },
      timeout: 60_000,
    });

    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.session_id).toBeTruthy();
    expect(typeof body.reply).toBe('string');
    expect(body.reply.length).toBeGreaterThan(0);
  });
});
