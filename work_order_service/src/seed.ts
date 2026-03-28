/**
 * seed.ts — 工单系统种子数据
 *
 * 运行：cd work_order_service && node --import tsx/esm src/seed.ts
 */
import { db, workQueues, workItemTemplates, workItemCategories, workItems, workOrders, appointments, workItemEvents, workItemRelations, workflowDefinitions, workflowRuns, workflowRunEvents, eq } from "./db.js";

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

  // ── 分类目录 ──────────────────────────────────────────────────────────────
  await db.delete(workItemCategories).run();
  const now = new Date().toISOString();

  // helper: 构造分类行
  function cat(code: string, name: string, display_name: string, type: string, level: number, parent_code: string | null, extras?: Record<string, unknown>) {
    return { code, name, display_name, type, level, parent_code, status: 'active' as const, created_at: now, updated_at: now, ...extras };
  }

  await db.insert(workItemCategories).values([
    // ── Ticket 一级 ──
    cat('ticket.inquiry', 'inquiry', '咨询', 'ticket', 1, null, { domain_code: 'service' }),
    cat('ticket.request', 'request', '请求', 'ticket', 1, null, { domain_code: 'service' }),
    cat('ticket.incident', 'incident', '事件/故障', 'ticket', 1, null, { domain_code: 'service' }),
    cat('ticket.complaint', 'complaint', '投诉/争议', 'ticket', 1, null, { domain_code: 'complaint' }),

    // ── Ticket 二级 ──
    cat('ticket.inquiry.bill', 'bill_inquiry', '账单咨询', 'ticket', 2, 'ticket.inquiry', { scene_code: 'bill' }),
    cat('ticket.inquiry.plan', 'plan_inquiry', '套餐咨询', 'ticket', 2, 'ticket.inquiry', { scene_code: 'plan' }),
    cat('ticket.request.service_change', 'service_change', '业务变更请求', 'ticket', 2, 'ticket.request', {
      scene_code: 'service_change',
      allowed_child_rules_json: JSON.stringify([
        { relation_type: 'derived_work_order', child_type: 'work_order', child_categories: ['work_order.execution.suspend_service', 'work_order.execution.resume_service'] },
      ]),
    }),
    cat('ticket.request.branch_handle', 'branch_handle', '需营业厅办理请求', 'ticket', 2, 'ticket.request', {
      scene_code: 'branch',
      allowed_child_rules_json: JSON.stringify([
        { relation_type: 'derived_work_order', child_type: 'work_order', child_categories: ['work_order.branch_visit.real_name_change'] },
      ]),
    }),
    cat('ticket.incident.app_login', 'app_login', 'App 登录异常', 'ticket', 2, 'ticket.incident', {
      scene_code: 'login',
      default_workflow_key: 'app_login_triage_v1',
      allowed_child_rules_json: JSON.stringify([
        { relation_type: 'derived_work_order', child_type: 'work_order', child_categories: ['work_order.self_service.password_reset', 'work_order.review.manual_unlock'] },
        { relation_type: 'task', child_type: 'task', child_categories: ['task.collect.screenshot'] },
      ]),
    }),
    cat('ticket.incident.service_suspend', 'service_suspend', '停机/停复机异常', 'ticket', 2, 'ticket.incident', {
      scene_code: 'suspend',
      allowed_child_rules_json: JSON.stringify([
        { relation_type: 'derived_work_order', child_type: 'work_order', child_categories: ['work_order.execution.suspend_service', 'work_order.execution.resume_service'] },
      ]),
    }),
    cat('ticket.complaint.unknown_charge', 'unknown_charge', '未知扣费投诉', 'ticket', 2, 'ticket.complaint', {
      scene_code: 'charge',
      default_workflow_key: 'charge_complaint_parallel_investigation_v1',
      allowed_child_rules_json: JSON.stringify([
        { relation_type: 'sub_ticket', child_type: 'ticket', child_categories: ['ticket.complaint.charge_investigation', 'ticket.complaint.branch_service'] },
        { relation_type: 'derived_work_order', child_type: 'work_order', child_categories: ['work_order.execution.charge_adjustment'] },
      ]),
    }),
    cat('ticket.complaint.charge_investigation', 'charge_investigation', '扣费核查子诉求', 'ticket', 2, 'ticket.complaint', { scene_code: 'charge' }),
    cat('ticket.complaint.branch_service', 'branch_service_complaint', '营业厅服务投诉', 'ticket', 2, 'ticket.complaint', { scene_code: 'branch' }),

    // ── Work Order 一级 ──
    cat('work_order.followup', 'followup', '跟进', 'work_order', 1, null, { domain_code: 'service' }),
    cat('work_order.self_service', 'self_service', '自助引导', 'work_order', 1, null, { domain_code: 'service' }),
    cat('work_order.branch_visit', 'branch_visit', '营业厅办理', 'work_order', 1, null, { domain_code: 'branch' }),
    cat('work_order.execution', 'execution', '执行', 'work_order', 1, null, { domain_code: 'ops' }),
    cat('work_order.review', 'review', '复核/审核', 'work_order', 1, null, { domain_code: 'security' }),
    cat('work_order.exception', 'exception', '异常跟进', 'work_order', 1, null, { domain_code: 'ops' }),

    // ── Work Order 二级 ──
    cat('work_order.followup.callback', 'callback_followup', '回访跟进工单', 'work_order', 2, 'work_order.followup', {
      scene_code: 'callback',
      default_workflow_key: 'callback_followup',
      default_queue_code: 'callback_team',
    }),
    cat('work_order.self_service.password_reset', 'password_reset', 'App 自助重置密码', 'work_order', 2, 'work_order.self_service', {
      scene_code: 'login',
      default_queue_code: 'frontline',
      default_sla_policy_code: 'sla_self_service_24h',
      allowed_child_rules_json: JSON.stringify([
        { relation_type: 'appointment', child_type: 'appointment', child_categories: ['appointment.callback.result_check'] },
        { relation_type: 'sub_work_order', child_type: 'work_order', child_categories: ['work_order.review.manual_unlock'] },
      ]),
    }),
    cat('work_order.branch_visit.real_name_change', 'real_name_change', '实名变更到厅办理', 'work_order', 2, 'work_order.branch_visit', {
      scene_code: 'real_name',
      default_workflow_key: 'branch_visit_followup_v1',
      default_queue_code: 'store_changyinglu',
      default_sla_policy_code: 'sla_branch_visit_48h',
      allowed_child_rules_json: JSON.stringify([
        { relation_type: 'appointment', child_type: 'appointment', child_categories: ['appointment.branch_visit.service_handle'] },
        { relation_type: 'task', child_type: 'task', child_categories: ['task.notify.branch_materials'] },
        { relation_type: 'sub_work_order', child_type: 'work_order', child_categories: ['work_order.exception.branch_followup'] },
      ]),
    }),
    cat('work_order.execution.suspend_service', 'suspend_service', '停机执行', 'work_order', 2, 'work_order.execution', {
      scene_code: 'suspend',
      default_queue_code: 'specialist',
      default_sla_policy_code: 'sla_sensitive_ops_4h',
      required_fields_schema: JSON.stringify({ required: ['verification_mode'] }),
      allowed_child_rules_json: JSON.stringify([
        { relation_type: 'task', child_type: 'task', child_categories: ['task.verify.identity_material'] },
        { relation_type: 'sub_work_order', child_type: 'work_order', child_categories: ['work_order.review.security_review'] },
      ]),
    }),
    cat('work_order.execution.resume_service', 'resume_service', '复机执行', 'work_order', 2, 'work_order.execution', {
      scene_code: 'resume',
      default_queue_code: 'specialist',
    }),
    cat('work_order.execution.charge_adjustment', 'charge_adjustment', '调账/补偿执行', 'work_order', 2, 'work_order.execution', {
      scene_code: 'charge',
      default_queue_code: 'specialist',
    }),
    cat('work_order.review.security_review', 'security_review', '安全审核', 'work_order', 2, 'work_order.review', {
      scene_code: 'security',
      default_queue_code: 'specialist',
    }),
    cat('work_order.review.manual_unlock', 'manual_unlock', '人工解锁', 'work_order', 2, 'work_order.review', {
      scene_code: 'login',
      default_queue_code: 'specialist',
    }),
    cat('work_order.exception.branch_followup', 'branch_followup', '营业厅异常跟进', 'work_order', 2, 'work_order.exception', {
      scene_code: 'branch',
      default_queue_code: 'store_changyinglu',
    }),

    // ── Appointment 二级 ──
    cat('appointment.callback', 'callback', '回访', 'appointment', 1, null),
    cat('appointment.branch_visit', 'branch_visit_apt', '到厅预约', 'appointment', 1, null),
    cat('appointment.video_verify', 'video_verify', '视频核身', 'appointment', 1, null),
    cat('appointment.onsite', 'onsite', '上门服务', 'appointment', 1, null),

    cat('appointment.callback.result_check', 'result_check', '结果确认回访', 'appointment', 2, 'appointment.callback', {
      scene_code: 'callback',
      default_queue_code: 'callback_team',
    }),
    cat('appointment.callback.payment_reminder', 'payment_reminder', '缴费回呼', 'appointment', 2, 'appointment.callback', {
      scene_code: 'payment',
    }),
    cat('appointment.branch_visit.service_handle', 'service_handle', '到厅办理预约', 'appointment', 2, 'appointment.branch_visit', {
      scene_code: 'branch',
    }),
    cat('appointment.video_verify.identity_check', 'identity_check', '视频核身预约', 'appointment', 2, 'appointment.video_verify', {
      scene_code: 'security',
    }),
    cat('appointment.onsite.field_service', 'field_service', '上门服务预约', 'appointment', 2, 'appointment.onsite', {
      scene_code: 'field',
    }),

    // ── Task 二级 ──
    cat('task.notify', 'notify', '通知', 'task', 1, null),
    cat('task.collect', 'collect', '收集', 'task', 1, null),
    cat('task.verify', 'verify', '核验', 'task', 1, null),
    cat('task.fill', 'fill', '回填', 'task', 1, null),
    cat('task.review', 'task_review', '复核', 'task', 1, null),

    cat('task.notify.branch_materials', 'branch_materials', '发送到厅材料清单', 'task', 2, 'task.notify', { scene_code: 'branch' }),
    cat('task.notify.app_guide', 'app_guide', '发送 App 操作指引', 'task', 2, 'task.notify', { scene_code: 'app' }),
    cat('task.collect.screenshot', 'screenshot', '收集截图', 'task', 2, 'task.collect', { scene_code: 'evidence' }),
    cat('task.collect.identity_doc', 'identity_doc', '收集身份资料', 'task', 2, 'task.collect', { scene_code: 'identity' }),
    cat('task.verify.identity_material', 'identity_material', '核验身份资料', 'task', 2, 'task.verify', { scene_code: 'identity' }),
    cat('task.fill.execution_note', 'execution_note', '回填执行备注', 'task', 2, 'task.fill', { scene_code: 'execution' }),
    cat('task.review.callback_result', 'callback_result', '复核回访结论', 'task', 2, 'task.review', { scene_code: 'callback' }),
  ]).run();

  // ── 模板 ──────────────────────────────────────────────────────────────────
  await db.delete(workItemTemplates).run();
  await db.insert(workItemTemplates).values([
    {
      id: "tpl_callback_followup",
      name: "回访跟进",
      applies_to_type: "work_order",
      subtype: "callback",
      category_code: "work_order.followup.callback",
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
      category_code: "work_order.branch_visit.real_name_change",
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
      category_code: "work_order.review.manual_unlock",
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

  // ── Workflow Definitions ───────────────────────────────────────────────────

  await db.delete(workflowRunEvents).run();
  await db.delete(workflowRuns).run();
  await db.delete(workflowDefinitions).run();

  await db.insert(workflowDefinitions).values([
    {
      id: "wfdef_callback_followup",
      key: "callback_followup",
      name: "回访跟进流程",
      target_type: "work_order",
      version_no: 1,
      status: "active",
      spec_json: JSON.stringify({
        start_node: "start",
        nodes: {
          start: { id: "start", type: "start", next: "create_callback" },
          create_callback: {
            id: "create_callback",
            type: "create_appointment",
            config: { appointment_type: "callback" },
            next: "wait_callback",
          },
          wait_callback: {
            id: "wait_callback",
            type: "wait_signal",
            signal: "callback_done",
            next: "check_result",
          },
          check_result: {
            id: "check_result",
            type: "if",
            condition: "callback_success",
            then_next: "resolve_parent",
            else_next: "end_failed",
          },
          resolve_parent: {
            id: "resolve_parent",
            type: "transition_item",
            config: { action: "resolve" },
            next: "end_ok",
          },
          end_ok: { id: "end_ok", type: "end" },
          end_failed: { id: "end_failed", type: "end" },
        },
      }),
      created_at: now,
      updated_at: now,
    },
    {
      id: "wfdef_store_visit",
      key: "store_visit_flow",
      name: "营业厅办理流程",
      target_type: "work_order",
      version_no: 1,
      status: "active",
      spec_json: JSON.stringify({
        start_node: "start",
        nodes: {
          start: { id: "start", type: "start", next: "create_appointment" },
          create_appointment: {
            id: "create_appointment",
            type: "create_appointment",
            config: { appointment_type: "store_visit" },
            next: "wait_visit",
          },
          wait_visit: {
            id: "wait_visit",
            type: "wait_signal",
            signal: "visit_completed",
            next: "resolve",
          },
          resolve: {
            id: "resolve",
            type: "transition_item",
            config: { action: "resolve" },
            next: "end",
          },
          end: { id: "end", type: "end" },
        },
      }),
      created_at: now,
      updated_at: now,
    },
  ]).run();

  console.log("[work-order] Seed complete: categories, templates, 4 work orders, 2 appointments, 11 events, 4 relations, 2 workflow definitions");
}

// 直接运行
seed().catch(console.error);
