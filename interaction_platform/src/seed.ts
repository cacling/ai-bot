/**
 * seed.ts — Interaction Platform 种子数据
 *
 * 写入默认路由队列、坐席 presence、插件、路由规则、运行样本等。
 * 可多次运行（INSERT OR IGNORE 幂等）。
 */
import {
  db, eq,
  ixRoutingQueues, ixAgentPresence, ixPluginCatalog, ixPluginBindings,
  ixConversations, ixInteractions, ixInteractionEvents, ixAssignments,
  ixRouteRules, ixPluginExecutionLogs, ixRouteReplayTasks, ixRouteOperationAudit,
} from './db';

async function seed() {
  console.log('[interaction-platform] Seeding...');

  // ── 路由队列 ─────────────────────────────────────────────────────────────
  const queues = [
    {
      queue_code: 'default_chat',
      display_name_zh: '默认文字客服队列',
      display_name_en: 'Default Chat Queue',
      domain_scope: 'private_interaction',
      work_model: 'live_chat',
      priority: 50,
      max_wait_seconds: 300,
    },
    {
      queue_code: 'default_voice',
      display_name_zh: '默认语音客服队列',
      display_name_en: 'Default Voice Queue',
      domain_scope: 'private_interaction',
      work_model: 'live_voice',
      priority: 50,
      max_wait_seconds: 120,
    },
    {
      queue_code: 'vip_chat',
      display_name_zh: 'VIP 文字客服队列',
      display_name_en: 'VIP Chat Queue',
      domain_scope: 'private_interaction',
      work_model: 'live_chat',
      priority: 20,
      max_wait_seconds: 60,
    },
  ];

  for (const q of queues) {
    const existing = await db.query.ixRoutingQueues.findFirst({
      where: eq(ixRoutingQueues.queue_code, q.queue_code),
    });
    if (!existing) {
      await db.insert(ixRoutingQueues).values(q);
      console.log(`  ✓ Queue: ${q.queue_code}`);
    } else {
      console.log(`  - Queue: ${q.queue_code} (already exists)`);
    }
  }

  // ── 坐席 Presence（使用 demo 坐席 ID）────────────────────────────────────
  // 这些 ID 与 platform.db 中 staff_accounts 的 demo 数据对应
  const agents = [
    { agent_id: 'agent-demo-001', queue_codes: ['default_chat', 'default_voice'] },
    { agent_id: 'agent-demo-002', queue_codes: ['default_chat', 'vip_chat'] },
    { agent_id: 'agent-demo-003', queue_codes: ['default_chat', 'default_voice', 'vip_chat'] },
  ];

  for (const a of agents) {
    const existing = await db.query.ixAgentPresence.findFirst({
      where: eq(ixAgentPresence.agent_id, a.agent_id),
    });
    if (!existing) {
      await db.insert(ixAgentPresence).values({
        agent_id: a.agent_id,
        presence_status: 'offline',
        max_chat_slots: 3,
        max_voice_slots: 1,
        queue_codes_json: JSON.stringify(a.queue_codes),
      });
      console.log(`  ✓ Agent presence: ${a.agent_id}`);
    } else {
      console.log(`  - Agent presence: ${a.agent_id} (already exists)`);
    }
  }

  // ── 社交互动队列 ──────────────────────────────────────────────────────────
  const socialQueue = {
    queue_code: 'social_queue',
    display_name_zh: '社交互动队列',
    display_name_en: 'Social Engagement Queue',
    domain_scope: 'public_engagement',
    work_model: 'async_public_engagement',
    priority: 40,
    max_wait_seconds: 600,
  };

  const existingSocial = await db.query.ixRoutingQueues.findFirst({
    where: eq(ixRoutingQueues.queue_code, socialQueue.queue_code),
  });
  if (!existingSocial) {
    await db.insert(ixRoutingQueues).values(socialQueue);
    console.log(`  ✓ Queue: ${socialQueue.queue_code}`);
  } else {
    console.log(`  - Queue: ${socialQueue.queue_code} (already exists)`);
  }

  // ── 内置插件注册 ─────────────────────────────────────────────────────────
  const plugins = [
    {
      plugin_id: 'plugin-core-least-loaded',
      name: 'core_least_loaded',
      display_name_zh: '核心最少负载评分',
      display_name_en: 'Core Least Loaded Scorer',
      description: 'Default candidate scorer: ranks agents by available slots (most available first)',
      plugin_type: 'candidate_scorer',
      handler_module: 'core_least_loaded',
      timeout_ms: 3000,
      fallback_behavior: 'use_core',
    },
    {
      plugin_id: 'plugin-vip-priority',
      name: 'vip_priority_scorer',
      display_name_zh: 'VIP 优先级评分',
      display_name_en: 'VIP Priority Scorer',
      description: 'Boosts agent scores for high-priority (VIP) interactions',
      plugin_type: 'candidate_scorer',
      handler_module: 'vip_priority_scorer',
      default_config_json: JSON.stringify({ vip_boost: 10 }),
      timeout_ms: 3000,
      fallback_behavior: 'use_core',
    },
    {
      plugin_id: 'plugin-skill-selector',
      name: 'skill_based_selector',
      display_name_zh: '技能路由队列选择器',
      display_name_en: 'Skill-based Queue Selector',
      description: 'Selects target queue based on interaction work_model',
      plugin_type: 'queue_selector',
      handler_module: 'skill_based_selector',
      timeout_ms: 2000,
      fallback_behavior: 'use_core',
    },
  ];

  for (const p of plugins) {
    const existing = await db.query.ixPluginCatalog.findFirst({
      where: eq(ixPluginCatalog.plugin_id, p.plugin_id),
    });
    if (!existing) {
      await db.insert(ixPluginCatalog).values(p);
      console.log(`  ✓ Plugin: ${p.name}`);
    } else {
      console.log(`  - Plugin: ${p.name} (already exists)`);
    }
  }

  // ── VIP 队列绑定 VIP 评分器 ──────────────────────────────────────────────
  const vipBinding = {
    binding_id: 'binding-vip-scorer',
    queue_code: 'vip_chat',
    plugin_id: 'plugin-vip-priority',
    slot: 'candidate_scorer',
    priority_order: 0,
    enabled: true,
    shadow_mode: false,
  };

  const existingBinding = await db.query.ixPluginBindings.findFirst({
    where: eq(ixPluginBindings.binding_id, vipBinding.binding_id),
  });
  if (!existingBinding) {
    await db.insert(ixPluginBindings).values(vipBinding);
    console.log(`  ✓ Binding: VIP scorer → vip_chat`);
  } else {
    console.log(`  - Binding: VIP scorer → vip_chat (already exists)`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 路由管理扩展种子数据
  // 配置层 → 运行层 → 管理层
  // ══════════════════════════════════════════════════════════════════════════

  // ── 配置层 (1): 扩展队列 ────────────────────────────────────────────────
  const extQueues = [
    {
      queue_code: 'bill_chat',
      display_name_zh: '账单查询队列',
      display_name_en: 'Billing Chat Queue',
      domain_scope: 'private_interaction',
      work_model: 'live_chat',
      priority: 40,
      max_wait_seconds: 180,
      overflow_queue: 'default_chat',
    },
    {
      queue_code: 'plan_chat',
      display_name_zh: '套餐办理队列',
      display_name_en: 'Plan Service Queue',
      domain_scope: 'private_interaction',
      work_model: 'live_chat',
      priority: 40,
      max_wait_seconds: 240,
      overflow_queue: 'default_chat',
    },
    {
      queue_code: 'cancel_chat',
      display_name_zh: '退订挽留队列',
      display_name_en: 'Cancellation Queue',
      domain_scope: 'private_interaction',
      work_model: 'live_chat',
      priority: 30,
      max_wait_seconds: 120,
      overflow_queue: 'vip_chat',
    },
    {
      queue_code: 'fault_chat',
      display_name_zh: '故障报修队列',
      display_name_en: 'Fault Report Queue',
      domain_scope: 'private_interaction',
      work_model: 'live_chat',
      priority: 25,
      max_wait_seconds: 90,
      overflow_queue: 'default_chat',
    },
    {
      queue_code: 'app_chat',
      display_name_zh: 'APP 自助引导队列',
      display_name_en: 'App Self-service Queue',
      domain_scope: 'private_interaction',
      work_model: 'live_chat',
      priority: 60,
      max_wait_seconds: 600,
    },
  ];

  for (const q of extQueues) {
    const existing = await db.query.ixRoutingQueues.findFirst({
      where: eq(ixRoutingQueues.queue_code, q.queue_code),
    });
    if (!existing) {
      await db.insert(ixRoutingQueues).values(q);
      console.log(`  ✓ Queue: ${q.queue_code}`);
    } else {
      console.log(`  - Queue: ${q.queue_code} (already exists)`);
    }
  }

  // ── 配置层 (2): 坐席 Presence（使用后端 staff ID）──────────────────────
  const extAgents = [
    {
      agent_id: 'agent_001',
      presence_status: 'online' as const,
      max_chat_slots: 4,
      max_voice_slots: 1,
      queue_codes_json: JSON.stringify(['default_chat', 'bill_chat', 'plan_chat']),
    },
    {
      agent_id: 'agent_002',
      presence_status: 'online' as const,
      max_chat_slots: 3,
      max_voice_slots: 1,
      queue_codes_json: JSON.stringify(['default_chat', 'vip_chat', 'cancel_chat']),
    },
    {
      agent_id: 'demo_admin_001',
      presence_status: 'online' as const,
      max_chat_slots: 5,
      max_voice_slots: 2,
      queue_codes_json: JSON.stringify(['default_chat', 'default_voice', 'vip_chat', 'fault_chat']),
    },
    {
      agent_id: 'agent_callback_01',
      presence_status: 'busy' as const,
      max_chat_slots: 2,
      max_voice_slots: 2,
      queue_codes_json: JSON.stringify(['default_voice', 'fault_chat']),
    },
  ];

  for (const a of extAgents) {
    const existing = await db.query.ixAgentPresence.findFirst({
      where: eq(ixAgentPresence.agent_id, a.agent_id),
    });
    if (!existing) {
      await db.insert(ixAgentPresence).values(a);
      console.log(`  ✓ Agent presence: ${a.agent_id}`);
    } else {
      console.log(`  - Agent presence: ${a.agent_id} (already exists)`);
    }
  }

  // ── 配置层 (3): 路由规则 ────────────────────────────────────────────────
  const routeRules = [
    {
      rule_id: 'rule-vip-priority',
      rule_name: 'VIP 高优先级路由',
      rule_type: 'condition_match',
      queue_code: 'vip_chat',
      condition_json: JSON.stringify({ priority_range: [0, 25] }),
      priority_order: 1,
      enabled: true,
      grayscale_pct: 100,
    },
    {
      rule_id: 'rule-voice-model',
      rule_name: '语音路由到语音队列',
      rule_type: 'condition_match',
      queue_code: 'default_voice',
      condition_json: JSON.stringify({ work_model: 'live_voice' }),
      priority_order: 2,
      enabled: true,
      grayscale_pct: 100,
    },
    {
      rule_id: 'rule-async-to-app',
      rule_name: '异步模式导向自助',
      rule_type: 'condition_match',
      queue_code: 'app_chat',
      condition_json: JSON.stringify({ work_model: 'async_thread' }),
      priority_order: 3,
      enabled: true,
      grayscale_pct: 80,
    },
    {
      rule_id: 'rule-fallback-default',
      rule_name: '默认兜底路由',
      rule_type: 'default_fallback',
      queue_code: 'default_chat',
      priority_order: 99,
      enabled: true,
      grayscale_pct: 100,
    },
    {
      rule_id: 'rule-night-mode',
      rule_name: '夜间降级路由（未启用）',
      rule_type: 'time_based',
      queue_code: 'app_chat',
      condition_json: JSON.stringify({ work_model: 'live_chat' }),
      action_json: JSON.stringify({ set_priority: 80, set_routing_mode: 'queue_only' }),
      priority_order: 0,
      enabled: false,
      grayscale_pct: 50,
    },
    {
      rule_id: 'rule-fault-urgent',
      rule_name: '故障报修加急',
      rule_type: 'condition_match',
      queue_code: 'fault_chat',
      condition_json: JSON.stringify({ priority_range: [0, 30], work_model: 'live_chat' }),
      action_json: JSON.stringify({ set_priority: 10 }),
      priority_order: 0,
      enabled: true,
      grayscale_pct: 100,
    },
  ];

  for (const r of routeRules) {
    const existing = await db.query.ixRouteRules.findFirst({
      where: eq(ixRouteRules.rule_id, r.rule_id),
    });
    if (!existing) {
      await db.insert(ixRouteRules).values(r);
      console.log(`  ✓ Route rule: ${r.rule_name}`);
    } else {
      console.log(`  - Route rule: ${r.rule_name} (already exists)`);
    }
  }

  // ── 配置层 (4): 插件绑定扩展 ────────────────────────────────────────────
  const extBindings = [
    {
      binding_id: 'binding-default-scorer',
      queue_code: 'default_chat',
      plugin_id: 'plugin-core-least-loaded',
      slot: 'candidate_scorer',
      priority_order: 0,
      enabled: true,
      shadow_mode: false,
    },
    {
      binding_id: 'binding-bill-scorer',
      queue_code: 'bill_chat',
      plugin_id: 'plugin-core-least-loaded',
      slot: 'candidate_scorer',
      priority_order: 0,
      enabled: true,
      shadow_mode: false,
    },
    {
      binding_id: 'binding-vip-shadow',
      queue_code: 'vip_chat',
      plugin_id: 'plugin-core-least-loaded',
      slot: 'candidate_scorer',
      priority_order: 10,
      enabled: true,
      shadow_mode: true,
    },
    {
      binding_id: 'binding-fault-scorer',
      queue_code: 'fault_chat',
      plugin_id: 'plugin-core-least-loaded',
      slot: 'candidate_scorer',
      priority_order: 0,
      enabled: true,
      shadow_mode: false,
    },
    {
      binding_id: 'binding-cancel-vip',
      queue_code: 'cancel_chat',
      plugin_id: 'plugin-vip-priority',
      slot: 'candidate_scorer',
      priority_order: 0,
      enabled: true,
      shadow_mode: false,
    },
    {
      binding_id: 'binding-voice-scorer',
      queue_code: 'default_voice',
      plugin_id: 'plugin-core-least-loaded',
      slot: 'candidate_scorer',
      priority_order: 0,
      enabled: true,
      shadow_mode: false,
    },
    {
      binding_id: 'binding-plan-scorer',
      queue_code: 'plan_chat',
      plugin_id: 'plugin-core-least-loaded',
      slot: 'candidate_scorer',
      priority_order: 0,
      enabled: true,
      shadow_mode: false,
    },
    {
      binding_id: 'binding-app-scorer',
      queue_code: 'app_chat',
      plugin_id: 'plugin-core-least-loaded',
      slot: 'candidate_scorer',
      priority_order: 0,
      enabled: true,
      shadow_mode: false,
    },
    {
      binding_id: 'binding-default-selector',
      queue_code: 'default_chat',
      plugin_id: 'plugin-skill-selector',
      slot: 'queue_selector',
      priority_order: 0,
      enabled: false,
      shadow_mode: false,
    },
    // Intent queue selector — shadow mode for safe rollout
    {
      binding_id: 'binding-intent-selector',
      queue_code: 'default_chat',
      plugin_id: 'plugin-intent-selector',
      slot: 'queue_selector',
      priority_order: 1,
      enabled: true,
      shadow_mode: true,
    },
    // SLA overflow guard — shadow mode for safe rollout
    {
      binding_id: 'binding-sla-overflow-fault',
      queue_code: 'fault_chat',
      plugin_id: 'plugin-sla-overflow',
      slot: 'overflow_policy',
      priority_order: 0,
      enabled: true,
      shadow_mode: true,
      config_override_json: JSON.stringify({ max_wait_seconds: 120, overflow_queue: 'default_chat' }),
    },
    {
      binding_id: 'binding-sla-overflow-voice',
      queue_code: 'default_voice',
      plugin_id: 'plugin-sla-overflow',
      slot: 'overflow_policy',
      priority_order: 0,
      enabled: true,
      shadow_mode: true,
      config_override_json: JSON.stringify({ max_wait_seconds: 60, overflow_queue: 'default_chat' }),
    },
  ];

  for (const b of extBindings) {
    const existing = await db.query.ixPluginBindings.findFirst({
      where: eq(ixPluginBindings.binding_id, b.binding_id),
    });
    if (!existing) {
      await db.insert(ixPluginBindings).values(b);
      console.log(`  ✓ Binding: ${b.binding_id}`);
    } else {
      console.log(`  - Binding: ${b.binding_id} (already exists)`);
    }
  }

  // ── 运行层 (1): 会话 + 交互 + 事件 + 分配 ──────────────────────────────
  const now = Date.now();
  const today = new Date(now);
  const ts = (offsetMs: number) => new Date(now + offsetMs);

  // Seed conversations
  const conversations = [
    { conversation_id: 'conv-seed-001', channel: 'web_chat', customer_party_id: 'party-001', status: 'active' },
    { conversation_id: 'conv-seed-002', channel: 'web_chat', customer_party_id: 'party-002', status: 'active' },
    { conversation_id: 'conv-seed-003', channel: 'voice', customer_party_id: 'party-003', status: 'active' },
    { conversation_id: 'conv-seed-004', channel: 'web_chat', customer_party_id: 'party-004', status: 'active' },
    { conversation_id: 'conv-seed-005', channel: 'web_chat', customer_party_id: 'party-005', status: 'active' },
    { conversation_id: 'conv-seed-006', channel: 'web_chat', customer_party_id: 'party-006', status: 'active' },
    { conversation_id: 'conv-seed-007', channel: 'web_chat', customer_party_id: 'party-007', status: 'active' },
    { conversation_id: 'conv-seed-008', channel: 'web_chat', customer_party_id: 'party-008', status: 'active' },
    { conversation_id: 'conv-seed-009', channel: 'web_chat', customer_party_id: 'party-009', status: 'active' },
    { conversation_id: 'conv-seed-010', channel: 'voice', customer_party_id: 'party-010', status: 'active' },
    { conversation_id: 'conv-seed-011', channel: 'web_chat', customer_party_id: 'party-011', status: 'active' },
    { conversation_id: 'conv-seed-012', channel: 'web_chat', customer_party_id: 'party-012', status: 'active' },
  ];

  for (const c of conversations) {
    const existing = await db.query.ixConversations.findFirst({
      where: eq(ixConversations.conversation_id, c.conversation_id),
    });
    if (!existing) {
      await db.insert(ixConversations).values(c);
    }
  }
  console.log(`  ✓ Conversations: ${conversations.length} seeded`);

  // Seed interactions — 12 across queues with varied states and wait times
  const interactions = [
    // assigned — completed routing
    { interaction_id: 'ix-seed-001', conversation_id: 'conv-seed-001', work_model: 'live_chat', queue_code: 'default_chat', priority: 50, state: 'assigned', assigned_agent_id: 'agent_001', source_object_type: 'conversation', source_object_id: 'conv-seed-001', created_at: ts(-180_000) },
    { interaction_id: 'ix-seed-002', conversation_id: 'conv-seed-002', work_model: 'live_chat', queue_code: 'vip_chat', priority: 15, state: 'active', assigned_agent_id: 'agent_002', source_object_type: 'conversation', source_object_id: 'conv-seed-002', created_at: ts(-300_000) },
    { interaction_id: 'ix-seed-003', conversation_id: 'conv-seed-003', work_model: 'live_voice', queue_code: 'default_voice', priority: 50, state: 'assigned', assigned_agent_id: 'demo_admin_001', source_object_type: 'conversation', source_object_id: 'conv-seed-003', created_at: ts(-120_000) },
    // active — in service
    { interaction_id: 'ix-seed-004', conversation_id: 'conv-seed-004', work_model: 'live_chat', queue_code: 'bill_chat', priority: 40, state: 'active', assigned_agent_id: 'agent_001', source_object_type: 'conversation', source_object_id: 'conv-seed-004', created_at: ts(-600_000) },
    { interaction_id: 'ix-seed-005', conversation_id: 'conv-seed-005', work_model: 'live_chat', queue_code: 'cancel_chat', priority: 25, state: 'active', assigned_agent_id: 'agent_002', source_object_type: 'conversation', source_object_id: 'conv-seed-005', created_at: ts(-900_000) },
    // queued — waiting for agent
    { interaction_id: 'ix-seed-006', conversation_id: 'conv-seed-006', work_model: 'live_chat', queue_code: 'plan_chat', priority: 40, state: 'queued', source_object_type: 'conversation', source_object_id: 'conv-seed-006', created_at: ts(-45_000) },
    { interaction_id: 'ix-seed-007', conversation_id: 'conv-seed-007', work_model: 'live_chat', queue_code: 'fault_chat', priority: 20, state: 'queued', source_object_type: 'conversation', source_object_id: 'conv-seed-007', created_at: ts(-240_000) },
    { interaction_id: 'ix-seed-008', conversation_id: 'conv-seed-008', work_model: 'live_chat', queue_code: 'default_chat', priority: 50, state: 'queued', source_object_type: 'conversation', source_object_id: 'conv-seed-008', created_at: ts(-90_000) },
    // overflow — queued then overflowed
    { interaction_id: 'ix-seed-009', conversation_id: 'conv-seed-009', work_model: 'live_chat', queue_code: 'default_chat', priority: 45, state: 'queued', source_object_type: 'conversation', source_object_id: 'conv-seed-009', created_at: ts(-200_000) },
    // created — just arrived, not yet routed
    { interaction_id: 'ix-seed-010', conversation_id: 'conv-seed-010', work_model: 'live_voice', queue_code: 'default_voice', priority: 50, state: 'created', source_object_type: 'conversation', source_object_id: 'conv-seed-010', created_at: ts(-8_000) },
    { interaction_id: 'ix-seed-011', conversation_id: 'conv-seed-011', work_model: 'live_chat', queue_code: 'vip_chat', priority: 10, state: 'created', source_object_type: 'conversation', source_object_id: 'conv-seed-011', created_at: ts(-15_000) },
    // offered — pending agent acceptance
    { interaction_id: 'ix-seed-012', conversation_id: 'conv-seed-012', work_model: 'live_chat', queue_code: 'bill_chat', priority: 40, state: 'offered', source_object_type: 'conversation', source_object_id: 'conv-seed-012', created_at: ts(-30_000) },
  ];

  for (const ix of interactions) {
    const existing = await db.query.ixInteractions.findFirst({
      where: eq(ixInteractions.interaction_id, ix.interaction_id),
    });
    if (!existing) {
      await db.insert(ixInteractions).values(ix);
    }
  }
  console.log(`  ✓ Interactions: ${interactions.length} seeded`);

  // Seed interaction events — state transitions with varied timing
  const events = [
    // ix-001: created → queued → assigned (180s total, 12s queue wait)
    { interaction_id: 'ix-seed-001', event_type: 'state_change', actor_type: 'system', from_state: 'created', to_state: 'queued', created_at: ts(-178_000) },
    { interaction_id: 'ix-seed-001', event_type: 'state_change', actor_type: 'system', from_state: 'queued', to_state: 'assigned', created_at: ts(-166_000) },
    // ix-002: created → queued → offered → assigned → active (300s total, VIP fast 8s)
    { interaction_id: 'ix-seed-002', event_type: 'state_change', actor_type: 'system', from_state: 'created', to_state: 'queued', created_at: ts(-298_000) },
    { interaction_id: 'ix-seed-002', event_type: 'state_change', actor_type: 'system', from_state: 'queued', to_state: 'offered', created_at: ts(-290_000) },
    { interaction_id: 'ix-seed-002', event_type: 'state_change', actor_type: 'agent', actor_id: 'agent_002', from_state: 'offered', to_state: 'assigned', created_at: ts(-288_000) },
    { interaction_id: 'ix-seed-002', event_type: 'state_change', actor_type: 'system', from_state: 'assigned', to_state: 'active', created_at: ts(-287_000) },
    // ix-003: voice — created → assigned direct (120s, 15s wait)
    { interaction_id: 'ix-seed-003', event_type: 'state_change', actor_type: 'system', from_state: 'created', to_state: 'queued', created_at: ts(-118_000) },
    { interaction_id: 'ix-seed-003', event_type: 'state_change', actor_type: 'system', from_state: 'queued', to_state: 'assigned', created_at: ts(-103_000) },
    // ix-004: bill_chat — created → queued → assigned → active (600s, 55s queue wait)
    { interaction_id: 'ix-seed-004', event_type: 'state_change', actor_type: 'system', from_state: 'created', to_state: 'queued', created_at: ts(-595_000) },
    { interaction_id: 'ix-seed-004', event_type: 'state_change', actor_type: 'system', from_state: 'queued', to_state: 'assigned', created_at: ts(-540_000) },
    { interaction_id: 'ix-seed-004', event_type: 'state_change', actor_type: 'system', from_state: 'assigned', to_state: 'active', created_at: ts(-539_000) },
    // ix-005: cancel — created → queued → assigned → active (900s, 120s queue wait — slow)
    { interaction_id: 'ix-seed-005', event_type: 'state_change', actor_type: 'system', from_state: 'created', to_state: 'queued', created_at: ts(-898_000) },
    { interaction_id: 'ix-seed-005', event_type: 'state_change', actor_type: 'system', from_state: 'queued', to_state: 'assigned', created_at: ts(-778_000) },
    { interaction_id: 'ix-seed-005', event_type: 'state_change', actor_type: 'system', from_state: 'assigned', to_state: 'active', created_at: ts(-777_000) },
    // ix-006: plan_chat — created → queued (45s, still waiting)
    { interaction_id: 'ix-seed-006', event_type: 'state_change', actor_type: 'system', from_state: 'created', to_state: 'queued', created_at: ts(-43_000) },
    // ix-007: fault — created → queued (240s, long wait)
    { interaction_id: 'ix-seed-007', event_type: 'state_change', actor_type: 'system', from_state: 'created', to_state: 'queued', created_at: ts(-238_000) },
    // ix-008: default — created → queued (90s)
    { interaction_id: 'ix-seed-008', event_type: 'state_change', actor_type: 'system', from_state: 'created', to_state: 'queued', created_at: ts(-88_000) },
    // ix-009: overflow case — created → queued in bill_chat → overflow → queued in default_chat (200s)
    { interaction_id: 'ix-seed-009', event_type: 'state_change', actor_type: 'system', from_state: 'created', to_state: 'queued', payload_json: JSON.stringify({ queue_code: 'bill_chat' }), created_at: ts(-198_000) },
    { interaction_id: 'ix-seed-009', event_type: 'overflow', actor_type: 'system', payload_json: JSON.stringify({ from_queue: 'bill_chat', to_queue: 'default_chat', reason: 'max_wait_exceeded' }), created_at: ts(-60_000) },
    // ix-010: voice just created (8s ago)
    // ix-011: vip just created (15s ago)
    // ix-012: offered (30s ago)
    { interaction_id: 'ix-seed-012', event_type: 'state_change', actor_type: 'system', from_state: 'created', to_state: 'queued', created_at: ts(-28_000) },
    { interaction_id: 'ix-seed-012', event_type: 'state_change', actor_type: 'system', from_state: 'queued', to_state: 'offered', payload_json: JSON.stringify({ agent_id: 'agent_001' }), created_at: ts(-20_000) },
  ];

  for (const e of events) {
    // Events are auto-increment, check by interaction_id + event_type + from_state to avoid dupes
    const existing = await db.query.ixInteractionEvents.findFirst({
      where: eq(ixInteractionEvents.interaction_id, e.interaction_id),
    });
    // Only seed if no events exist for this interaction at all (first run)
    if (!existing) {
      await db.insert(ixInteractionEvents).values(e);
    }
  }
  console.log(`  ✓ Interaction events: ${events.length} seeded`);

  // Seed assignments for assigned/active interactions
  const assignments = [
    { assignment_id: 'asgn-seed-001', interaction_id: 'ix-seed-001', agent_id: 'agent_001', assignment_type: 'primary', assigned_at: ts(-166_000) },
    { assignment_id: 'asgn-seed-002', interaction_id: 'ix-seed-002', agent_id: 'agent_002', assignment_type: 'primary', assigned_at: ts(-288_000) },
    { assignment_id: 'asgn-seed-003', interaction_id: 'ix-seed-003', agent_id: 'demo_admin_001', assignment_type: 'primary', assigned_at: ts(-103_000) },
    { assignment_id: 'asgn-seed-004', interaction_id: 'ix-seed-004', agent_id: 'agent_001', assignment_type: 'primary', assigned_at: ts(-540_000) },
    { assignment_id: 'asgn-seed-005', interaction_id: 'ix-seed-005', agent_id: 'agent_002', assignment_type: 'primary', assigned_at: ts(-778_000) },
    // ix-012: offered but not yet assigned — no assignment
    // manual reassignment example: ix-004 was first assigned to demo_admin_001 then transferred
    { assignment_id: 'asgn-seed-006', interaction_id: 'ix-seed-004', agent_id: 'demo_admin_001', assignment_type: 'primary', assigned_at: ts(-590_000), released_at: ts(-540_000), release_reason: 'manual_transfer' },
    // ix-001 has a secondary (supervisor monitoring)
    { assignment_id: 'asgn-seed-007', interaction_id: 'ix-seed-001', agent_id: 'demo_admin_001', assignment_type: 'secondary', assigned_at: ts(-160_000) },
  ];

  for (const a of assignments) {
    const existing = await db.query.ixAssignments.findFirst({
      where: eq(ixAssignments.assignment_id, a.assignment_id),
    });
    if (!existing) {
      await db.insert(ixAssignments).values(a);
    }
  }
  console.log(`  ✓ Assignments: ${assignments.length} seeded`);

  // ── 管理层 (1): 插件执行日志 ────────────────────────────────────────────
  const pluginLogs = [
    // Successful scorer executions
    { interaction_id: 'ix-seed-001', plugin_id: 'plugin-core-least-loaded', binding_id: 'binding-default-scorer', slot: 'candidate_scorer', shadow: false, input_snapshot_json: JSON.stringify({ queue_code: 'default_chat', candidates: ['agent_001', 'agent_002'] }), output_snapshot_json: JSON.stringify({ scores: [{ agent_id: 'agent_001', score: 85 }, { agent_id: 'agent_002', score: 72 }] }), duration_ms: 12, status: 'success', created_at: ts(-167_000) },
    { interaction_id: 'ix-seed-002', plugin_id: 'plugin-vip-priority', binding_id: 'binding-vip-scorer', slot: 'candidate_scorer', shadow: false, input_snapshot_json: JSON.stringify({ queue_code: 'vip_chat', priority: 15 }), output_snapshot_json: JSON.stringify({ scores: [{ agent_id: 'agent_002', score: 92 }] }), duration_ms: 8, status: 'success', created_at: ts(-291_000) },
    { interaction_id: 'ix-seed-003', plugin_id: 'plugin-core-least-loaded', binding_id: 'binding-voice-scorer', slot: 'candidate_scorer', shadow: false, input_snapshot_json: JSON.stringify({ queue_code: 'default_voice', candidates: ['demo_admin_001', 'agent_callback_01'] }), output_snapshot_json: JSON.stringify({ scores: [{ agent_id: 'demo_admin_001', score: 78 }, { agent_id: 'agent_callback_01', score: 65 }] }), duration_ms: 15, status: 'success', created_at: ts(-104_000) },
    { interaction_id: 'ix-seed-004', plugin_id: 'plugin-core-least-loaded', binding_id: 'binding-bill-scorer', slot: 'candidate_scorer', shadow: false, input_snapshot_json: JSON.stringify({ queue_code: 'bill_chat' }), output_snapshot_json: JSON.stringify({ scores: [{ agent_id: 'agent_001', score: 80 }] }), duration_ms: 10, status: 'success', created_at: ts(-541_000) },
    { interaction_id: 'ix-seed-005', plugin_id: 'plugin-vip-priority', binding_id: 'binding-cancel-vip', slot: 'candidate_scorer', shadow: false, input_snapshot_json: JSON.stringify({ queue_code: 'cancel_chat', priority: 25 }), output_snapshot_json: JSON.stringify({ scores: [{ agent_id: 'agent_002', score: 88 }] }), duration_ms: 11, status: 'success', created_at: ts(-779_000) },
    // Shadow execution — VIP queue has a shadow binding for least-loaded
    { interaction_id: 'ix-seed-002', plugin_id: 'plugin-core-least-loaded', binding_id: 'binding-vip-shadow', slot: 'candidate_scorer', shadow: true, input_snapshot_json: JSON.stringify({ queue_code: 'vip_chat', shadow: true }), output_snapshot_json: JSON.stringify({ scores: [{ agent_id: 'agent_002', score: 75 }] }), duration_ms: 14, status: 'success', created_at: ts(-291_000) },
    // Timeout — plugin timed out, fell back to core
    { interaction_id: 'ix-seed-007', plugin_id: 'plugin-core-least-loaded', binding_id: 'binding-fault-scorer', slot: 'candidate_scorer', shadow: false, input_snapshot_json: JSON.stringify({ queue_code: 'fault_chat' }), output_snapshot_json: null, duration_ms: 3000, status: 'timeout', error_message: 'Plugin execution exceeded 3000ms timeout', created_at: ts(-237_000) },
    // Fallback — plugin error, used core fallback
    { interaction_id: 'ix-seed-008', plugin_id: 'plugin-core-least-loaded', binding_id: 'binding-default-scorer', slot: 'candidate_scorer', shadow: false, input_snapshot_json: JSON.stringify({ queue_code: 'default_chat' }), output_snapshot_json: null, duration_ms: 45, status: 'fallback', error_message: 'Plugin returned invalid score format', created_at: ts(-87_000) },
    // More successful logs for chart variety
    { interaction_id: 'ix-seed-006', plugin_id: 'plugin-core-least-loaded', binding_id: 'binding-plan-scorer', slot: 'candidate_scorer', shadow: false, input_snapshot_json: JSON.stringify({ queue_code: 'plan_chat' }), output_snapshot_json: JSON.stringify({ scores: [] }), duration_ms: 9, status: 'success', created_at: ts(-42_000) },
    { interaction_id: 'ix-seed-009', plugin_id: 'plugin-core-least-loaded', binding_id: 'binding-bill-scorer', slot: 'candidate_scorer', shadow: false, input_snapshot_json: JSON.stringify({ queue_code: 'bill_chat' }), output_snapshot_json: JSON.stringify({ scores: [{ agent_id: 'agent_001', score: 70 }] }), duration_ms: 18, status: 'success', created_at: ts(-197_000) },
    // Queue selector (disabled, shadow run for testing)
    { interaction_id: 'ix-seed-001', plugin_id: 'plugin-skill-selector', binding_id: 'binding-default-selector', slot: 'queue_selector', shadow: true, input_snapshot_json: JSON.stringify({ work_model: 'live_chat' }), output_snapshot_json: JSON.stringify({ selected_queue: 'default_chat' }), duration_ms: 5, status: 'success', created_at: ts(-179_000) },
    // Additional logs for log pagination testing
    { interaction_id: 'ix-seed-010', plugin_id: 'plugin-core-least-loaded', binding_id: 'binding-voice-scorer', slot: 'candidate_scorer', shadow: false, input_snapshot_json: JSON.stringify({ queue_code: 'default_voice' }), output_snapshot_json: null, duration_ms: 2, status: 'skipped', error_message: 'No candidates available', created_at: ts(-7_000) },
    { interaction_id: 'ix-seed-011', plugin_id: 'plugin-vip-priority', binding_id: 'binding-vip-scorer', slot: 'candidate_scorer', shadow: false, input_snapshot_json: JSON.stringify({ queue_code: 'vip_chat', priority: 10 }), output_snapshot_json: JSON.stringify({ scores: [{ agent_id: 'demo_admin_001', score: 95 }] }), duration_ms: 6, status: 'success', created_at: ts(-14_000) },
  ];

  // Check if any seed plugin logs exist already
  const existingLog = await db.query.ixPluginExecutionLogs.findFirst({
    where: eq(ixPluginExecutionLogs.interaction_id, 'ix-seed-001'),
  });
  if (!existingLog) {
    for (const l of pluginLogs) {
      await db.insert(ixPluginExecutionLogs).values(l);
    }
    console.log(`  ✓ Plugin execution logs: ${pluginLogs.length} seeded`);
  } else {
    console.log(`  - Plugin execution logs: (already exist)`);
  }

  // ── 管理层 (2): 回放任务 ────────────────────────────────────────────────
  const replayTask = {
    task_id: 'replay-seed-001',
    task_name: '路由规则上线验证回放',
    interaction_ids_json: JSON.stringify(['ix-seed-001', 'ix-seed-002', 'ix-seed-003', 'ix-seed-004', 'ix-seed-005']),
    status: 'completed',
    total_count: 5,
    completed_count: 5,
    divergence_count: 1,
    results_json: JSON.stringify([
      { interaction_id: 'ix-seed-001', original_queue: 'default_chat', replayed_queue: 'default_chat', match: true },
      { interaction_id: 'ix-seed-002', original_queue: 'vip_chat', replayed_queue: 'vip_chat', match: true },
      { interaction_id: 'ix-seed-003', original_queue: 'default_voice', replayed_queue: 'default_voice', match: true },
      { interaction_id: 'ix-seed-004', original_queue: 'bill_chat', replayed_queue: 'default_chat', match: false, divergence_reason: 'rule-fallback-default matched first' },
      { interaction_id: 'ix-seed-005', original_queue: 'cancel_chat', replayed_queue: 'cancel_chat', match: true },
    ]),
    created_by: 'demo_admin_001',
    started_at: ts(-3600_000),
    completed_at: ts(-3540_000),
  };

  const existingReplay = await db.query.ixRouteReplayTasks.findFirst({
    where: eq(ixRouteReplayTasks.task_id, replayTask.task_id),
  });
  if (!existingReplay) {
    await db.insert(ixRouteReplayTasks).values(replayTask);
    console.log(`  ✓ Replay task: ${replayTask.task_name}`);
  } else {
    console.log(`  - Replay task: ${replayTask.task_name} (already exists)`);
  }

  // ── 管理层 (3): 操作审计 ─────────────────────────────────────────────────
  const auditEntries = [
    { operator_id: 'demo_admin_001', operation_type: 'rule_create', target_type: 'route_rule', target_id: 'rule-vip-priority', after_snapshot_json: JSON.stringify({ rule_name: 'VIP 高优先级路由', queue_code: 'vip_chat' }), created_at: ts(-7200_000) },
    { operator_id: 'demo_admin_001', operation_type: 'rule_create', target_type: 'route_rule', target_id: 'rule-voice-model', after_snapshot_json: JSON.stringify({ rule_name: '语音路由到语音队列', queue_code: 'default_voice' }), created_at: ts(-7100_000) },
    { operator_id: 'demo_admin_001', operation_type: 'rule_create', target_type: 'route_rule', target_id: 'rule-fallback-default', after_snapshot_json: JSON.stringify({ rule_name: '默认兜底路由', queue_code: 'default_chat' }), created_at: ts(-7000_000) },
    { operator_id: 'demo_admin_001', operation_type: 'rule_update', target_type: 'route_rule', target_id: 'rule-async-to-app', before_snapshot_json: JSON.stringify({ grayscale_pct: 50 }), after_snapshot_json: JSON.stringify({ grayscale_pct: 80 }), metadata_json: JSON.stringify({ reason: '灰度验证通过，提升至 80%' }), created_at: ts(-5000_000) },
    { operator_id: 'demo_admin_001', operation_type: 'binding_change', target_type: 'plugin_binding', target_id: 'binding-vip-shadow', after_snapshot_json: JSON.stringify({ shadow_mode: true, enabled: true }), metadata_json: JSON.stringify({ reason: '新增 shadow 对比评分' }), created_at: ts(-6000_000) },
    { operator_id: 'agent_001', operation_type: 'manual_assign', target_type: 'interaction', target_id: 'ix-seed-004', metadata_json: JSON.stringify({ action: 'transfer', from_agent: 'demo_admin_001', to_agent: 'agent_001' }), created_at: ts(-540_000) },
    { operator_id: 'demo_admin_001', operation_type: 'replay_trigger', target_type: 'replay_task', target_id: 'replay-seed-001', after_snapshot_json: JSON.stringify({ task_name: '路由规则上线验证回放', count: 5 }), created_at: ts(-3600_000) },
    { operator_id: 'demo_admin_001', operation_type: 'rule_update', target_type: 'route_rule', target_id: 'rule-night-mode', before_snapshot_json: JSON.stringify({ enabled: true }), after_snapshot_json: JSON.stringify({ enabled: false }), metadata_json: JSON.stringify({ reason: '夜间降级暂停，待产品确认触发时段' }), created_at: ts(-4000_000) },
  ];

  const existingAudit = await db.query.ixRouteOperationAudit.findFirst({
    where: eq(ixRouteOperationAudit.target_id, 'rule-vip-priority'),
  });
  if (!existingAudit) {
    for (const a of auditEntries) {
      await db.insert(ixRouteOperationAudit).values(a);
    }
    console.log(`  ✓ Audit entries: ${auditEntries.length} seeded`);
  } else {
    console.log(`  - Audit entries: (already exist)`);
  }

  console.log('[interaction-platform] Seed complete.');
}

seed().catch((err) => {
  console.error('[interaction-platform] Seed error:', err);
  process.exit(1);
});
