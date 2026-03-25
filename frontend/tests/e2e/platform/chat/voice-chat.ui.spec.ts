/**
 * 语音客服页面 UI E2E 测试
 *
 * feature-map: 2. 语音客服
 * 入口: / → "语音客服" tab → VoiceChatPage
 * WS: /ws/voice?phone=<phone>&lang=<lang>
 */
import { test, expect } from '@playwright/test';

test.describe('语音客服页面加载', () => {
  test.skip('VOICE-UI-01: 切换到语音 tab 显示麦克风按钮', async ({ page }) => {});
  test.skip('VOICE-UI-02: 用户选择器可切换测试角色', async ({ page }) => {});
  test.skip('VOICE-UI-03: 语言切换 zh/en 触发 WS 重连', async ({ page }) => {});
});

test.describe('语音交互核心', () => {
  test.skip('VOICE-UI-04: 点击麦克风开始录音，状态变为 listening', async ({ page }) => {});
  test.skip('VOICE-UI-05: 录音结束后 bot 回复以语音播放', async ({ page }) => {});
  test.skip('VOICE-UI-06: 消息转写结果正确展示在对话区', async ({ page }) => {});
});

test.describe('情绪检测', () => {
  test.skip('VOICE-UI-07: 用户发言后情绪指标自动更新', async ({ page }) => {});
});

test.describe('智能转人工', () => {
  test.skip('VOICE-UI-08: 用户说"转人工"触发 handoff 并展示摘要', async ({ page }) => {});
});
