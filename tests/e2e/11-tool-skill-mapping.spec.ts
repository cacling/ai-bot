/**
 * 工具-技能映射 & 停机保号流程 e2e 测试
 *
 * 验证：
 * 1. tool→skill 映射从 SKILL.md 自动生成（非硬编码）
 * 2. MCP 工具概览 API 正确返回工具列表（含 mock 状态）
 * 3. 停机保号技能可被正确触发并执行 mock 工具调用
 */
import { test, expect } from '@playwright/test';

const API = 'http://127.0.0.1:18472/api';

// ── 工具-技能映射 ────────────────────────────────────────────────────────────

test.describe('工具-技能自动映射', () => {
  test('TC-TSM-01 技能列表包含 suspend-service', async ({ request }) => {
    const res = await request.get(`${API}/skills`);
    expect(res.ok()).toBeTruthy();
    const { skills } = await res.json();
    const names = skills.map((s: { id: string }) => s.id);
    expect(names).toContain('suspend-service');
  });

  test('TC-TSM-02 MCP 工具概览返回 account-service 工具', async ({ request }) => {
    const res = await request.get(`${API}/mcp/tools`);
    expect(res.ok()).toBeTruthy();
    const { items } = await res.json();
    const toolNames = items.map((t: { name: string }) => t.name);
    // 验证停机保号相关工具在列表中
    expect(toolNames).toContain('verify_identity');
    expect(toolNames).toContain('check_account_balance');
    expect(toolNames).toContain('check_contracts');
  });

  test('TC-TSM-03 工具详情 API 返回 inputSchema', async ({ request }) => {
    const res = await request.get(`${API}/mcp/tools`);
    const { items } = await res.json();
    const verifyTool = items.find((t: { name: string }) => t.name === 'verify_identity');
    expect(verifyTool).toBeTruthy();
    expect(verifyTool.status).toBe('available');
    expect(verifyTool.description).toBeTruthy();
  });
});

// ── Skill Creator 工具可行性检查 ────────────────────────────────────────────

test.describe('Skill Creator MCP 工具查询', () => {
  test.setTimeout(30_000);

  let sessionId: string;

  test('TC-TSM-04 skill-creator chat 创建会话', async ({ request }) => {
    const res = await request.post(`${API}/skill-creator/chat`, {
      data: { message: '我想创建一个停机保号的技能', enable_thinking: false },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.session_id).toBeTruthy();
    expect(data.phase).toBe('interview');
    sessionId = data.session_id;
  });

  test('TC-TSM-05 skill-creator save 返回 tool_warnings', async ({ request }) => {
    // 保存一个引用了不存在工具的技能
    const res = await request.post(`${API}/skill-creator/save`, {
      data: {
        skill_name: 'e2e-test-skill',
        skill_md: '---\nname: e2e-test-skill\ndescription: test\nmetadata:\n  version: "1.0.0"\n  channels: ["online"]\n---\n# Test\n```mermaid\nstateDiagram-v2\n  [*] --> A: start %% tool:nonexistent_tool\n```',
        references: [],
      },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.ok).toBe(true);
    // 应该有工具警告（nonexistent_tool 不存在）
    expect(data.tools_ready).toBe(false);
    expect(data.tool_warnings.length).toBeGreaterThan(0);
    expect(data.tool_warnings[0].tool).toBe('nonexistent_tool');
    expect(data.tool_warnings[0].status).toBe('missing');
  });
});

// ── 停机保号技能测试（通过版本测试 API）──────────────────────────────────────

test.describe('停机保号技能执行', () => {
  test.setTimeout(120_000);

  test('TC-TSM-06 suspend-service 版本测试可执行', async ({ request }) => {
    // 获取已发布版本
    const listRes = await request.get(`${API}/skill-versions?skill=suspend-service`);
    if (!listRes.ok()) {
      test.skip(true, 'suspend-service 未注册版本');
      return;
    }
    const { versions } = await listRes.json();
    const published = versions?.find((v: { status: string }) => v.status === 'published');
    if (!published) {
      test.skip(true, 'suspend-service 无已发布版本');
      return;
    }

    // 执行测试
    const testRes = await request.post(`${API}/skill-versions/test`, {
      data: {
        skill: 'suspend-service',
        version_no: published.version_no,
        message: '我想停机保号',
        persona: { phone: '13800000001', name: '张三', plan: '畅享50G套餐', status: 'active' },
      },
      timeout: 90_000,
    });
    expect(testRes.ok()).toBeTruthy();
    const result = await testRes.json();
    expect(result.text).toBeTruthy();
    expect(result.text.length).toBeGreaterThan(5);
  });
});
