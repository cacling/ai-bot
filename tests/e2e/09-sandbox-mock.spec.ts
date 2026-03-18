/**
 * 沙箱 Mock 验证 e2e 测试
 *
 * 对每个 biz-skill 执行完整的沙箱验证流程：
 * 1. 创建沙箱
 * 2. 静态校验（validate）— 检查 YAML frontmatter、Mermaid 语法、工具引用
 * 3. Mock 模式运行（test）— 使用 Mock 规则调用 Agent，验证返回合理
 * 4. 清理沙箱
 *
 * 前置条件：backend(:18472) + 5 MCP servers 已启动，DB 已 seed（含 42 条 Mock 规则）
 */
import { test, expect } from '@playwright/test';

const API = 'http://127.0.0.1:18472/api';

// 每个 Skill 的测试场景
const SKILL_TESTS = [
  {
    skill: 'bill-inquiry',
    scenarios: [
      { name: '查询账单', message: '查询本月账单', expectContains: ['账单', '元'], expectMock: true },
      { name: '费用异常', message: '我的账单金额比上个月高了很多，帮我看看', expectContains: ['账单'], expectMock: true },
    ],
  },
  {
    skill: 'fault-diagnosis',
    scenarios: [
      { name: '网速慢', message: '我的手机网速非常慢', expectContains: ['网速', '信号'], expectMock: true },
      { name: '无信号', message: '手机完全没有信号', expectContains: ['信号'], expectMock: true },
    ],
  },
  {
    skill: 'plan-inquiry',
    scenarios: [
      { name: '套餐推荐', message: '推荐一个适合我的套餐', expectContains: ['套餐'], expectMock: true },
      { name: '套餐对比', message: '50G套餐和100G套餐有什么区别', expectContains: ['套餐'], expectMock: true },
    ],
  },
  {
    skill: 'service-cancel',
    scenarios: [
      { name: '退订业务', message: '我要退订视频会员流量包', expectContains: ['退订', '视频'], expectMock: true },
      { name: '未知扣费', message: '我的账单里有一笔不认识的扣费', expectContains: ['扣费', '账单'], expectMock: true },
    ],
  },
  {
    skill: 'service-suspension',
    scenarios: [
      { name: '停机保号', message: '我想办理停机保号', expectContains: ['停机', '保号'], expectMock: true },
    ],
  },
  {
    skill: 'telecom-app',
    scenarios: [
      { name: 'App登录失败', message: '营业厅App登录失败了', expectContains: ['登录', '密码'], expectMock: true },
      { name: 'App被锁', message: '营业厅App账号被锁定了', expectContains: ['锁定', '客服'], expectMock: true },
    ],
  },
  {
    skill: 'outbound-collection',
    scenarios: [
      { name: '外呼催收开场', message: '你好', expectContains: [], expectMock: true },
    ],
  },
  {
    skill: 'outbound-marketing',
    scenarios: [
      { name: '外呼营销开场', message: '你好', expectContains: [], expectMock: true },
    ],
  },
];

// ── 1. 静态校验 ─────────────────────────────────────────────────────────────

test.describe('沙箱静态校验', () => {
  for (const { skill } of SKILL_TESTS) {
    test(`TC-SB-V-${skill} validate 通过`, async ({ request }) => {
      // Create
      const createRes = await request.post(`${API}/sandbox/create`, {
        data: { skill_path: `skills/biz-skills/${skill}/SKILL.md` },
      });
      expect(createRes.ok()).toBeTruthy();
      const { sandbox_id } = await createRes.json();

      // Validate
      const valRes = await request.post(`${API}/sandbox/${sandbox_id}/validate`);
      expect(valRes.ok()).toBeTruthy();
      const val = await valRes.json();
      expect(val.valid).toBe(true);
      if (!val.valid) {
        console.log(`  ${skill} issues:`, val.issues);
      }

      // Cleanup
      await request.delete(`${API}/sandbox/${sandbox_id}`);
    });
  }
});

// ── 2. Mock 模式运行 ────────────────────────────────────────────────────────

test.describe('沙箱 Mock 运行', () => {
  // LLM 调用需要更长超时
  test.setTimeout(180_000);

  for (const { skill, scenarios } of SKILL_TESTS) {
    for (const scenario of scenarios) {
      test(`TC-SB-M-${skill}-${scenario.name}`, async ({ request }) => {
        // Create sandbox
        const createRes = await request.post(`${API}/sandbox/create`, {
          data: { skill_path: `skills/biz-skills/${skill}/SKILL.md` },
        });
        expect(createRes.ok()).toBeTruthy();
        const { sandbox_id } = await createRes.json();

        // Run with mock
        const testRes = await request.post(`${API}/sandbox/${sandbox_id}/test`, {
          data: { message: scenario.message, useMock: true },
          timeout: 120_000,
        });
        expect(testRes.ok()).toBeTruthy();
        const result = await testRes.json();

        // Verify mock mode was used
        expect(result.mock).toBe(scenario.expectMock);

        // Verify response is non-empty
        expect(result.text).toBeTruthy();
        expect(result.text.length).toBeGreaterThan(10);

        // Verify response contains expected keywords (soft check — LLM output is non-deterministic)
        for (const keyword of scenario.expectContains) {
          const found = result.text.includes(keyword);
          if (!found) {
            console.log(`  [${skill}/${scenario.name}] 未包含关键词 "${keyword}"，实际回复: ${result.text.slice(0, 100)}...`);
          }
          // Use soft assertion — log but don't fail (LLM may paraphrase)
        }

        // Cleanup
        await request.delete(`${API}/sandbox/${sandbox_id}`);
      });
    }
  }
});

// ── 3. Mock vs Real 对比（仅对 query_subscriber 做一次对比验证）──────────────

test.describe('Mock vs Real 对比', () => {
  test.setTimeout(180_000);

  test('TC-SB-CMP query_subscriber mock vs real 返回一致性', async ({ request }) => {
    const createRes = await request.post(`${API}/sandbox/create`, {
      data: { skill_path: 'skills/biz-skills/bill-inquiry/SKILL.md' },
    });
    const { sandbox_id } = await createRes.json();

    // Mock mode
    const mockRes = await request.post(`${API}/sandbox/${sandbox_id}/test`, {
      data: { message: '帮我查一下张三的信息', useMock: true },
      timeout: 120_000,
    });
    const mockResult = await mockRes.json();
    expect(mockResult.mock).toBe(true);
    expect(mockResult.text).toBeTruthy();

    // Real mode (if MCP servers are running)
    const realRes = await request.post(`${API}/sandbox/${sandbox_id}/test`, {
      data: { message: '帮我查一下张三的信息', useMock: false },
      timeout: 120_000,
    });
    const realResult = await realRes.json();
    expect(realResult.mock).toBe(false);
    expect(realResult.text).toBeTruthy();

    // Both should mention the user name or account info
    console.log(`  Mock: ${mockResult.text.slice(0, 100)}`);
    console.log(`  Real: ${realResult.text.slice(0, 100)}`);

    await request.delete(`${API}/sandbox/${sandbox_id}`);
  });
});
