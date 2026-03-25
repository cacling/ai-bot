/**
 * fault-diagnosis SOP 多轮对话流程测试
 *
 * 验证故障诊断技能的 SOP 步骤遵循：描述问题→诊断→给方案→升级路径。
 *
 * 依赖：服务已启动（./start.sh 或 ./start.sh --reset）
 */
import { test, expect } from '@playwright/test';
import { waitForChatWs, sendMessage, waitForBotReply, getLastBotReply } from '../../fixtures/chat-helpers';

test.describe.serial('fault-diagnosis SOP: 故障诊断多步流程', () => {
  test.setTimeout(300_000);

  test('SOP-FD-01: 描述问题→诊断→给方案', async ({ page }) => {
    const wsReady = waitForChatWs(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '智能客服小通' })).toBeVisible();
    await wsReady;

    // Step 1: 用户描述网络问题 → bot 应先诊断
    await sendMessage(page, '我的手机上网很慢，信号也不太好');
    await waitForBotReply(page);
    const reply1 = await getLastBotReply(page);

    expect(reply1.length).toBeGreaterThan(20);
    const hasDiagInfo = /诊断|网络|信号|基站|APN|网速|检测|排查/.test(reply1);
    expect(hasDiagInfo, '第 1 步应有诊断信息').toBe(true);
    expect(reply1).not.toContain('已修复');
    expect(reply1).not.toContain('已恢复');

    // Step 2: 用户追问 → bot 给出具体建议
    await sendMessage(page, '怎么解决呢？能帮我处理一下吗');
    await waitForBotReply(page);
    const reply2 = await getLastBotReply(page);

    expect(reply2.length).toBeGreaterThan(10);
    const hasSolution = /建议|尝试|重启|设置|APN|联系|拨打|营业厅|恢复|检查|解决|方案|操作|步骤|可以|帮|处理/.test(reply2);
    expect(hasSolution, '第 2 步应有解决建议').toBe(true);

    // Step 3: 用户问还有什么办法 → bot 应有后续路径
    await sendMessage(page, '试了还是不行怎么办');
    await waitForBotReply(page);
    const reply3 = await getLastBotReply(page);
    expect(reply3.length).toBeGreaterThan(10);
    const hasEscalation = /人工|10086|营业厅|工单|工程师|进一步/.test(reply3);
    expect(hasEscalation, '第 3 步应有升级路径').toBe(true);
  });
});
