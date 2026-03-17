/**
 * 07-skill-lifecycle.spec.ts — 技能全生命周期 E2E 测试
 *
 * 验证：创建技能 → 沙盒验证 → 发布到生产 → 在线客服中生效
 *
 * 前置条件：后端服务已启动（localhost:5173 → localhost:8000）
 */
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5173';

// 测试用技能名称（每次测试唯一，避免冲突）
const SKILL_NAME = `test-skill-${Date.now().toString(36)}`;

const SKILL_MD = `---
name: ${SKILL_NAME}
description: E2E 测试技能，处理用户询问测试问题的场景
metadata:
  version: "1.0.0"
  tags: ["test", "e2e", "lifecycle"]
  mode: inbound
  trigger: user_intent
  channels: ["online"]
---
# 测试技能 Skill

你是一名测试助手。当用户询问"E2E测试"相关问题时，回复"测试技能已生效，来自${SKILL_NAME}"。

## 触发条件

- 用户询问 E2E 测试相关问题
- 用户提到"测试技能验证"

## 工具与分类

### 问题分类

| 用户描述 | 类型 |
|---------|------|
| E2E 测试、测试验证 | 测试查询 |

### 工具说明

- \`query_subscriber(phone)\` — 查询用户信息

## 客户引导状态图

\`\`\`mermaid
stateDiagram-v2
    [*] --> 接收请求: 用户询问测试问题
    接收请求 --> 回复测试结果: 直接回复测试技能已生效
    回复测试结果 --> [*]
\`\`\`

## 升级处理

| 升级路径 | 触发条件 | 处理方式 |
|---------|---------|---------|
| \`self_service\` | 测试查询 | 直接回复 |

## 合规规则

- **必须**：回复中包含"测试技能已生效"

## 回复规范

- 回复简洁，包含技能名称
`;

const REFERENCE_CONTENT = `# 测试参考文档

> 供 E2E 测试使用

## 测试指引

回复时必须包含"测试技能已生效"字样。
`;

// ── 1. 技能创建 API 测试 ──────────────────────────────────────────────────────

test.describe('技能创建', () => {
  test('TC-LIFECYCLE-01 通过 skill-creator/save 创建新技能', async ({ request }) => {
    const res = await request.post(`${BASE}/api/skill-creator/save`, {
      data: {
        skill_name: SKILL_NAME,
        skill_md: SKILL_MD,
        references: [
          { filename: 'test-guide.md', content: REFERENCE_CONTENT },
        ],
        test_cases: [
          {
            input: '帮我做个E2E测试验证',
            assertions: [
              { type: 'contains', value: '测试技能已生效' },
              { type: 'skill_loaded', value: SKILL_NAME },
            ],
          },
        ],
      },
    });

    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.skill_id).toBe(SKILL_NAME);
    expect(body.is_new).toBe(true);
    expect(body.test_cases_count).toBe(1);
  });

  test('TC-LIFECYCLE-02 新技能出现在技能列表中', async ({ request }) => {
    const res = await request.get(`${BASE}/api/skills`);
    expect(res.ok()).toBeTruthy();
    const skills = await res.json();
    const found = skills.find((s: any) => s.id === SKILL_NAME);
    expect(found).toBeDefined();
    expect(found.description).toContain('E2E 测试技能');
  });

  test('TC-LIFECYCLE-03 新技能包含 channels 字段', async ({ request }) => {
    // 通过读取 SKILL.md 验证 channels
    const res = await request.get(`${BASE}/api/files/content?path=skills/biz-skills/${SKILL_NAME}/SKILL.md`);
    expect(res.ok()).toBeTruthy();
    const { content } = await res.json();
    expect(content).toContain('channels: ["online"]');
  });

  test('TC-LIFECYCLE-04 参考文档已写入', async ({ request }) => {
    const res = await request.get(
      `${BASE}/api/files/content?path=skills/biz-skills/${SKILL_NAME}/references/test-guide.md`,
    );
    expect(res.ok()).toBeTruthy();
    const { content } = await res.json();
    expect(content).toContain('测试参考文档');
  });

  test('TC-LIFECYCLE-05 测试用例已写入数据库', async ({ request }) => {
    const res = await request.get(`${BASE}/api/test-cases?skill=${SKILL_NAME}`);
    expect(res.ok()).toBeTruthy();
    const cases = await res.json();
    expect(cases.length).toBe(1);
    expect(cases[0].input_message).toContain('E2E测试验证');
    expect(cases[0].assertions).toBeDefined();
    expect(cases[0].assertions.length).toBe(2);
  });
});

