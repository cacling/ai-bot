/**
 * SOP 步骤遵循验证 — UI 驱动 E2E 测试
 *
 * 通过打开客户侧页面进行多轮对话，验证 Agent 严格按 SOP 状态图步骤走。
 * 每个场景至少 3 步，覆盖主流程和分支。
 *
 * 验证策略：
 * - 每一步检查 bot 回复中包含"当前步骤应有的特征"
 * - 每一步检查 bot 回复不含"跳步信号"（提前执行的证据）
 * - 多轮对话验证状态连续性
 *
 * 运行方式：
 *   cd frontend/tests/e2e && npx playwright test 12-sop-ui-verification.spec.ts --headed
 *
 * 依赖：
 *   - 服务已启动（./start.sh 或 ./start.sh --reset）
 *   - 测试用户 13800000001（张三）有 video_pkg 和 sms_100 两个增值业务
 */
import { test, expect, type Page } from '@playwright/test';

// ── 辅助函数 ─────────────────────────────────────────────────────────────

async function waitForChatWs(page: Page): Promise<void> {
  let wsCount = 0;
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 10_000);
    page.on('websocket', (ws) => {
      if (!ws.url().includes('/ws/chat')) return;
      wsCount++;
      if (wsCount >= 2) {
        setTimeout(() => { clearTimeout(timer); resolve(); }, 500);
      }
    });
  });
}

async function sendMessage(page: Page, text: string) {
  const input = page.getByPlaceholder(/输入您的问题/);
  await expect(input).toBeEnabled({ timeout: 10_000 });
  await input.fill(text);
  await input.press('Enter');
}

async function waitForBotReply(page: Page) {
  try {
    await expect(page.locator('.animate-bounce').first()).toBeVisible({ timeout: 5_000 });
  } catch { /* 响应太快 */ }
  await expect(page.locator('.animate-bounce').first()).not.toBeVisible({ timeout: 150_000 });
}

async function getLastBotReply(page: Page): Promise<string> {
  const botMessages = page.locator('.markdown-body');
  const count = await botMessages.count();
  if (count === 0) return '';
  return (await botMessages.nth(count - 1).textContent()) ?? '';
}

/** 跳步信号 — 如果在不该出现的步骤出现这些词，说明 Agent 跳过了前置步骤 */
const PREMATURE_CANCEL_SIGNALS = ['已退订成功', '退订成功', '已为您退订', '已成功退订', '退订已生效'];
const PREMATURE_ACTION_SIGNALS = ['已办理成功', '已取消成功', '已开通', '已恢复'];

// ── 场景一：标准退订 happy path（4 轮对话，5 个 SOP 步骤） ────────────────

test.describe.serial('场景一：标准退订完整流程', () => {
  test.setTimeout(300_000); // 多轮对话需要更长时间

  test('SOP-FLOW-01: 查询→选择→确认→退订→结束', async ({ page }) => {
    const wsReady = waitForChatWs(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '智能客服小通' })).toBeVisible();
    await wsReady;

    // ── Step 1: 用户说退订 → bot 应该先查询，展示已订业务列表 ──
    await sendMessage(page, '帮我看看我订了哪些增值业务，有不需要的想退掉');
    await waitForBotReply(page);
    const reply1 = await getLastBotReply(page);

    // 验证：调了 query_subscriber，回复应包含业务信息
    expect(reply1.length, '第 1 步回复不应为空').toBeGreaterThan(20);
    // 应该有业务名称（视频会员 或 短信包）
    const hasServiceInfo = /视频|短信|流量包|增值业务|sms|video/.test(reply1);
    expect(hasServiceInfo, '第 1 步应展示已订业务信息').toBe(true);
    // 不应该出现退订成功（还没确认呢）
    for (const signal of PREMATURE_CANCEL_SIGNALS) {
      expect(reply1, `第 1 步不应出现 "${signal}"`).not.toContain(signal);
    }

    // ── Step 2: 用户选择要退订的业务 → bot 应说明退订影响并请求确认 ──
    await sendMessage(page, '帮我把视频会员流量包退掉');
    await waitForBotReply(page);
    const reply2 = await getLastBotReply(page);

    expect(reply2.length, '第 2 步回复不应为空').toBeGreaterThan(10);
    // 应该有影响说明或确认请求
    const hasImpactOrConfirm = /影响|生效|确认|是否|次月|本月/.test(reply2);
    expect(hasImpactOrConfirm, '第 2 步应说明影响或请求确认').toBe(true);
    // 不应该已经退订完成（还没确认）
    for (const signal of PREMATURE_CANCEL_SIGNALS) {
      expect(reply2, `第 2 步不应出现 "${signal}"`).not.toContain(signal);
    }

    // ── Step 3: 用户确认退订 → bot 应执行 cancel_service 并反馈结果 ──
    await sendMessage(page, '确认退订');
    await waitForBotReply(page);
    const reply3 = await getLastBotReply(page);

    expect(reply3.length, '第 3 步回复不应为空').toBeGreaterThan(10);
    // 确认后应该有退订结果（成功或失败都行，关键是走到了执行步骤）
    const hasResult = /退订|取消|生效|成功|失败|处理/.test(reply3);
    expect(hasResult, '第 3 步应有退订执行结果').toBe(true);

    // ── Step 4: bot 问是否还有其他要退订 → 用户说没有了 → 结束 ──
    await sendMessage(page, '没有了，谢谢');
    await waitForBotReply(page);
    const reply4 = await getLastBotReply(page);
    expect(reply4.length, '第 4 步回复不应为空').toBeGreaterThan(5);
  });
});

