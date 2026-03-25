/**
 * plan-inquiry SOP E2E 测试
 *
 * 套餐查询与推荐技能的多轮对话流程验证。
 * 状态图分支：套餐浏览 / 套餐变更 / 套餐对比 / 网速问题分流
 *
 * 依赖：服务已启动（./start.sh 或 ./start.sh --reset）
 */
import { test, expect } from '@playwright/test';
import { waitForChatWs, sendMessage, waitForBotReply, getLastBotReply } from '../../fixtures/chat-helpers';

test.describe.serial('plan-inquiry SOP: 套餐浏览流程', () => {
  test.setTimeout(300_000);
  test.skip('SOP-PI-01: 浏览套餐→了解需求→推荐→展示详情', async ({ page }) => {});
  test.skip('SOP-PI-02: 浏览后用户仅了解不办理→礼貌结束', async ({ page }) => {});
});

test.describe.serial('plan-inquiry SOP: 套餐变更流程', () => {
  test.setTimeout(300_000);
  test.skip('SOP-PI-03: 查当前套餐→分析用量→推荐升级→确认办理', async ({ page }) => {});
  test.skip('SOP-PI-04: 合约期内变更→告知违约金→引导营业厅', async ({ page }) => {});
  test.skip('SOP-PI-05: 已是最高套餐→告知无法升级→推荐流量包', async ({ page }) => {});
});

test.describe.serial('plan-inquiry SOP: 套餐对比流程', () => {
  test.setTimeout(300_000);
  test.skip('SOP-PI-06: 选择多个套餐→对比差异→推荐最优', async ({ page }) => {});
});

test.describe.serial('plan-inquiry SOP: 网速问题分流', () => {
  test.setTimeout(300_000);
  test.skip('SOP-PI-07: 月底流量不够→推荐升级套餐', async ({ page }) => {});
  test.skip('SOP-PI-08: 突然网速慢→引导转故障诊断', async ({ page }) => {});
});
