/**
 * chat-helpers.ts — Shared helpers for multi-turn chat E2E tests
 *
 * Used by: skills/inbound/*.spec.ts, skills/outbound/*.spec.ts
 */
import { expect, type Page } from '@playwright/test';

/** Wait for the chat WebSocket to connect (waits for 2 WS connections or 10s timeout) */
export async function waitForChatWs(page: Page): Promise<void> {
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

/** Fill the chat input and press Enter */
export async function sendMessage(page: Page, text: string) {
  const input = page.getByPlaceholder(/输入您的问题/);
  await expect(input).toBeEnabled({ timeout: 10_000 });
  await input.fill(text);
  await input.press('Enter');
}

/** Wait for the bot to finish replying (typing indicator disappears) */
export async function waitForBotReply(page: Page) {
  try {
    await expect(page.locator('.animate-bounce').first()).toBeVisible({ timeout: 5_000 });
  } catch { /* 响应太快 */ }
  await expect(page.locator('.animate-bounce').first()).not.toBeVisible({ timeout: 150_000 });
}

/** Get the text content of the last bot reply */
export async function getLastBotReply(page: Page): Promise<string> {
  const botMessages = page.locator('.markdown-body');
  const count = await botMessages.count();
  if (count === 0) return '';
  return (await botMessages.nth(count - 1).textContent()) ?? '';
}

/** Premature cancel signals — if these appear before user confirmation, SOP was violated */
export const PREMATURE_CANCEL_SIGNALS = ['已退订成功', '退订成功', '已为您退订', '已成功退订', '退订已生效'];

/** Premature action signals — generic form */
export const PREMATURE_ACTION_SIGNALS = ['已办理成功', '已取消成功', '已开通', '已恢复'];