// ── 场景二：未知扣费路径（3 轮对话，4 个 SOP 步骤） ────────────────────

test.describe.serial('场景二：未知扣费查询→解释→退订', () => {
  test.setTimeout(300_000);

  test('SOP-FLOW-02: 查账单→解释费用→确认退订→结果', async ({ page }) => {
    const wsReady = waitForChatWs(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '智能客服小通' })).toBeVisible();
    await wsReady;

    // ── Step 1: 用户说有不明扣费 → bot 应先查账单明细 ──
    await sendMessage(page, '我这个月话费单里有一笔不认识的费用，帮我查查是什么');
    await waitForBotReply(page);
    const reply1 = await getLastBotReply(page);

    expect(reply1.length, '第 1 步回复不应为空').toBeGreaterThan(20);
    // 应该有费用/账单相关内容（说明调了 query_bill 或 query_subscriber）
    const hasFeeInfo = /费用|账单|扣费|月费|元|¥|\d+/.test(reply1);
    expect(hasFeeInfo, '第 1 步应展示费用信息').toBe(true);
    // 不应该直接退订
    for (const signal of PREMATURE_CANCEL_SIGNALS) {
      expect(reply1, `第 1 步不应出现 "${signal}"`).not.toContain(signal);
    }

    // ── Step 2: bot 解释了费用来源 → 用户要求退订 → bot 应确认 ──
    await sendMessage(page, '这个视频会员流量包我不需要，帮我退掉');
    await waitForBotReply(page);
    const reply2 = await getLastBotReply(page);

    expect(reply2.length, '第 2 步回复不应为空').toBeGreaterThan(10);
    // 应该说明影响或请求确认
    const hasConfirmRequest = /确认|影响|生效|是否|退订|取消|费用|月费|退|不再/.test(reply2);
    expect(hasConfirmRequest, '第 2 步应请求确认或说明影响').toBe(true);

    // ── Step 3: 用户确认 → bot 执行退订 → 反馈结果 ──
    await sendMessage(page, '确认，帮我退了');
    await waitForBotReply(page);
    const reply3 = await getLastBotReply(page);

    expect(reply3.length, '第 3 步回复不应为空').toBeGreaterThan(10);
    const hasResult = /退订|取消|生效|成功|处理|次月/.test(reply3);
    expect(hasResult, '第 3 步应有退订结果').toBe(true);
  });
});

// ── 场景三：用户取消分支（3 轮对话） ────────────────────────────────────

test.describe.serial('场景三：查询后用户放弃退订', () => {
  test.setTimeout(300_000);

  test('SOP-FLOW-03: 查询→说明影响→用户取消→不执行', async ({ page }) => {
    const wsReady = waitForChatWs(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '智能客服小通' })).toBeVisible();
    await wsReady;

    // ── Step 1: 用户说退订 → bot 查询 ──
    await sendMessage(page, '帮我查一下短信百条包的退订影响');
    await waitForBotReply(page);
    const reply1 = await getLastBotReply(page);
    expect(reply1.length).toBeGreaterThan(10);

    // ── Step 2: bot 说明影响 → 用户说不退了 ──
    await sendMessage(page, '算了，影响太大，我先不退了');
    await waitForBotReply(page);
    const reply2 = await getLastBotReply(page);

    // 不应该执行退订
    for (const signal of PREMATURE_CANCEL_SIGNALS) {
      expect(reply2, `取消后不应出现 "${signal}"`).not.toContain(signal);
    }

    // ── Step 3: 验证 bot 确认了取消并给出后续建议 ──
    expect(reply2.length).toBeGreaterThan(5);
    // 应该有告别或后续建议
    const hasClosing = /好的|了解|如有|需要|随时|帮助|其他/.test(reply2);
    expect(hasClosing, '取消后应有礼貌回应').toBe(true);
  });
});

// ── 场景四：账单查询完整流程（3 步） ──────────────────────────────────────