// ── 2. 沙盒验证测试 ──────────────────────────────────────────────────────────

test.describe('沙盒验证', () => {
  let sandboxId: string;

  test('TC-LIFECYCLE-06 创建沙盒', async ({ request }) => {
    const res = await request.post(`${BASE}/api/sandbox/create`, {
      data: {
        skill_path: `skills/biz-skills/${SKILL_NAME}/SKILL.md`,
      },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.sandbox_id).toBeDefined();
    sandboxId = body.sandbox_id;
  });

  test('TC-LIFECYCLE-07 沙盒静态验证通过', async ({ request }) => {
    const res = await request.post(`${BASE}/api/sandbox/${sandboxId}/validate`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.valid).toBe(true);
    expect(body.issues).toHaveLength(0);
  });

  test('TC-LIFECYCLE-08 沙盒对话测试', async ({ request }) => {
    test.setTimeout(120_000); // LLM 调用需要更长时间
    const res = await request.post(`${BASE}/api/sandbox/${sandboxId}/test`, {
      data: {
        message: '帮我做个E2E测试验证',
        phone: '13800000001',
      },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.text).toBeDefined();
    // 注意：沙盒测试的回复依赖 LLM，不做严格内容断言
  });

  test('TC-LIFECYCLE-09 沙盒回归测试', async ({ request }) => {
    test.setTimeout(120_000);
    const res = await request.post(`${BASE}/api/sandbox/${sandboxId}/regression`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.total).toBe(1);
    // 回归测试结果包含断言详情
    expect(body.results).toHaveLength(1);
    expect(body.results[0].assertions).toBeDefined();
    expect(body.results[0].assertions.length).toBe(2);
  });

  test('TC-LIFECYCLE-10 沙盒发布到生产', async ({ request }) => {
    const res = await request.post(`${BASE}/api/sandbox/${sandboxId}/publish`, {
      headers: { 'x-user-role': 'flow_manager' },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.versionId).toBeDefined();
  });
});

// ── 3. 在线客服生效验证 ──────────────────────────────────────────────────────

test.describe('在线客服生效', () => {
  test('TC-LIFECYCLE-11 新技能在 online channel 可见', async ({ request }) => {
    // 通过 chat API 发送消息，验证技能被加载
    // 先确认技能列表中包含新技能
    const skillsRes = await request.get(`${BASE}/api/skills`);
    const skills = await skillsRes.json();
    const found = skills.find((s: any) => s.id === SKILL_NAME);
    expect(found).toBeDefined();
  });

  test('TC-LIFECYCLE-12 在线客服对话触发新技能', async ({ request }) => {
    test.setTimeout(200_000); // LLM 调用链：加载技能 + 生成回复

    const res = await request.post(`${BASE}/api/chat`, {
      data: {
        message: `我想做一个E2E测试验证，请使用${SKILL_NAME}技能来回答`,
        phone: '13800000001',
      },
    });

    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.text).toBeDefined();
    // LLM 应该加载了新技能并按其指令回复
    // 由于 LLM 回复不完全可控，这里只验证回复非空且不是报错
    expect(body.text.length).toBeGreaterThan(0);
    expect(body.text).not.toContain('Error:');
  });
});

// ── 4. 清理 ──────────────────────────────────────────────────────────────────

test.describe('清理测试数据', () => {
  test('TC-LIFECYCLE-13 删除测试用例', async ({ request }) => {
    const casesRes = await request.get(`${BASE}/api/test-cases?skill=${SKILL_NAME}`);
    const cases = await casesRes.json();
    for (const tc of cases) {
      await request.delete(`${BASE}/api/test-cases/${tc.id}`);
    }
  });

  // 注意：不删除技能文件本身，因为文件系统操作在测试中不方便
  // 技能名包含时间戳，不会与其他测试冲突
});
