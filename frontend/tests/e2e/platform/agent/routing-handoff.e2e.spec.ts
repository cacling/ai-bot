/**
 * routing-handoff.e2e.spec.ts — Bot→Human handoff routing E2E tests
 *
 * Validates the full routing plugin pipeline:
 *   Customer WS chat → Bot transfer_to_human → materialize → routeInteraction()
 *   → queue_selector → candidate_scorer → overflow_policy → agent assignment
 *
 * Seed data (see interaction_platform/src/seed.ts):
 *   Queues:  default_chat, vip_chat, fault_chat, bill_chat, ...
 *   Agents:  agent_001/张琦 (default/bill/plan), agent_002/李娜 (default/vip/cancel),
 *            demo_admin_001/演示主管 (default/voice/vip/fault)
 *   Customers: 张三(standard), 李四(vip), 王五(delinquent)
 *   Plugins: core_least_loaded, vip_priority_scorer, intent_queue_selector(active),
 *            skill_based_selector, sla_overflow_guard
 *   Rules (by priority_order):
 *     0: rule-vip-priority  → vip_chat     (priority [0,25])
 *     1: rule-fault-urgent  → fault_chat   (priority [0,30] + work_model=live_chat)
 *     2: rule-voice-model   → default_voice (work_model=live_voice)
 *     99: rule-fallback     → default_chat  (catch-all)
 *
 * Prerequisites:
 *   ./start.sh --reset    # 重置 DB + seed + 启动全部服务
 *
 * Run:
 *   cd frontend/tests/e2e && npx playwright test routing-handoff --headed
 */
import { test, expect, type Page, type Browser } from '@playwright/test';

const IX_API = 'http://localhost:18022';
const CLIENT_URL = 'http://localhost:5173';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function waitForChatWs(page: Page): Promise<void> {
  let wsCount = 0;
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 10_000);
    page.on('websocket', (ws) => {
      if (!ws.url().includes('/ws/chat')) return;
      wsCount++;
      if (wsCount >= 2) { setTimeout(() => { clearTimeout(timer); resolve(); }, 500); }
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
  try { await expect(page.locator('.animate-bounce').first()).toBeVisible({ timeout: 5_000 }); } catch {}
  await expect(page.locator('.animate-bounce').first()).not.toBeVisible({ timeout: 150_000 });
}

/** Poll IX API until an interaction in the given state appears, or timeout */
async function pollForInteraction(opts: {
  agentId?: string;
  state?: string;
  maxWaitMs?: number;
  intervalMs?: number;
  createdAfter?: Date;
} = {}): Promise<any> {
  const { agentId, state = 'assigned', maxWaitMs = 30_000, intervalMs = 1_000, createdAfter } = opts;
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    let url = `${IX_API}/api/interactions?state=${state}&limit=10`;
    if (agentId) url += `&assigned_agent_id=${agentId}`;
    const res = await fetch(url);
    const data = await res.json();
    const items = data.items ?? [];
    // Filter by createdAfter to avoid stale interactions from prior runs
    const recent = createdAfter
      ? items.find((i: any) => new Date(i.created_at) >= createdAfter)
      : items[0];
    if (recent) return recent;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return null;
}

/** Login to agent workbench */
async function loginAgent(browser: Browser, username: string): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${CLIENT_URL}/staff/login`);
  await page.getByLabel('账号').fill(username);
  await page.getByLabel('密码').fill('123456');
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForURL('**/staff/**', { timeout: 10_000 });
  return page;
}

/** Open customer chat page and select persona by phone number */
async function openCustomerChat(browser: Browser, phone: string): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(CLIENT_URL);
  await expect(page.getByRole('heading', { name: '智能客服小通' })).toBeVisible();

  // Select the persona with the target phone from the dropdown
  const personaSelect = page.locator('select').filter({ has: page.locator(`option[value="${phone}"]`) });
  const currentVal = await personaSelect.inputValue().catch(() => '');
  if (currentVal !== phone) {
    const wsReady = waitForChatWs(page);
    await personaSelect.selectOption(phone);
    await wsReady;
  } else {
    // Already correct persona, wait for WS
    const wsReady = waitForChatWs(page);
    await wsReady;
  }

  return page;
}

/** Direct API call to materialize an interaction (bypasses bot, for isolated routing tests) */
async function materializeViaApi(opts: {
  conversationId: string;
  channel?: string;
  workModel?: string;
  queueCode?: string;
  priority?: number;
  handoffSummary?: string;
  customerPartyId?: string;
}) {
  const res = await fetch(`${IX_API}/api/interactions/materialize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      conversation_id: opts.conversationId,
      customer_party_id: opts.customerPartyId ?? 'party-e2e-test',
      channel: opts.channel ?? 'webchat',
      work_model: opts.workModel ?? 'live_chat',
      queue_code: opts.queueCode ?? 'default_chat',
      priority: opts.priority ?? 50,
      handoff_summary: opts.handoffSummary ?? 'E2E test handoff',
    }),
  });
  return res.json();
}