test.describe.serial('场景四：账单查询多步流程', () => {
  test.setTimeout(300_000);

  test('SOP-FLOW-04: 查身份→查账单→解读费用', async ({ page }) => {
    const wsReady = waitForChatWs(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '智能客服小通' })).toBeVisible();
    await wsReady;

    // ── Step 1: 查账单 → bot 应调工具查询并展示结果 ──
    await sendMessage(page, '帮我查一下本月的话费账单明细');
    await waitForBotReply(page);
    const reply1 = await getLastBotReply(page);

    // 应有具体金额
    expect(reply1).toMatch(/\d+/);
    const hasBillInfo = /账单|费用|月费|套餐|元|¥/.test(reply1);
    expect(hasBillInfo, '第 1 步应展示账单信息').toBe(true);

    // ── Step 2: 用户追问某项费用 → bot 应解读 ──
    await sendMessage(page, '增值业务费是什么？为什么扣了这么多');
    await waitForBotReply(page);
    const reply2 = await getLastBotReply(page);

    expect(reply2.length).toBeGreaterThan(20);
    // 应该有解释性内容
    const hasExplanation = /增值|业务|视频|短信|流量|订购|月费|费用/.test(reply2);
    expect(hasExplanation, '第 2 步应解释费用明细').toBe(true);
    // 不应该直接帮退订（用户没说要退）
    for (const signal of PREMATURE_CANCEL_SIGNALS) {
      expect(reply2, `账单查询步骤不应出现 "${signal}"`).not.toContain(signal);
    }

    // ── Step 3: 用户问话费异常 → bot 应分析 ──
    await sendMessage(page, '和上个月比是不是多了？');
    await waitForBotReply(page);
    const reply3 = await getLastBotReply(page);
    expect(reply3.length).toBeGreaterThan(10);
  });
});

// ── 场景五：故障诊断→排查→方案（3 步） ───────────────────────────────────

test.describe.serial('场景五：故障诊断多步流程', () => {
  test.setTimeout(300_000);

  test('SOP-FLOW-05: 描述问题→诊断→给方案', async ({ page }) => {
    const wsReady = waitForChatWs(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '智能客服小通' })).toBeVisible();
    await wsReady;

    // ── Step 1: 用户描述网络问题 → bot 应先诊断 ──
    await sendMessage(page, '我的手机上网很慢，信号也不太好');
    await waitForBotReply(page);
    const reply1 = await getLastBotReply(page);

    expect(reply1.length).toBeGreaterThan(20);
    // 应有诊断相关内容
    const hasDiagInfo = /诊断|网络|信号|基站|APN|网速|检测|排查/.test(reply1);
    expect(hasDiagInfo, '第 1 步应有诊断信息').toBe(true);
    // 不应该直接说已修复
    expect(reply1).not.toContain('已修复');
    expect(reply1).not.toContain('已恢复');

    // ── Step 2: 用户追问 → bot 给出具体建议 ──
    await sendMessage(page, '怎么解决呢？能帮我处理一下吗');
    await waitForBotReply(page);
    const reply2 = await getLastBotReply(page);

    expect(reply2.length).toBeGreaterThan(10);
    // 应有解决方案
    const hasSolution = /建议|尝试|重启|设置|APN|联系|拨打|营业厅|恢复|检查|解决|方案|操作|步骤|可以|帮|处理/.test(reply2);
    expect(hasSolution, '第 2 步应有解决建议').toBe(true);

    // ── Step 3: 用户问还有什么办法 → bot 应有后续路径 ──
    await sendMessage(page, '试了还是不行怎么办');
    await waitForBotReply(page);
    const reply3 = await getLastBotReply(page);
    expect(reply3.length).toBeGreaterThan(10);
    // 应有升级路径（转人工/拨打10086/营业厅）
    const hasEscalation = /人工|10086|营业厅|工单|工程师|进一步/.test(reply3);
    expect(hasEscalation, '第 3 步应有升级路径').toBe(true);
  });
});

// ── 场景六：转人工随时可用 + 会话重置 ─────────────────────────────────────

test.describe.serial('场景六：全局出口验证', () => {
  test.setTimeout(200_000);

  test('SOP-FLOW-06: 流程中途转人工不受 SOP 阻断', async ({ page }) => {
    const wsReady = waitForChatWs(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '智能客服小通' })).toBeVisible();
    await wsReady;

    // 先进入一个 skill 流程
    await sendMessage(page, '帮我查一下话费账单');
    await waitForBotReply(page);

    // 中途要求转人工 → 不应被 SOP 阻断
    await sendMessage(page, '我要转人工');
    await waitForBotReply(page);
    const reply = await getLastBotReply(page);

    const hasTransfer = /转接|人工客服|稍候|稍等|转人工|正在/.test(reply);
    expect(hasTransfer, '转人工请求必须被响应').toBe(true);
  });
});
