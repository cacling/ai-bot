/**
 * 技能测试流程 e2e 测试
 *
 * 完整流程：创建新版本 → 校验 → 直接测试 → 发布 → 验证
 * 对每个 biz-skill 执行。
 */
import { test, expect } from '@playwright/test';

const API = 'http://127.0.0.1:18472/api';

const SKILLS = [
  { id: 'bill-inquiry', testMsg: '查询本月账单' },
  { id: 'fault-diagnosis', testMsg: '我的手机网速很慢' },
  { id: 'plan-inquiry', testMsg: '有什么套餐推荐' },
  { id: 'service-cancel', testMsg: '退订视频会员' },
  { id: 'service-suspension', testMsg: '我想办理停机保号' },
  { id: 'telecom-app', testMsg: '营业厅App登录失败' },
  { id: 'outbound-collection', testMsg: '你好' },
  { id: 'outbound-marketing', testMsg: '你好' },
];

test.describe.serial('技能测试完整流程', () => {
  test.setTimeout(180_000);

  for (const skill of SKILLS) {
    test(`${skill.id}: 创建版本 → 测试 → 发布`, async ({ request }) => {
      // 1. 记录已发布版本
      const listRes = await request.get(`${API}/skill-versions?skill=${skill.id}`);
      const versions = (await listRes.json()).versions;
      const publishedVersion = versions.find((v: { status: string }) => v.status === 'published');
      expect(publishedVersion).toBeTruthy();

      // 2. 创建新版本
      const createRes = await request.post(`${API}/skill-versions/create-from`, {
        data: { skill: skill.id, from_version: publishedVersion.version_no, description: 'e2e 测试版本' },
      });
      expect(createRes.ok()).toBeTruthy();
      const { versionNo } = await createRes.json();

      // 3. 直接测试（无需创建沙箱）
      const testRes = await request.post(`${API}/skill-versions/test`, {
        data: { skill: skill.id, version_no: versionNo, message: skill.testMsg },
        timeout: 120_000,
      });
      expect(testRes.ok()).toBeTruthy();
      const testResult = await testRes.json();
      expect(testResult.mock).toBe(true);
      expect(testResult.text).toBeTruthy();
      expect(testResult.text.length).toBeGreaterThan(5);

      // 4. 发布
      const pubRes = await request.post(`${API}/skill-versions/publish`, {
        data: { skill: skill.id, version_no: versionNo },
      });
      expect(pubRes.ok()).toBeTruthy();

      // 5. 验证
      const afterVersions = (await (await request.get(`${API}/skill-versions?skill=${skill.id}`)).json()).versions;
      expect(afterVersions.find((v: { version_no: number }) => v.version_no === versionNo).status).toBe('published');
      expect(afterVersions.find((v: { version_no: number }) => v.version_no === publishedVersion.version_no).status).toBe('saved');
    });
  }
});

test.describe('Mock vs Real 模式测试', () => {
  test.setTimeout(180_000);

  test('Mock 模式：工具走 Mock 规则', async ({ request }) => {
    const testRes = await request.post(`${API}/skill-versions/test`, {
      data: { skill: 'bill-inquiry', version_no: 1, message: '查询本月账单', useMock: true },
      timeout: 120_000,
    });
    expect(testRes.ok()).toBeTruthy();
    const result = await testRes.json();
    expect(result.mock).toBe(true);
    expect(result.text).toBeTruthy();
  });

  test('Real 模式：工具走真实 MCP Server', async ({ request }) => {
    const testRes = await request.post(`${API}/skill-versions/test`, {
      data: { skill: 'bill-inquiry', version_no: 1, message: '查询本月账单', useMock: false },
      timeout: 120_000,
    });
    expect(testRes.ok()).toBeTruthy();
    const result = await testRes.json();
    expect(result.mock).toBe(false);
    expect(result.text).toBeTruthy();
  });

  test('默认为 Mock 模式（不传 useMock）', async ({ request }) => {
    const testRes = await request.post(`${API}/skill-versions/test`, {
      data: { skill: 'bill-inquiry', version_no: 1, message: '你好' },
      timeout: 120_000,
    });
    expect(testRes.ok()).toBeTruthy();
    const result = await testRes.json();
    expect(result.mock).toBe(true);
  });
});

test.describe('有草稿时不可发布', () => {
  test('draft 文件阻止发布', async ({ request }) => {
    const createRes = await request.post(`${API}/skill-versions/create-from`, {
      data: { skill: 'bill-inquiry', from_version: 1, description: 'draft test' },
    });
    const { versionNo } = await createRes.json();
    const detailRes = await request.get(`${API}/skill-versions/bill-inquiry/${versionNo}`);
    const { version } = await detailRes.json();

    // 写入 .draft
    await request.put(`${API}/files/draft`, {
      data: { path: `skills/${version.snapshot_path}/SKILL.md`, content: '草稿' },
    });

    // 发布被拒绝
    const pubRes = await request.post(`${API}/skill-versions/publish`, {
      data: { skill: 'bill-inquiry', version_no: versionNo },
    });
    expect(pubRes.ok()).toBeFalsy();
    expect((await pubRes.json()).error).toContain('未保存');

    // 清理 .draft 后可发布
    await request.delete(`${API}/files/draft?path=skills/${version.snapshot_path}/SKILL.md`);
    const pubRes2 = await request.post(`${API}/skill-versions/publish`, {
      data: { skill: 'bill-inquiry', version_no: versionNo },
    });
    expect(pubRes2.ok()).toBeTruthy();
  });
});
