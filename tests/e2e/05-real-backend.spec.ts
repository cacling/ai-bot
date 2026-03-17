/**
 * 真实后端集成测试
 * 需要 start.sh 已启动（backend :8000, telecom-mcp :8003）
 * 测试覆盖：健康检查、文件树 API、Chat API（真实 LLM 调用）、会话管理
 *
 * 注意：Chat API 会调用真实 LLM，响应时间 5-30s，超时设为 60s
 */
import { test, expect } from '@playwright/test';

const BACKEND = 'http://localhost:8000';

// ── 辅助 ─────────────────────────────────────────────────────────────────────
interface FileNode {
  name: string;
  type: 'file' | 'dir';
  path: string;
  children?: FileNode[];
}
function flattenTree(nodes: FileNode[]): FileNode[] {
  return nodes.flatMap((n) => [n, ...(n.children ? flattenTree(n.children) : [])]);
}

// ── GET /health ───────────────────────────────────────────────────────────────

test.describe('Backend 健康检查', () => {
  test('TC-BE-01 GET /health 返回 200 和 status:ok', async ({ request }) => {
    const res = await request.get(`${BACKEND}/health`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json() as { status: string };
    expect(body.status).toBe('ok');
  });
});

// ── GET /api/files/tree（真实后端读取磁盘）────────────────────────────────────

test.describe('真实后端 文件树 API', () => {
  test('TC-BE-02 GET /api/files/tree 返回电信 skill 目录结构', async ({ request }) => {
    const res = await request.get(`${BACKEND}/api/files/tree`);
    expect(res.ok()).toBeTruthy();
    const { tree } = await res.json() as { tree: FileNode[] };

    const skills = tree.find((n) => n.name === 'skills');
    expect(skills).toBeDefined();

    const childNames = skills?.children?.map((c) => c.name) ?? [];
    expect(childNames).toContain('bill-inquiry');
    expect(childNames).toContain('fault-diagnosis');
    expect(childNames).toContain('plan-inquiry');
    expect(childNames).toContain('service-cancel');
  });

  test('TC-BE-03 tree 包含 4 个 SKILL.md 文件', async ({ request }) => {
    const res = await request.get(`${BACKEND}/api/files/tree`);
    const { tree } = await res.json() as { tree: FileNode[] };
    const all = flattenTree(tree);
    const skillMds = all.filter((n) => n.type === 'file' && n.name === 'SKILL.md');
    expect(skillMds.length).toBe(4);
  });

  test('TC-BE-04 可读取 bill-inquiry/SKILL.md 内容', async ({ request }) => {
    const res = await request.get(`${BACKEND}/api/files/content?path=skills/bill-inquiry/SKILL.md`);
    expect(res.ok()).toBeTruthy();
    const { content } = await res.json() as { content: string };
    expect(content).toContain('账单');
  });
});

// ── POST /api/chat（真实 LLM 调用）──────────────────────────────────────────

test.describe('真实后端 Chat API', () => {
  test.setTimeout(200_000);

  test('TC-BE-05 POST /api/chat 返回 200、response 和 card 字段', async ({ request }) => {
    const sessionId = `be-test-${Date.now()}`;
    const res = await request.post(`${BACKEND}/api/chat`, {
      data: { message: '你好，请介绍一下你能做什么', session_id: sessionId },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json() as { response: string; session_id: string; card: unknown };
    expect(typeof body.response).toBe('string');
    expect(body.response.length).toBeGreaterThan(0);
    expect(body.session_id).toBe(sessionId);
    expect('card' in body).toBe(true);
  });

  test('TC-BE-06 session_id 原样返回', async ({ request }) => {
    const sessionId = `be-sid-${Date.now()}`;
    const res = await request.post(`${BACKEND}/api/chat`, {
      data: { message: '你好', session_id: sessionId },
    });
    const body = await res.json() as { session_id: string };
    expect(body.session_id).toBe(sessionId);
  });

  test('TC-BE-07 缺少 message 返回 400', async ({ request }) => {
    const res = await request.post(`${BACKEND}/api/chat`, {
      data: { session_id: 'test-session' },
    });
    expect(res.status()).toBe(400);
  });

  test('TC-BE-08 缺少 session_id 返回 400', async ({ request }) => {
    const res = await request.post(`${BACKEND}/api/chat`, {
      data: { message: '你好' },
    });
    expect(res.status()).toBe(400);
  });

  test('TC-BE-09 多轮对话保持上下文（session 历史）', async ({ request }) => {
    const sessionId = `be-ctx-${Date.now()}`;

    // 第一轮
    const res1 = await request.post(`${BACKEND}/api/chat`, {
      data: { message: '我叫小明，你好', session_id: sessionId },
    });
    expect(res1.ok()).toBeTruthy();

    // 第二轮（同一 session）
    const res2 = await request.post(`${BACKEND}/api/chat`, {
      data: { message: '我刚才说我叫什么名字？', session_id: sessionId },
    });
    expect(res2.ok()).toBeTruthy();
    const { response } = await res2.json() as { response: string };
    // 有历史上下文时，模型应记得名字
    expect(response).toContain('小明');
  });
});

// ── DELETE /api/sessions/:id ──────────────────────────────────────────────────

test.describe('真实后端 会话管理', () => {
  test('TC-BE-10 DELETE /api/sessions/:id 清除会话', async ({ request }) => {
    const sessionId = `be-del-${Date.now()}`;
    // 先创建一条消息
    await request.post(`${BACKEND}/api/chat`, {
      data: { message: '测试', session_id: sessionId },
    });
    // 再删除
    const res = await request.delete(`${BACKEND}/api/sessions/${sessionId}`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  test('TC-BE-11 删除不存在的会话也返回 ok（幂等）', async ({ request }) => {
    const res = await request.delete(`${BACKEND}/api/sessions/nonexistent-be-xyz`);
    expect(res.ok()).toBeTruthy();
  });
});