/** Fetch interaction detail */
async function getInteraction(interactionId: string) {
  const res = await fetch(`${IX_API}/api/interactions/${interactionId}`);
  return res.json();
}

/** Fetch interaction events */
async function getEvents(interactionId: string) {
  const res = await fetch(`${IX_API}/api/interactions/${interactionId}/events`);
  const data = await res.json();
  return data.items ?? [];
}

/** Fetch plugin execution logs for an interaction */
async function getPluginLogs(interactionId: string) {
  const res = await fetch(`${IX_API}/api/plugins/logs?interaction_id=${interactionId}&limit=50`);
  const data = await res.json();
  return data.items ?? [];
}

/** Reset agent presence to known state for test isolation */
async function resetAgentPresence(agentId: string, overrides?: Record<string, unknown>) {
  await fetch(`${IX_API}/api/presence/${agentId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: 'online',
      active_chat_count: 0,
      active_voice_count: 0,
      ...overrides,
    }),
  });
}

/** Reset all agents to clean state */
async function resetAllAgents() {
  await resetAgentPresence('agent_001');
  await resetAgentPresence('agent_002');
  await resetAgentPresence('demo_admin_001');
}

/** Verify agent workbench received the interaction in inbox, then check route_context card */
async function verifyAgentInboxAndCards(agentPage: Page, opts: {
  handoffSummaryPattern: RegExp;
  expectedQueue: string;
  expectedPriorityLabel: string; // 'P1' | 'P2' | 'P3'
  expectedRoutingMode?: string;  // e.g. '直接分配'
}) {
  // 1. Verify the interaction appears in the agent's inbox with the handoff summary
  const inboxItems = agentPage.getByText(opts.handoffSummaryPattern);
  await expect(inboxItems.first()).toBeVisible({ timeout: 15_000 });

  // 2. Click the LAST matching inbox item (newest, from THIS test run — stale items from prior runs come first)
  await inboxItems.last().click();
  await agentPage.waitForTimeout(2000); // allow card data + re-render

  // 3. Verify route_context card renders with correct data
  //    Card title is "路由上下文" (zh), rendered in CardShell header
  const routeCardTitle = agentPage.getByText('路由上下文');
  await expect(routeCardTitle).toBeVisible({ timeout: 15_000 });

  // Find the card container (rounded-2xl parent)
  const cardShell = agentPage.locator('.rounded-2xl').filter({ hasText: '路由上下文' }).first();
  await expect(cardShell).toBeVisible({ timeout: 5_000 });

  // Expand the card if collapsed — click the collapse toggle button next to title
  const expandBtn = cardShell.locator('button').first();
  if (expandBtn) {
    // Always click to ensure expanded (toggle)
    const contentArea = cardShell.locator('.p-3');
    const isExpanded = await contentArea.isVisible().catch(() => false);
    if (!isExpanded) {
      await expandBtn.click();
      await agentPage.waitForTimeout(500);
    }
  }

  // Verify queue_code
  await expect(cardShell.getByText(opts.expectedQueue)).toBeVisible({ timeout: 5_000 });

  // Verify priority label (e.g. "P2 (15)")
  await expect(cardShell.getByText(opts.expectedPriorityLabel)).toBeVisible({ timeout: 5_000 });

  // Verify routing mode if specified
  if (opts.expectedRoutingMode) {
    await expect(cardShell.getByText(opts.expectedRoutingMode)).toBeVisible({ timeout: 5_000 });
  }
}

// ── Scenario 1: Multi-browser handoff — different customers → different agents ──

test.describe('Bot handoff routing E2E', () => {
  test.setTimeout(200_000);

  test('RT-E2E-01: 李四(VIP)转人工 → vip_chat → 李娜接', async ({ browser }) => {
    const testStart = new Date();
    await resetAllAgents();
    await resetAgentPresence('demo_admin_001', { active_chat_count: 5 });

    // Login agent 李娜 (agent_002, vip_chat)
    const agentPage = await loginAgent(browser, 'li.na');

    // Open customer 李四 (VIP, phone=13800000002)
    const clientPage = await openCustomerChat(browser, '13800000002');

    // Customer sends message then we materialize via API (simulating bot handoff with CDP-enriched priority)
    await sendMessage(clientPage, '我需要转人工服务');
    await waitForBotReply(clientPage);

    // Materialize interaction with VIP priority (CDP tier=vip → priority=15)
    const ts1 = Date.now();
    const convId = `e2e-vip-browser-${ts1}`;
    const summary1 = `李四(VIP)请求转人工 #${ts1}`;
    await materializeViaApi({
      conversationId: convId,
      customerPartyId: 'party-lisi', // 李四(VIP)
      priority: 15, // VIP tier
      handoffSummary: summary1,
    });

    // Verify routing: VIP → vip_chat → agent_002 (李娜)
    const interaction = await pollForInteraction({ agentId: 'agent_002', maxWaitMs: 30_000, createdAfter: testStart });
    expect(interaction, '李四(VIP) should be assigned to agent_002 (李娜)').toBeTruthy();
    expect(interaction.assigned_agent_id).toBe('agent_002');

    const ix = await getInteraction(interaction.interaction_id);
    expect(ix.queue_code).toBe('vip_chat');

    // Verify agent workbench received the VIP interaction and route_context card
    // Priority 15 → P2 (getPriorityLabel: ≤10=P1, ≤30=P2, >30=P3)
    await verifyAgentInboxAndCards(agentPage, {
      handoffSummaryPattern: new RegExp(String(ts1)),
      expectedQueue: 'vip_chat',
      expectedPriorityLabel: 'P2',
    });

    await clientPage.context().close();
    await agentPage.context().close();
  });

  test('RT-E2E-02: 张三(普通)问账单 → bill_chat → 张琦接', async ({ browser }) => {
    const testStart = new Date();
    await resetAllAgents();

    // Login agent 张琦 (agent_001, bill_chat)
    const agentPage = await loginAgent(browser, 'zhang.qi');

    // Open customer 张三 (standard, phone=13800000001)
    const clientPage = await openCustomerChat(browser, '13800000001');

    // Customer asks about billing
    await sendMessage(clientPage, '我要查一下本月账单');
    await waitForBotReply(clientPage);

    // Materialize with billing intent (simulating bot handoff with intent enrichment)
    const ts2 = Date.now();
    const convId = `e2e-bill-browser-${ts2}`;
    const summary2 = `[intent:bill-inquiry] 客户咨询本月账单 #${ts2}`;
    await materializeViaApi({
      conversationId: convId,
      customerPartyId: 'party-zhangsan', // 张三
      priority: 50, // standard tier
      handoffSummary: summary2,
    });

    // Verify routing: intent=bill → bill_chat → agent_001 (张琦)
    const interaction = await pollForInteraction({ agentId: 'agent_001', maxWaitMs: 30_000, createdAfter: testStart });
    expect(interaction, '张三(普通) billing should be assigned to agent_001 (张琦)').toBeTruthy();
    expect(interaction.assigned_agent_id).toBe('agent_001');

    // Verify agent workbench received the billing interaction and route_context card
    // Priority 50 → P3 (getPriorityLabel: ≤10=P1, ≤30=P2, >30=P3)
    await verifyAgentInboxAndCards(agentPage, {
      handoffSummaryPattern: new RegExp(String(ts2)),
      expectedQueue: 'bill_chat',
      expectedPriorityLabel: 'P3',
    });

    await clientPage.context().close();
    await agentPage.context().close();
  });

  test('RT-E2E-03: 王五(欠费)报故障 → fault_chat → 演示主管接', async ({ browser }) => {
    const testStart = new Date();
    await resetAllAgents();

    // Login agent 演示主管 (demo_admin_001, fault_chat)
    const agentPage = await loginAgent(browser, 'demo');

    // Open customer 王五 (delinquent, phone=13800000003)
    const clientPage = await openCustomerChat(browser, '13800000003');

    // Customer reports fault
    await sendMessage(clientPage, '我家宽带断网了，帮我看看');
    await waitForBotReply(clientPage);

    // Materialize with fault intent (simulating bot handoff with intent enrichment)
    const ts3 = Date.now();
    const convId = `e2e-fault-browser-${ts3}`;
    const summary3 = `[intent:fault-diagnosis] 客户报告宽带断网 #${ts3}`;
    await materializeViaApi({
      conversationId: convId,
      customerPartyId: 'party-wangwu', // 王五
      priority: 60, // delinquent tier
      handoffSummary: summary3,
      workModel: 'live_chat',
    });

    // Verify routing: intent=fault → fault_chat → demo_admin_001
    const interaction = await pollForInteraction({ agentId: 'demo_admin_001', maxWaitMs: 30_000, createdAfter: testStart });
    expect(interaction, '王五(欠费) fault should be assigned to demo_admin_001').toBeTruthy();
    expect(interaction.assigned_agent_id).toBe('demo_admin_001');

    // Verify agent workbench received the fault interaction and route_context card
    // Priority 60 → P3
    await verifyAgentInboxAndCards(agentPage, {
      handoffSummaryPattern: new RegExp(String(ts3)),
      expectedQueue: 'fault_chat',
      expectedPriorityLabel: 'P3',
    });

    await clientPage.context().close();
    await agentPage.context().close();
  });
});

