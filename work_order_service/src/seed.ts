/**
 * seed.ts — 工单系统种子数据
 *
 * 运行：cd work_order_service && node --import tsx/esm src/seed.ts
 */
import { db, workQueues, workItemTemplates, workItems, workOrders, appointments, workItemEvents, workItemRelations, eq } from "./db.js";

async function seed() {
  console.log("[work-order] Seeding work order data...");

  // ── 队列 ──────────────────────────────────────────────────────────────────
  await db.delete(workQueues).run();
  await db.insert(workQueues).values([
    {
      code: "frontline",
      name: "一线客服",
      queue_type: "frontline",
      owner_team: "cs_team_1",
    },
    {
      code: "specialist",
      name: "专家组",
      queue_type: "specialist",
      owner_team: "expert_team",
    },
    {
      code: "callback_team",
      name: "回访组",
      queue_type: "specialist",
      owner_team: "callback_team",
    },
    {
      code: "store_changyinglu",
      name: "长营路营业厅",
      queue_type: "store",
      owner_team: "store_001",
    },
  ]).run();

  // ── 模板 ──────────────────────────────────────────────────────────────────
  await db.delete(workItemTemplates).run();
  const now = new Date().toISOString();
  await db.insert(workItemTemplates).values([
    {
      id: "tpl_callback_followup",
      name: "回访跟进",
      applies_to_type: "work_order",
      subtype: "callback",
      default_title: "回访确认处理结果",
      default_queue: "callback_team",
      default_priority: "high",
      default_sla_hours: 24,
      workflow_key: "callback_followup",
      active: 1,
      created_at: now,
      updated_at: now,
    },
    {
      id: "tpl_store_visit",
      name: "营业厅办理",
      applies_to_type: "work_order",
      subtype: "store_visit",
      default_title: "待客户至营业厅办理",
      default_queue: "store_changyinglu",
      default_priority: "medium",
      default_sla_hours: 72,
      active: 1,
      created_at: now,
      updated_at: now,
    },
    {
      id: "tpl_manual_unlock",
      name: "人工解锁",
      applies_to_type: "work_order",
      subtype: "manual_unlock",
      default_title: "人工解锁处理",
      default_queue: "specialist",
      default_priority: "high",
      default_sla_hours: 4,
      active: 1,
      created_at: now,
      updated_at: now,
    },
  ]).run();

  // ── 清理旧数据 ────────────────────────────────────────────────────────────
  await db.delete(workItemEvents).run();
  await db.delete(workItemRelations).run();
  await db.delete(appointments).run();
  await db.delete(workOrders).run();
  await db.delete(workItems).run();

  // ── Work Items + Work Orders ──────────────────────────────────────────────

  const t0 = "2026-03-28T09:00:00+08:00";
  const t1 = "2026-03-28T09:15:00+08:00";
  const t2 = "2026-03-28T10:00:00+08:00";
  const t3 = "2026-03-28T10:30:00+08:00";
  const t4 = "2026-03-28T14:00:00+08:00";
  const t5 = "2026-03-28T15:00:00+08:00";
  const t6 = "2026-03-29T10:00:00+08:00";

  // 工单1：新建状态（密码重置）
  await db.insert(workItems).values({
    id: "wo-demo-001",
    root_id: "wo-demo-001",
    type: "work_order",
    subtype: "manual_unlock",
    title: "人工解锁 App 账号",
    summary: "客户反馈 App 登录异常，密码正确但无法登录，需人工解锁",
    channel: "online",
    source_session_id: "sess_demo_001",
    source_skill_id: "telecom-app",
    customer_phone: "13800000001",
    customer_name: "张明",
    queue_code: "specialist",
    priority: "high",
    status: "new",
    created_by: "system",
    created_at: t0,
    updated_at: t0,
  }).run();
  await db.insert(workOrders).values({
    item_id: "wo-demo-001",
    work_type: "execution",
    execution_mode: "manual",
    verification_mode: "customer_confirm",
  }).run();

  // 工单2：进行中（回访确认）
  await db.insert(workItems).values({
    id: "wo-demo-002",
    root_id: "wo-demo-002",
    type: "work_order",
    subtype: "callback",
    title: "回访确认营业厅办理结果",
    summary: "客户需先去营业厅办理实名核验，回访确认",
    channel: "voice",
    source_session_id: "sess_demo_002",
    source_skill_id: "telecom-app",
    customer_phone: "13800000002",
    customer_name: "李华",
    queue_code: "callback_team",
    priority: "high",
    status: "in_progress",
    next_action_at: t6,
    created_by: "agent_001",
    created_at: t1,
    updated_at: t4,
  }).run();
  await db.insert(workOrders).values({
    item_id: "wo-demo-002",
    work_type: "followup",
    execution_mode: "manual",
    verification_mode: "customer_confirm",
  }).run();

  // 工单3：等待客户（App 自助重置）
  await db.insert(workItems).values({
    id: "wo-demo-003",
    root_id: "wo-demo-003",
    type: "work_order",
    subtype: "app_self_service",
    title: "待客户完成 App 自助密码重置",
    summary: "已引导客户在 App 自助重置密码",
    channel: "online",
    source_session_id: "sess_demo_003",
    customer_phone: "13800000003",
    customer_name: "王芳",
    queue_code: "frontline",
    priority: "medium",
    status: "waiting_customer",
    waiting_on_type: "customer",
    created_by: "system",
    created_at: t2,
    updated_at: t3,
  }).run();
  await db.insert(workOrders).values({
    item_id: "wo-demo-003",
    work_type: "execution",
    execution_mode: "assisted",
    verification_mode: "system_check",
  }).run();

  // 工单4：已解决
  await db.insert(workItems).values({
    id: "wo-demo-004",
    root_id: "wo-demo-004",
    type: "work_order",
    subtype: "billing_dispute",
    title: "账单争议核查",
    summary: "客户反馈 2 月账单异常多收 50 元",
    channel: "online",
    source_session_id: "sess_demo_004",
    customer_phone: "13800000001",
    customer_name: "张明",
    queue_code: "specialist",
    priority: "medium",
    status: "resolved",
    created_by: "agent_002",
    created_at: t0,
    updated_at: t5,
    closed_at: null,
  }).run();
  await db.insert(workOrders).values({
    item_id: "wo-demo-004",
    work_type: "review",
    execution_mode: "manual",
    verification_mode: "agent_review",
    result_code: "resolved_refund",
  }).run();

  // ── Appointments ──────────────────────────────────────────────────────────

  // 预约1：已确认的回呼（关联 wo-demo-002）
  await db.insert(workItems).values({
    id: "apt-demo-001",
    root_id: "wo-demo-002",
    parent_id: "wo-demo-002",
    type: "appointment",
    subtype: "callback",
    title: "预约: 电话回访",
    customer_phone: "13800000002",
    customer_name: "李华",
    queue_code: "callback_team",
    priority: "high",
    status: "scheduled",
    created_by: "agent_001",
    created_at: t4,
    updated_at: t4,
  }).run();
  await db.insert(appointments).values({
    item_id: "apt-demo-001",
    appointment_type: "callback",
    resource_id: "agent_callback_01",
    scheduled_start_at: "2026-03-29T15:00:00+08:00",
    scheduled_end_at: "2026-03-29T15:30:00+08:00",
    booking_status: "confirmed",
    location_text: "电话回访",
  }).run();

  // 预约2：待确认的到店（关联 wo-demo-003）
  await db.insert(workItems).values({
    id: "apt-demo-002",
    root_id: "wo-demo-003",
    parent_id: "wo-demo-003",
    type: "appointment",
    subtype: "store_visit",
    title: "预约: 营业厅到店",
    customer_phone: "13800000003",
    customer_name: "王芳",
    queue_code: "store_changyinglu",
    priority: "medium",
    status: "scheduled",
    created_by: "system",
    created_at: t3,
    updated_at: t3,
  }).run();
  await db.insert(appointments).values({
    item_id: "apt-demo-002",
    appointment_type: "store_visit",
    scheduled_start_at: "2026-03-30T10:00:00+08:00",
    scheduled_end_at: "2026-03-30T11:00:00+08:00",
    booking_status: "proposed",
    location_text: "长营路营业厅",
  }).run();

  // ── Events ────────────────────────────────────────────────────────────────

  await db.insert(workItemEvents).values([
    // wo-demo-001 创建
    { item_id: "wo-demo-001", event_type: "created", actor_type: "system", visibility: "internal", created_at: t0 },

    // wo-demo-002 生命周期
    { item_id: "wo-demo-002", event_type: "created", actor_type: "user", actor_id: "agent_001", visibility: "internal", created_at: t1 },
    { item_id: "wo-demo-002", event_type: "status_changed", actor_type: "user", actor_id: "agent_001", visibility: "internal",
      payload_json: JSON.stringify({ action: "accept", from: "new", to: "open" }), created_at: t2 },
    { item_id: "wo-demo-002", event_type: "status_changed", actor_type: "user", actor_id: "agent_001", visibility: "internal",
      payload_json: JSON.stringify({ action: "start", from: "open", to: "in_progress" }), created_at: t3 },
    { item_id: "wo-demo-002", event_type: "appointment_created", actor_type: "user", actor_id: "agent_001", visibility: "internal",
      payload_json: JSON.stringify({ appointment_id: "apt-demo-001", appointment_type: "callback" }), created_at: t4 },

    // wo-demo-003
    { item_id: "wo-demo-003", event_type: "created", actor_type: "system", visibility: "internal", created_at: t2 },
    { item_id: "wo-demo-003", event_type: "status_changed", actor_type: "system", visibility: "internal",
      payload_json: JSON.stringify({ action: "mark_waiting_customer", from: "open", to: "waiting_customer" }), created_at: t3 },
    { item_id: "wo-demo-003", event_type: "appointment_created", actor_type: "system", visibility: "internal",
      payload_json: JSON.stringify({ appointment_id: "apt-demo-002", appointment_type: "store_visit" }), created_at: t3 },

    // wo-demo-004
    { item_id: "wo-demo-004", event_type: "created", actor_type: "user", actor_id: "agent_002", visibility: "internal", created_at: t0 },
    { item_id: "wo-demo-004", event_type: "status_changed", actor_type: "user", actor_id: "agent_002", visibility: "internal",
      payload_json: JSON.stringify({ action: "resolve", from: "in_progress", to: "resolved" }), note: "已核查账单并退费 50 元", created_at: t5 },
  ]).run();

  // ── Relations ─────────────────────────────────────────────────────────────

  await db.insert(workItemRelations).values([
    { item_id: "wo-demo-001", related_type: "session", related_id: "sess_demo_001", relation_kind: "source" },
    { item_id: "wo-demo-002", related_type: "session", related_id: "sess_demo_002", relation_kind: "source" },
    { item_id: "wo-demo-002", related_type: "skill_instance", related_id: "inst_telecom_app_001", relation_kind: "context" },
    { item_id: "wo-demo-003", related_type: "session", related_id: "sess_demo_003", relation_kind: "source" },
  ]).run();

  console.log("[work-order] Seed complete: 4 work orders, 2 appointments, 11 events, 4 relations");
}

// 直接运行
seed().catch(console.error);
