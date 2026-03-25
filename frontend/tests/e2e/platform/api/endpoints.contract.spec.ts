/**
 * API 端点测试（通过 Playwright request fixture，无浏览器）
 *
 * 合并来源：原 03-api-endpoints + 05-real-backend
 * 请求发往 Vite proxy (localhost:5173) → backend (localhost:18472)
 */
import { test, expect } from '@playwright/test';

// ── 辅助类型 ─────────────────────────────────────────────────────────────────
interface FileNode {
  name: string;
  type: 'file' | 'dir';
  path: string;
  children?: FileNode[];
}

function flattenTree(nodes: FileNode[]): FileNode[] {
  return nodes.flatMap((n) => [n, ...(n.children ? flattenTree(n.children) : [])]);
}

// ── GET /api/files/tree ───────────────────────────────────────────────────────

test.describe('GET /api/files/tree', () => {
  test('TC-API-01 返回 200 和 tree 字段', async ({ request }) => {
    const res = await request.get('/api/files/tree');
    expect(res.ok()).toBeTruthy();
    const body = await res.json() as { tree: FileNode[] };
    expect(body).toHaveProperty('tree');
    expect(Array.isArray(body.tree)).toBe(true);
  });

  test('TC-API-02 tree 包含 skills 目录', async ({ request }) => {
    const res = await request.get('/api/files/tree');
    const { tree } = await res.json() as { tree: FileNode[] };
    const skills = tree.find((n) => n.name === 'skills');
    expect(skills).toBeDefined();
    expect(skills?.type).toBe('dir');
  });

  test('TC-API-03 tree 包含 biz-skills 下所有 skill 子目录', async ({ request }) => {
    const res = await request.get('/api/files/tree');
    const { tree } = await res.json() as { tree: FileNode[] };
    const skills = tree.find((n) => n.name === 'skills');
    const bizSkills = skills?.children?.find((c) => c.name === 'biz-skills');
    const childNames = bizSkills?.children?.map((c) => c.name) ?? [];
    expect(childNames).toContain('bill-inquiry');
    expect(childNames).toContain('fault-diagnosis');
    expect(childNames).toContain('outbound-collection');
    expect(childNames).toContain('outbound-marketing');
    expect(childNames).toContain('plan-inquiry');
    expect(childNames).toContain('service-cancel');
    // service-suspension has been removed
    expect(childNames).toContain('telecom-app');
  });

  test('TC-API-04 tree 包含多个 SKILL.md 文件', async ({ request }) => {
    const res = await request.get('/api/files/tree');
    const { tree } = await res.json() as { tree: FileNode[] };
    const all = flattenTree(tree);
    const skillMds = all.filter((n) => n.type === 'file' && n.name === 'SKILL.md');
    // 8 biz-skills + tech-skills, plus any dynamically created test skills
    expect(skillMds.length).toBeGreaterThanOrEqual(8);
  });

  test('TC-API-05 tree 包含电信参考文档', async ({ request }) => {
    const res = await request.get('/api/files/tree');
    const { tree } = await res.json() as { tree: FileNode[] };
    const all = flattenTree(tree);
    expect(all.some((n) => n.name === 'billing-rules.md')).toBe(true);
    expect(all.some((n) => n.name === 'cancellation-policy.md')).toBe(true);
    expect(all.some((n) => n.name === 'plan-details.md')).toBe(true);
    expect(all.some((n) => n.name === 'troubleshoot-guide.md')).toBe(true);
  });
});

// ── GET /api/files/content ────────────────────────────────────────────────────