// ── Scenarios 4-9: API-only routing tests (deterministic, no browser) ───────

test.describe.serial('Routing plugin pipeline', () => {
  test.setTimeout(30_000);

  test('RT-E2E-04: default_chat routes to least-loaded agent', async () => {
    await resetAgentPresence('agent_001', { active_chat_count: 1 });
    await resetAgentPresence('agent_002', { active_chat_count: 0 });
    await resetAgentPresence('demo_admin_001', { active_chat_count: 0 });

    const result = await materializeViaApi({
      conversationId: `e2e-least-loaded-${Date.now()}`,
      queueCode: 'default_chat',
    });

    expect(result.success).toBe(true);
    expect(result.state).toBe('assigned');
    expect(result.assigned_agent_id).toBe('demo_admin_001');

    const logs = await getPluginLogs(result.interaction_id);
    const scorerLog = logs.find((l: any) => l.slot === 'candidate_scorer' && !l.shadow);
    expect(scorerLog, 'Should have candidate_scorer execution log').toBeDefined();
    expect(scorerLog.status).toBe('success');
  });

  test('RT-E2E-05: VIP priority routes to vip_chat with VIP scorer', async () => {
    await resetAgentPresence('agent_002', { active_chat_count: 0 });
    await resetAgentPresence('demo_admin_001', { active_chat_count: 5 }); // busy → agent_002 gets VIP

    const result = await materializeViaApi({
      conversationId: `e2e-vip-${Date.now()}`,
      queueCode: 'default_chat',
      priority: 15,
    });

    expect(result.success).toBe(true);
    expect(result.state).toBe('assigned');

    const ix = await getInteraction(result.interaction_id);
    expect(ix.queue_code).toBe('vip_chat');

    const logs = await getPluginLogs(result.interaction_id);
    const vipLog = logs.find((l: any) => l.plugin_id === 'plugin-vip-priority' && !l.shadow);
    expect(vipLog, 'VIP scorer should run as primary').toBeDefined();
  });

  test('RT-E2E-06: fault routing assigns to fault-eligible agent', async () => {
    await resetAgentPresence('demo_admin_001', { active_chat_count: 0 });

    const result = await materializeViaApi({
      conversationId: `e2e-fault-${Date.now()}`,
      queueCode: 'fault_chat',
      priority: 28, // in [0,30] but >25, so not VIP rule; fault_urgent matches
    });

    expect(result.success).toBe(true);
    expect(result.state).toBe('assigned');
    expect(result.assigned_agent_id).toBe('demo_admin_001');

    const ix = await getInteraction(result.interaction_id);
    expect(ix.queue_code).toBe('fault_chat');
  });

  test('RT-E2E-07: all agents busy → interaction queued + SLA overflow shadow', async () => {
    await resetAgentPresence('demo_admin_001', { active_chat_count: 5 });

    const result = await materializeViaApi({
      conversationId: `e2e-queued-${Date.now()}`,
      queueCode: 'fault_chat',
      priority: 28,
    });

    expect(result.success).toBe(true);
    expect(result.assigned_agent_id).toBeUndefined();

    const ix = await getInteraction(result.interaction_id);
    expect(ix.state).toBe('queued');

    const events = await getEvents(result.interaction_id);
    expect(events.some((e: any) => e.event_type === 'queued')).toBe(true);

    const logs = await getPluginLogs(result.interaction_id);
    const overflowLog = logs.find((l: any) => l.plugin_id === 'plugin-sla-overflow' && l.shadow);
    expect(overflowLog, 'SLA overflow should execute in shadow mode').toBeDefined();

    await resetAgentPresence('demo_admin_001', { active_chat_count: 0 });
  });

  test('RT-E2E-08: intent_selector routes billing intent to bill_chat', async () => {
    await resetAllAgents();

    const result = await materializeViaApi({
      conversationId: `e2e-intent-bill-${Date.now()}`,
      queueCode: 'default_chat',
      priority: 50,
      handoffSummary: '客户咨询账单费用扣费问题 [intent:bill-inquiry]',
    });

    expect(result.success).toBe(true);
    expect(result.state).toBe('assigned');

    // Intent selector (now non-shadow) should route to bill_chat
    const ix = await getInteraction(result.interaction_id);
    expect(ix.queue_code).toBe('bill_chat');

    // agent_001 is the bill_chat agent with most capacity
    expect(result.assigned_agent_id).toBe('agent_001');
  });

  test('RT-E2E-09: only queue-eligible agents receive assignment', async () => {
    await resetAgentPresence('agent_001', { active_chat_count: 0 });
    await resetAgentPresence('agent_002', { active_chat_count: 0 });
    await resetAgentPresence('demo_admin_001', { active_chat_count: 5 });

    const result = await materializeViaApi({
      conversationId: `e2e-queue-filter-${Date.now()}`,
      queueCode: 'default_chat',
      priority: 50,
      handoffSummary: '[intent:bill-inquiry] 账单查询',
    });

    expect(result.success).toBe(true);
    expect(result.state).toBe('assigned');
    expect(result.assigned_agent_id).toBe('agent_001');
  });
});
