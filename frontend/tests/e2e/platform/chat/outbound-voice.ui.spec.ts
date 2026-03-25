/**
 * 外呼语音页面 UI E2E 测试
 *
 * feature-map: 3. 外呼语音
 * 入口: / → "语音外呼" tab → OutboundVoicePage
 * WS: /ws/outbound?task=<collection|marketing>&id=<case_id>
 */
import { test, expect } from '@playwright/test';

test.describe('外呼页面加载与任务选择', () => {
  test.skip('OUTBOUND-UI-01: 切换到外呼 tab 显示任务类型选择器', async ({ page }) => {});
  test.skip('OUTBOUND-UI-02: 选择"催收"类型后显示催收任务列表', async ({ page }) => {});
  test.skip('OUTBOUND-UI-03: 选择"营销"类型后显示营销任务列表', async ({ page }) => {});
  test.skip('OUTBOUND-UI-04: 选择任务后展示客户信息摘要', async ({ page }) => {});
});

test.describe('外呼通话流程', () => {
  test.skip('OUTBOUND-UI-05: 连接建立后 bot 自动发起开场白', async ({ page }) => {});
  test.skip('OUTBOUND-UI-06: 对话消息正确展示（bot 在前，用户在后）', async ({ page }) => {});
  test.skip('OUTBOUND-UI-07: 麦克风门控——开场白结束前不发送用户音频', async ({ page }) => {});
});