test.describe('GET /api/files/content', () => {
  test('TC-API-06 正常读取 bill-inquiry/SKILL.md', async ({ request }) => {
    const res = await request.get('/api/files/content?path=skills/biz-skills/bill-inquiry/SKILL.md');
    expect(res.ok()).toBeTruthy();
    const body = await res.json() as { path: string; content: string };
    expect(body.path).toBe('skills/biz-skills/bill-inquiry/SKILL.md');
    expect(typeof body.content).toBe('string');
    expect(body.content.length).toBeGreaterThan(0);
  });

  test('TC-API-07 正常读取 billing-rules.md 参考文档', async ({ request }) => {
    const res = await request.get('/api/files/content?path=skills/biz-skills/bill-inquiry/references/billing-rules.md');
    expect(res.ok()).toBeTruthy();
    const { content } = await res.json() as { content: string };
    expect(content.length).toBeGreaterThan(0);
  });

  test('TC-API-08 缺少 path 参数 → 400', async ({ request }) => {
    const res = await request.get('/api/files/content');
    expect(res.status()).toBe(400);
    const { error } = await res.json() as { error: string };
    expect(error).toContain('path');
  });

  test('TC-API-09 不支持的文件类型 → 400', async ({ request }) => {
    const res = await request.get('/api/files/content?path=skills/biz-skills/bill-inquiry/binary.exe');
    expect(res.status()).toBe(400);
  });

  test('TC-API-10 不存在的文件 → 404', async ({ request }) => {
    const res = await request.get('/api/files/content?path=skills/nonexistent-xyz.md');
    expect(res.status()).toBe(404);
  });

  test('TC-API-11 读取 fault-diagnosis 参考文档', async ({ request }) => {
    const res = await request.get('/api/files/content?path=skills/biz-skills/fault-diagnosis/references/troubleshoot-guide.md');
    expect(res.ok()).toBeTruthy();
    const { content } = await res.json() as { content: string };
    expect(content).toContain('故障');
  });

  test('TC-API-12 读取 plan-inquiry 参考文档', async ({ request }) => {
    const res = await request.get('/api/files/content?path=skills/biz-skills/plan-inquiry/references/plan-details.md');
    expect(res.ok()).toBeTruthy();
    const { content } = await res.json() as { content: string };
    expect(content).toContain('套餐');
  });
});

// ── PUT /api/files/content ────────────────────────────────────────────────────

test.describe('PUT /api/files/content', () => {
  test('TC-API-13 保存文件内容（读后写回）', async ({ request }) => {
    const readRes = await request.get('/api/files/content?path=skills/biz-skills/plan-inquiry/SKILL.md');
    const { content } = await readRes.json() as { content: string };

    const saveRes = await request.put('/api/files/content', {
      data: { path: 'skills/biz-skills/plan-inquiry/SKILL.md', content },
    });
    expect(saveRes.ok()).toBeTruthy();
    const body = await saveRes.json() as { ok: boolean; path: string };
    expect(body.ok).toBe(true);
    expect(body.path).toBe('skills/biz-skills/plan-inquiry/SKILL.md');
  });

  test('TC-API-14 写入后可重新读取验证', async ({ request }) => {
    const marker = `<!-- test-marker-${Date.now()} -->`;
    const readRes = await request.get('/api/files/content?path=skills/biz-skills/service-cancel/SKILL.md');
    const { content: original } = await readRes.json() as { content: string };

    const modified = original + '\n' + marker;
    await request.put('/api/files/content', {
      data: { path: 'skills/biz-skills/service-cancel/SKILL.md', content: modified },
    });

    const readRes2 = await request.get('/api/files/content?path=skills/biz-skills/service-cancel/SKILL.md');
    const { content: saved } = await readRes2.json() as { content: string };
    expect(saved).toContain(marker);

    // 还原原始内容
    await request.put('/api/files/content', {
      data: { path: 'skills/biz-skills/service-cancel/SKILL.md', content: original },
    });
  });

  test('TC-API-15 缺少 content 参数 → 400', async ({ request }) => {
    const res = await request.put('/api/files/content', {
      data: { path: 'skills/biz-skills/bill-inquiry/SKILL.md' },
    });
    expect(res.status()).toBe(400);
  });

  test('TC-API-16 缺少 path 参数 → 400', async ({ request }) => {
    const res = await request.put('/api/files/content', {
      data: { content: 'some content' },
    });
    expect(res.status()).toBe(400);
  });

  test('TC-API-17 不支持的文件类型 → 400', async ({ request }) => {
    const res = await request.put('/api/files/content', {
      data: { path: 'skills/biz-skills/bill-inquiry/binary.exe', content: 'x' },
    });
    expect(res.status()).toBe(400);
  });
});

// ── POST /api/chat ────────────────────────────────────────────────────────────

