/**
 * fault-diagnosis SOP 多轮对话流程测试
 *
 * 验证故障诊断技能的 SOP 步骤遵循：描述问题→诊断→给方案→升级路径。
 * 语义正确性由 promptfoo eval 覆盖: evals/datasets/fault-diagnosis.yaml
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
    expect(reply1.length, '第 1 步回复不应为空').toBeGreaterThan(20);

    // Step 2: 用户追问 → bot 给出具体建议
    await sendMessage(page, '怎么解决呢？能帮我处理一下吗');
    await waitForBotReply(page);
    const reply2 = await getLastBotReply(page);
    expect(reply2.length, '第 2 步回复不应为空').toBeGreaterThan(10);

    // Step 3: 用户问还有什么办法 → bot 应有后续路径
    await sendMessage(page, '试了还是不行怎么办');
    await waitForBotReply(page);
    const reply3 = await getLastBotReply(page);
    expect(reply3.length, '第 3 步回复不应为空').toBeGreaterThan(10);
  });
});