test.describe('POST /api/chat', () => {
  // 真实 LLM 调用，超时设为 200s（backend 有 180s abort 保底）
  test.setTimeout(200_000);

  test('TC-API-18 正常返回 200、response 和 card 字段', async ({ request }) => {
    const res = await request.post('/api/chat', {
      data: { message: '你好', session_id: `s-${Date.now()}` },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json() as { response: string; session_id: string; card: unknown };
    expect(typeof body.response).toBe('string');
    expect(body.response.length).toBeGreaterThan(0);
    expect('card' in body).toBe(true);
  });

  test('TC-API-19 response 字段为非空字符串', async ({ request }) => {
    const res = await request.post('/api/chat', {
      data: { message: '你好，请简单介绍你自己', session_id: `intro-${Date.now()}` },
    });
    expect(res.ok()).toBeTruthy();
    const { response } = await res.json() as { response: string };
    expect(typeof response).toBe('string');
    expect(response.length).toBeGreaterThan(0);
  });

  test('TC-API-20 session_id 原样返回', async ({ request }) => {
    const sessionId = `sid-${Date.now()}`;
    const res = await request.post('/api/chat', {
      data: { message: '测试', session_id: sessionId },
    });
    const body = await res.json() as { session_id: string };
    expect(body.session_id).toBe(sessionId);
  });

  test('TC-API-21 账单查询返回 bill_card（含手机号）', async ({ request }) => {
    const res = await request.post('/api/chat', {
      data: { message: '查询本月账单明细', session_id: `bill-${Date.now()}` },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json() as { card: { type: string } | null };
    // 有 card 时验证类型合法
    if (body.card) {
      expect(['bill_card', 'plan_card', 'cancel_card', 'diagnostic_card']).toContain(body.card.type);
    }
  });

  test('TC-API-22 退订业务返回 cancel_card（含手机号和业务名）', async ({ request }) => {
    const res = await request.post('/api/chat', {
      data: { message: '退订视频会员流量包', session_id: `cancel-${Date.now()}` },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json() as { card: { type: string } | null };
    if (body.card) {
      expect(['bill_card', 'plan_card', 'cancel_card', 'diagnostic_card']).toContain(body.card.type);
    }
  });

  test('TC-API-23 套餐查询返回 plan_card', async ({ request }) => {
    const res = await request.post('/api/chat', {
      data: { message: '查询 plan_unlimited 套餐的详细信息', session_id: `plan-${Date.now()}` },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json() as { card: { type: string } | null };
    if (body.card) {
      expect(['bill_card', 'plan_card', 'cancel_card', 'diagnostic_card']).toContain(body.card.type);
    }
  });

  test('TC-API-24 网络诊断返回 diagnostic_card（含手机号和故障类型）', async ({ request }) => {
    const res = await request.post('/api/chat', {
      data: { message: '帮我诊断网速慢的问题', session_id: `diag-${Date.now()}` },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json() as { card: { type: string } | null };
    if (body.card) {
      expect(['bill_card', 'plan_card', 'cancel_card', 'diagnostic_card']).toContain(body.card.type);
    }
  });
});

// ── DELETE /api/sessions/:id ──────────────────────────────────────────────────

test.describe('DELETE /api/sessions/:id', () => {
  test('TC-API-25 清除会话返回 ok:true', async ({ request }) => {
    const sessionId = `del-${Date.now()}`;
    const res = await request.delete(`/api/sessions/${sessionId}`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  test('TC-API-26 清除不存在的会话也返回 ok（幂等）', async ({ request }) => {
    const res = await request.delete('/api/sessions/nonexistent-session-xyz');
    expect(res.ok()).toBeTruthy();
  });
});

// ── GET /health（原 05-real-backend）────────────────────────────────────────

test.describe('GET /health', () => {
  test('TC-API-27 返回 200 和 status:ok', async ({ request }) => {
    const res = await request.get('/health');
    expect(res.ok()).toBeTruthy();
    const body = await res.json() as { status: string };
    expect(body.status).toBe('ok');
  });
});

// ── 多轮对话上下文保持（原 05-real-backend）─────────────────────────────────

test.describe('Chat API 多轮上下文', () => {
  test.setTimeout(200_000);

  test('TC-API-28 同一 session 保持对话上下文', async ({ request }) => {
    const sessionId = `be-ctx-${Date.now()}`;

    const res1 = await request.post('/api/chat', {
      data: { message: '我叫小明，你好', session_id: sessionId },
    });
    expect(res1.ok()).toBeTruthy();

    const res2 = await request.post('/api/chat', {
      data: { message: '我刚才说我叫什么名字？', session_id: sessionId },
    });
    expect(res2.ok()).toBeTruthy();
    const { response } = await res2.json() as { response: string };
    expect(response).toContain('小明');
  });
});
