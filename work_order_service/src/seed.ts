/**
 * seed.ts — 工单系统种子数据
 *
 * 运行：cd work_order_service && node --import tsx/esm src/seed.ts
 */
import { db, workQueues, workItemTemplates, workItemCategories, workItems, workOrders, appointments, tickets, tasks, workItemEvents, workItemRelations, workflowDefinitions, workflowRuns, workflowRunEvents, workItemIntakes, workItemDrafts, issueThreads, issueMergeReviews, eq } from "./db.js";

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
  await db.delete(tasks).run();
  await db.delete(tickets).run();
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
    category_code: "work_order.review.manual_unlock",
    title: "人工解锁 App 账号",
    summary: "客户反馈 App 登录异常，密码正确但无法登录，需人工解锁",
    description: "客户张明（13800000001）在 App 端反复尝试登录失败，提示「账号已被锁定」。经初步排查，账号因连续5次密码输入错误触发安全锁定，需后台人工解锁。",
    channel: "online",
    source_session_id: "sess_demo_001",
    source_skill_id: "telecom-app",
    customer_phone: "13800000001",
    customer_name: "张明",
    owner_id: "staff_agent_001",
    queue_code: "specialist",
    priority: "high",
    severity: "medium",
    status: "new",
    sla_deadline_at: "2026-03-28T17:00:00+08:00",
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
    category_code: "work_order.followup.callback_confirm",
    title: "回访确认营业厅办理结果",
    summary: "客户需先去营业厅办理实名核验，回访确认",
    description: "客户李华（13800000002）在通话中反馈需变更实名信息，已引导前往营业厅办理。需在客户到店办理后回访确认结果，并更新工单状态。",
    channel: "voice",
    source_session_id: "sess_demo_002",
    source_skill_id: "telecom-app",
    customer_phone: "13800000002",
    customer_name: "李华",
    owner_id: "staff_agent_001",
    queue_code: "callback_team",
    priority: "high",
    severity: "low",
    status: "in_progress",
    next_action_at: t6,
    sla_deadline_at: "2026-03-30T18:00:00+08:00",
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
    category_code: "work_order.self_service.password_reset",
    title: "待客户完成 App 自助密码重置",
    summary: "已引导客户在 App 自助重置密码",
    description: "客户王芳（13800000003）忘记登录密码，已通过在线客服引导前往 App「忘记密码」页面自助重置。等待客户完成操作后系统自动校验结果。",
    channel: "online",
    source_session_id: "sess_demo_003",
    customer_phone: "13800000003",
    customer_name: "王芳",
    owner_id: "staff_agent_002",
    queue_code: "frontline",
    priority: "medium",
    severity: "low",
    status: "waiting_customer",
    waiting_on_type: "customer",
    sla_deadline_at: "2026-03-29T18:00:00+08:00",
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
    category_code: "work_order.execution.charge_adjustment",
    title: "账单争议核查",
    summary: "客户反馈 2 月账单异常多收 50 元",
    description: "客户张明（13800000001）来电反馈 2026年2月账单比预期多出50元，怀疑增值业务误扣费。经核查确认为「视频会员包」月租扣费，客户表示未订购。已发起退费流程。",
    channel: "online",
    source_session_id: "sess_demo_004",
    customer_phone: "13800000001",
    customer_name: "张明",
    owner_id: "staff_agent_002",
    queue_code: "specialist",
    priority: "medium",
    severity: "medium",
    status: "resolved",
    sla_deadline_at: "2026-03-28T18:00:00+08:00",
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

  // ── Sub-work_order: 自助失败升级人工解锁（wo-demo-003 的子工单） ──────────
  await db.insert(workItems).values({
    id: "wo-sub-demo-003a",
    root_id: "wo-demo-003",
    parent_id: "wo-demo-003",
    type: "work_order",
    category_code: "work_order.review.manual_unlock",
    title: "人工解锁（自助重置失败升级）",
    summary: "客户自助重置密码多次失败，升级为人工后台解锁",
    description: "客户王芳在 App 自助重置密码时连续3次短信验证码超时，系统自动升级为人工处理。需后台验证身份后手动解锁账号。",
    channel: "online",
    customer_phone: "13800000003",
    customer_name: "王芳",
    owner_id: "staff_agent_001",
    queue_code: "specialist",
    priority: "high",
    severity: "medium",
    status: "in_progress",
    sla_deadline_at: "2026-03-29T15:00:00+08:00",
    created_by: "system",
    created_at: t4,
    updated_at: t5,
  }).run();
  await db.insert(workOrders).values({
    item_id: "wo-sub-demo-003a",
    work_type: "review",
    execution_mode: "manual",
    verification_mode: "customer_confirm",
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

    // wo-sub-demo-003a（wo-demo-003 的子工单：自助失败升级人工）
    { item_id: "wo-sub-demo-003a", event_type: "created", actor_type: "system", visibility: "internal",
      note: "客户自助重置失败，系统自动升级为人工处理", created_at: t4 },
    { item_id: "wo-sub-demo-003a", event_type: "status_changed", actor_type: "user", actor_id: "staff_agent_001", visibility: "internal",
      payload_json: JSON.stringify({ action: "start", from: "new", to: "in_progress" }), created_at: t5 },
    // wo-demo-003 记录子工单创建
    { item_id: "wo-demo-003", event_type: "child_created", actor_type: "system", visibility: "internal",
      payload_json: JSON.stringify({ child_id: "wo-sub-demo-003a", child_type: "work_order" }), created_at: t4 },

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
    { item_id: "wo-demo-004", related_type: "session", related_id: "sess_demo_004", relation_kind: "source" },
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

  // ── Intake Pipeline 种子数据 ────────────────────────────────────────────────

  await db.delete(issueMergeReviews).run();
  await db.delete(workItemDrafts).run();
  await db.delete(workItemIntakes).run();
  await db.delete(issueThreads).run();

  // Issue Threads
  await db.insert(issueThreads).values([
    {
      id: "thrd-demo-001",
      thread_key: "thrd_key_001",
      customer_phone: "13800000001",
      canonical_category_code: "ticket.incident.app_login",
      canonical_subject: "App 登录异常",
      status: "open",
      master_ticket_id: "wo-demo-001",
      latest_item_id: "wo-demo-001",
      first_seen_at: t0,
      last_seen_at: t0,
      reopen_until: "2026-04-28T00:00:00+08:00",
      metadata_json: JSON.stringify({ source_kind: "agent_after_service" }),
      created_at: t0,
      updated_at: t0,
    },
    {
      id: "thrd-demo-002",
      thread_key: "thrd_key_002",
      customer_phone: "13800000002",
      canonical_category_code: "work_order.followup.callback",
      canonical_subject: "回访确认营业厅办理结果",
      status: "open",
      master_ticket_id: "wo-demo-002",
      latest_item_id: "wo-demo-002",
      first_seen_at: t1,
      last_seen_at: t4,
      metadata_json: JSON.stringify({ source_kind: "agent_after_service" }),
      created_at: t1,
      updated_at: t4,
    },
  ]).run();

  // Intakes
  await db.insert(workItemIntakes).values([
    {
      id: "intk-demo-001",
      source_kind: "agent_after_service",
      source_channel: "online",
      source_ref: "sess_demo_001",
      customer_phone: "13800000001",
      customer_name: "张明",
      subject: "App 登录异常",
      raw_payload_json: JSON.stringify({ session_id: "sess_demo_001", summary: "客户反馈 App 密码正确但无法登录" }),
      normalized_payload_json: JSON.stringify({ customer_phone: "13800000001", subject: "App 登录异常", category_code: "ticket.incident.app_login" }),
      dedupe_key: "thrd_key_001",
      thread_id: "thrd-demo-001",
      materialized_item_id: "wo-demo-001",
      resolution_action: "create_new_thread",
      status: "materialized",
      decision_mode: "manual_confirm",
      created_at: t0,
      updated_at: t0,
    },
    {
      id: "intk-demo-002",
      source_kind: "agent_after_service",
      source_channel: "online",
      source_ref: "sess_demo_new",
      customer_phone: "13800000005",
      customer_name: "赵敏",
      subject: "网络信号投诉",
      raw_payload_json: JSON.stringify({ session_id: "sess_demo_new", summary: "客户反馈家中 WiFi 信号弱" }),
      status: "new",
      created_at: now,
      updated_at: now,
    },
  ]).run();

  // Draft
  await db.insert(workItemDrafts).values({
    id: "drft-demo-001",
    intake_id: "intk-demo-002",
    target_type: "ticket",
    category_code: "ticket.complaint.unknown_charge",
    title: "网络信号投诉",
    summary: "客户反馈家中 WiFi 信号弱，要求排查",
    customer_phone: "13800000005",
    customer_name: "赵敏",
    priority: "medium",
    structured_payload_json: JSON.stringify({ ticket_category: "complaint" }),
    status: "pending_review",
    review_required: 1,
    created_at: now,
    updated_at: now,
  }).run();

  // Phase 2 intakes: handoff_overflow + emotion_escalation
  await db.insert(workItemIntakes).values([
    {
      id: "intk-demo-003",
      source_kind: "handoff_overflow",
      source_channel: "voice",
      customer_phone: "13800000006",
      customer_name: "周婷",
      subject: "转人工超时",
      raw_payload_json: JSON.stringify({ session_id: "sess_demo_overflow", summary: "客户等待转人工超时" }),
      status: "new",
      created_at: now,
      updated_at: now,
    },
    {
      id: "intk-demo-004",
      source_kind: "emotion_escalation",
      source_channel: "online",
      customer_phone: "13800000007",
      customer_name: "刘强",
      subject: "情绪升级投诉",
      raw_payload_json: JSON.stringify({ session_id: "sess_demo_emotion", summary: "客户情绪激动", emotion_score: 0.9 }),
      risk_score: 85,
      status: "new",
      created_at: now,
      updated_at: now,
    },
  ]).run();

  // Phase 3 intakes: self_service_form + external_monitoring
  await db.insert(workItemIntakes).values([
    {
      id: "intk-demo-005",
      source_kind: "self_service_form",
      source_channel: "self_service",
      customer_phone: "13800000008",
      customer_name: "陈璐",
      subject: "宽带报修",
      raw_payload_json: JSON.stringify({
        form_id: "form_broadband_001",
        form_title: "宽带报修",
        form_description: "光猫闪红灯已持续2小时",
        service_type: "ticket.incident.broadband",
        preferred_time: "2026-04-01T10:00:00+08:00",
        store_name: "长营路营业厅",
      }),
      status: "new",
      created_at: now,
      updated_at: now,
    },
    {
      id: "intk-demo-006",
      source_kind: "external_monitoring",
      source_channel: "webhook",
      source_ref: "alert_zabbix_001",
      subject: "基站断电告警",
      raw_payload_json: JSON.stringify({
        alert_id: "alert_zabbix_001",
        alert_title: "基站断电告警",
        alert_type: "power_outage",
        severity: "critical",
        alert_description: "朝阳区望京基站 UPS 断电",
        monitoring_system: "zabbix",
      }),
      risk_score: 95,
      status: "new",
      created_at: now,
      updated_at: now,
    },
  ]).run();

  // ═══════════════════════════════════════════════════════════════════════════
  // HISTORY_DEMO_DATA — 过去 7~60 天的关闭单、草稿、线程、merge review
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("[work-order] Writing history demo data...");

  // ── 场景 1: App 登录异常 → 人工解锁（2026-02-05 ~ 02-06 闭环） ────────────
  await db.insert(workItems).values({
    id: "tk-hist-001",
    root_id: "tk-hist-001",
    type: "ticket",
    category_code: "ticket.incident.app_login",
    title: "App 登录异常（已关闭）",
    summary: "客户反馈 App 反复闪退无法登录，已通过人工解锁修复",
    description: "客户张明来电反馈手机App无法登录，输入正确密码后提示「账号已锁定」。经排查确认为连续多次错误登录触发安全策略，已通过后台人工解锁恢复。",
    channel: "online",
    customer_phone: "13800000001",
    customer_name: "张明",
    owner_id: "staff_agent_001",
    queue_code: "frontline",
    priority: "high",
    severity: "medium",
    status: "closed",
    created_by: "agent_001",
    created_at: "2026-02-05T10:20:00+08:00",
    updated_at: "2026-02-06T11:00:00+08:00",
    closed_at:  "2026-02-06T11:00:00+08:00",
  }).run();
  await db.insert(tickets).values({
    item_id: "tk-hist-001",
    ticket_category: "incident",
    issue_type: "app_login",
    resolution_summary: "经排查为账号锁定，已通过人工解锁恢复",
    resolution_code: "manual_unlock_success",
    satisfaction_status: "satisfied",
  }).run();

  // 子工单：人工解锁
  await db.insert(workItems).values({
    id: "wo-hist-001",
    root_id: "tk-hist-001",
    parent_id: "tk-hist-001",
    type: "work_order",
    category_code: "work_order.review.manual_unlock",
    title: "人工解锁 App 账号",
    summary: "通过后台解锁客户 App 账号",
    channel: "online",
    customer_phone: "13800000001",
    customer_name: "张明",
    queue_code: "specialist",
    priority: "high",
    status: "closed",
    created_by: "agent_001",
    created_at: "2026-02-05T10:30:00+08:00",
    updated_at: "2026-02-06T09:15:00+08:00",
    closed_at:  "2026-02-06T09:15:00+08:00",
  }).run();
  await db.insert(workOrders).values({
    item_id: "wo-hist-001",
    work_type: "review",
    execution_mode: "manual",
    verification_mode: "customer_confirm",
    verification_status: "verified",
    result_code: "unlock_success",
  }).run();

  // 子任务：收集截图
  await db.insert(workItems).values({
    id: "task-hist-001",
    root_id: "tk-hist-001",
    parent_id: "wo-hist-001",
    type: "task",
    category_code: "task.collect.screenshot",
    title: "收集 App 登录异常截图",
    summary: "请客户提供闪退截图",
    customer_phone: "13800000001",
    customer_name: "张明",
    priority: "medium",
    status: "closed",
    created_by: "agent_001",
    created_at: "2026-02-05T10:35:00+08:00",
    updated_at: "2026-02-05T14:00:00+08:00",
    closed_at:  "2026-02-05T14:00:00+08:00",
  }).run();
  await db.insert(tasks).values({
    item_id: "task-hist-001",
    task_type: "collect",
    completed_by: "agent_001",
    completed_at: "2026-02-05T14:00:00+08:00",
  }).run();

  // 事件链
  await db.insert(workItemEvents).values([
    { item_id: "tk-hist-001", event_type: "created", actor_type: "user", actor_id: "agent_001", visibility: "internal", created_at: "2026-02-05T10:20:00+08:00" },
    { item_id: "tk-hist-001", event_type: "status_changed", actor_type: "user", actor_id: "agent_001", visibility: "internal",
      payload_json: JSON.stringify({ from: "new", to: "open" }), created_at: "2026-02-05T10:22:00+08:00" },
    { item_id: "wo-hist-001", event_type: "created", actor_type: "user", actor_id: "agent_001", visibility: "internal", created_at: "2026-02-05T10:30:00+08:00" },
    { item_id: "task-hist-001", event_type: "created", actor_type: "user", actor_id: "agent_001", visibility: "internal", created_at: "2026-02-05T10:35:00+08:00" },
    { item_id: "task-hist-001", event_type: "status_changed", actor_type: "user", actor_id: "agent_001", visibility: "internal",
      payload_json: JSON.stringify({ from: "open", to: "closed" }), note: "客户已提供截图", created_at: "2026-02-05T14:00:00+08:00" },
    { item_id: "wo-hist-001", event_type: "status_changed", actor_type: "user", actor_id: "agent_001", visibility: "internal",
      payload_json: JSON.stringify({ from: "open", to: "in_progress" }), note: "开始解锁操作", created_at: "2026-02-06T09:00:00+08:00" },
    { item_id: "wo-hist-001", event_type: "status_changed", actor_type: "user", actor_id: "agent_001", visibility: "internal",
      payload_json: JSON.stringify({ from: "in_progress", to: "closed" }), note: "解锁成功，客户确认可正常登录", created_at: "2026-02-06T09:15:00+08:00" },
    { item_id: "tk-hist-001", event_type: "status_changed", actor_type: "user", actor_id: "agent_001", visibility: "customer",
      payload_json: JSON.stringify({ from: "open", to: "closed" }), note: "工单已闭环，感谢反馈", created_at: "2026-02-06T11:00:00+08:00" },
  ]).run();

  // 线程
  await db.insert(issueThreads).values({
    id: "thrd-hist-001",
    thread_key: "thrd_key_hist_001",
    customer_phone: "13800000001",
    canonical_category_code: "ticket.incident.app_login",
    canonical_subject: "App 登录异常",
    status: "closed",
    master_ticket_id: "tk-hist-001",
    latest_item_id: "tk-hist-001",
    first_seen_at: "2026-02-05T10:20:00+08:00",
    last_seen_at:  "2026-02-06T11:00:00+08:00",
    reopen_until:  "2026-03-06T00:00:00+08:00",
    created_at: "2026-02-05T10:20:00+08:00",
    updated_at: "2026-02-06T11:00:00+08:00",
  }).run();

  // ── 场景 2: 未知扣费投诉 → 调账补偿（2026-02-12 ~ 02-15 解决） ────────────
  await db.insert(workItems).values({
    id: "tk-hist-002",
    root_id: "tk-hist-002",
    type: "ticket",
    category_code: "ticket.complaint.unknown_charge",
    title: "未知扣费投诉",
    summary: "客户投诉 1 月账单多出 30 元增值业务费，要求调账退款",
    description: "客户李华来电投诉1月账单比往月多出30元，经查为「视频彩铃」增值业务月租费。客户表示从未订购过该业务，要求退费并取消。",
    channel: "voice",
    customer_phone: "13800000002",
    customer_name: "李华",
    owner_id: "staff_agent_002",
    queue_code: "frontline",
    priority: "high",
    severity: "high",
    status: "resolved",
    created_by: "agent_002",
    created_at: "2026-02-12T14:00:00+08:00",
    updated_at: "2026-02-15T10:30:00+08:00",
    closed_at:  "2026-02-15T10:30:00+08:00",
  }).run();
  await db.insert(tickets).values({
    item_id: "tk-hist-002",
    ticket_category: "complaint",
    issue_type: "unknown_charge",
    resolution_summary: "经核查为误订增值业务，已调账退还 30 元",
    resolution_code: "refund_completed",
    satisfaction_status: "satisfied",
  }).run();

  // 子工单：调账执行
  await db.insert(workItems).values({
    id: "wo-hist-002",
    root_id: "tk-hist-002",
    parent_id: "tk-hist-002",
    type: "work_order",
    category_code: "work_order.execution.charge_adjustment",
    title: "调账退还增值业务费",
    summary: "退还 1 月误订增值业务费用 30 元",
    channel: "voice",
    customer_phone: "13800000002",
    customer_name: "李华",
    queue_code: "specialist",
    priority: "high",
    status: "resolved",
    created_by: "agent_002",
    created_at: "2026-02-12T14:30:00+08:00",
    updated_at: "2026-02-14T16:00:00+08:00",
    closed_at:  "2026-02-14T16:00:00+08:00",
  }).run();
  await db.insert(workOrders).values({
    item_id: "wo-hist-002",
    work_type: "execution",
    execution_mode: "manual",
    verification_mode: "customer_confirm",
    verification_status: "verified",
    result_code: "resolved_refund",
  }).run();

  // 预约：回访确认退款
  await db.insert(workItems).values({
    id: "apt-hist-001",
    root_id: "tk-hist-002",
    parent_id: "wo-hist-002",
    type: "appointment",
    category_code: "appointment.callback.result_check",
    title: "预约: 回访确认退款到账",
    customer_phone: "13800000002",
    customer_name: "李华",
    queue_code: "callback_team",
    priority: "medium",
    status: "closed",
    created_by: "agent_callback_01",
    created_at: "2026-02-14T16:30:00+08:00",
    updated_at: "2026-02-15T10:00:00+08:00",
    closed_at:  "2026-02-15T10:00:00+08:00",
  }).run();
  await db.insert(appointments).values({
    item_id: "apt-hist-001",
    appointment_type: "callback",
    resource_id: "agent_callback_01",
    scheduled_start_at: "2026-02-15T09:30:00+08:00",
    scheduled_end_at:   "2026-02-15T10:00:00+08:00",
    actual_start_at:    "2026-02-15T09:35:00+08:00",
    actual_end_at:      "2026-02-15T09:50:00+08:00",
    booking_status: "confirmed",
    location_text: "电话回访",
  }).run();

  // 子诉求：扣费核查（ticket -> sub-ticket）
  await db.insert(workItems).values({
    id: "tk-sub-hist-002a",
    root_id: "tk-hist-002",
    parent_id: "tk-hist-002",
    type: "ticket",
    category_code: "ticket.complaint.charge_investigation",
    title: "增值业务扣费核查子诉求",
    summary: "核查「视频彩铃」增值业务订购来源和扣费记录",
    description: "从主投诉拆出的子诉求：需查明客户何时、通过何渠道订购了视频彩铃业务，是否存在代扣协议或第三方误操作。核查完成后合并至主诉求。",
    channel: "voice",
    customer_phone: "13800000002",
    customer_name: "李华",
    owner_id: "staff_ops_001",
    queue_code: "specialist",
    priority: "high",
    severity: "medium",
    status: "resolved",
    created_by: "agent_002",
    created_at: "2026-02-12T15:00:00+08:00",
    updated_at: "2026-02-14T11:00:00+08:00",
    closed_at:  "2026-02-14T11:00:00+08:00",
  }).run();
  await db.insert(tickets).values({
    item_id: "tk-sub-hist-002a",
    ticket_category: "complaint",
    issue_type: "charge_investigation",
    resolution_summary: "经核查，视频彩铃业务于 2025-12-15 通过短信链接误操作订购，非客户主动行为",
    resolution_code: "investigation_confirmed_unauthorized",
    satisfaction_status: "satisfied",
  }).run();

  // 事件链
  await db.insert(workItemEvents).values([
    { item_id: "tk-hist-002", event_type: "created", actor_type: "user", actor_id: "agent_002", visibility: "internal", created_at: "2026-02-12T14:00:00+08:00" },
    { item_id: "tk-hist-002", event_type: "status_changed", actor_type: "user", actor_id: "agent_002", visibility: "internal",
      payload_json: JSON.stringify({ from: "new", to: "open" }), created_at: "2026-02-12T14:05:00+08:00" },
    { item_id: "tk-hist-002", event_type: "child_created", actor_type: "user", actor_id: "agent_002", visibility: "internal",
      payload_json: JSON.stringify({ child_id: "tk-sub-hist-002a", child_type: "ticket" }), created_at: "2026-02-12T15:00:00+08:00" },
    { item_id: "tk-sub-hist-002a", event_type: "created", actor_type: "user", actor_id: "agent_002", visibility: "internal",
      note: "从主投诉拆出：核查增值业务订购来源", created_at: "2026-02-12T15:00:00+08:00" },
    { item_id: "tk-sub-hist-002a", event_type: "status_changed", actor_type: "user", actor_id: "staff_ops_001", visibility: "internal",
      payload_json: JSON.stringify({ from: "new", to: "open" }), note: "接单开始核查", created_at: "2026-02-13T09:30:00+08:00" },
    { item_id: "tk-sub-hist-002a", event_type: "note_added", actor_type: "user", actor_id: "staff_ops_001", visibility: "internal",
      note: "查到订购记录：2025-12-15 短信链接误触发订购，非客户主动操作", created_at: "2026-02-14T10:30:00+08:00" },
    { item_id: "tk-sub-hist-002a", event_type: "status_changed", actor_type: "user", actor_id: "staff_ops_001", visibility: "internal",
      payload_json: JSON.stringify({ from: "open", to: "resolved" }), note: "核查完成，确认误订购", created_at: "2026-02-14T11:00:00+08:00" },
    { item_id: "wo-hist-002", event_type: "created", actor_type: "user", actor_id: "agent_002", visibility: "internal", created_at: "2026-02-12T14:30:00+08:00" },
    { item_id: "wo-hist-002", event_type: "status_changed", actor_type: "user", actor_id: "agent_002", visibility: "internal",
      payload_json: JSON.stringify({ from: "open", to: "in_progress" }), note: "核查账单明细", created_at: "2026-02-13T09:00:00+08:00" },
    { item_id: "wo-hist-002", event_type: "status_changed", actor_type: "user", actor_id: "ops_001", visibility: "internal",
      payload_json: JSON.stringify({ from: "in_progress", to: "resolved" }), note: "已完成调账退还 30 元", created_at: "2026-02-14T16:00:00+08:00" },
    { item_id: "apt-hist-001", event_type: "created", actor_type: "user", actor_id: "agent_callback_01", visibility: "internal",
      payload_json: JSON.stringify({ appointment_type: "callback" }), created_at: "2026-02-14T16:30:00+08:00" },
    { item_id: "apt-hist-001", event_type: "status_changed", actor_type: "user", actor_id: "agent_callback_01", visibility: "internal",
      payload_json: JSON.stringify({ from: "scheduled", to: "closed" }), note: "客户确认退款到账", created_at: "2026-02-15T10:00:00+08:00" },
    { item_id: "tk-hist-002", event_type: "status_changed", actor_type: "user", actor_id: "agent_002", visibility: "customer",
      payload_json: JSON.stringify({ from: "open", to: "resolved" }), note: "投诉处理完毕，已退还费用", created_at: "2026-02-15T10:30:00+08:00" },
  ]).run();

  // 线程
  await db.insert(issueThreads).values({
    id: "thrd-hist-002",
    thread_key: "thrd_key_hist_002",
    customer_phone: "13800000002",
    canonical_category_code: "ticket.complaint.unknown_charge",
    canonical_subject: "未知扣费投诉",
    status: "resolved",
    master_ticket_id: "tk-hist-002",
    latest_item_id: "tk-hist-002",
    first_seen_at: "2026-02-12T14:00:00+08:00",
    last_seen_at:  "2026-02-15T10:30:00+08:00",
    reopen_until:  "2026-03-15T00:00:00+08:00",
    created_at: "2026-02-12T14:00:00+08:00",
    updated_at: "2026-02-15T10:30:00+08:00",
  }).run();

  // ── 场景 3: 实名变更 → 到厅办理 → 改约 → 回访确认（2026-01-20 ~ 01-24） ──
  await db.insert(workItems).values({
    id: "tk-hist-003",
    root_id: "tk-hist-003",
    type: "ticket",
    category_code: "ticket.request.branch_handle",
    title: "营业厅实名变更",
    summary: "客户需变更实名信息，须至营业厅现场办理",
    description: "客户王芳来电要求变更手机号实名信息（原户主→本人）。因涉及身份证原件核验，需至营业厅现场办理。已预约长营路营业厅。",
    channel: "voice",
    customer_phone: "13800000003",
    customer_name: "王芳",
    owner_id: "staff_agent_001",
    queue_code: "frontline",
    priority: "medium",
    severity: "low",
    status: "closed",
    created_by: "agent_001",
    created_at: "2026-01-20T11:00:00+08:00",
    updated_at: "2026-01-24T15:00:00+08:00",
    closed_at:  "2026-01-24T15:00:00+08:00",
  }).run();
  await db.insert(tickets).values({
    item_id: "tk-hist-003",
    ticket_category: "request",
    issue_type: "branch_handle",
    resolution_summary: "客户已至营业厅完成实名变更，回访确认满意",
    resolution_code: "branch_completed",
    satisfaction_status: "satisfied",
  }).run();

  // 子工单：到厅办理
  await db.insert(workItems).values({
    id: "wo-hist-003",
    root_id: "tk-hist-003",
    parent_id: "tk-hist-003",
    type: "work_order",
    category_code: "work_order.branch_visit.real_name_change",
    title: "实名变更到厅办理",
    summary: "引导客户至长营路营业厅办理实名变更",
    channel: "voice",
    customer_phone: "13800000003",
    customer_name: "王芳",
    queue_code: "store_changyinglu",
    priority: "medium",
    status: "closed",
    created_by: "agent_001",
    created_at: "2026-01-20T11:15:00+08:00",
    updated_at: "2026-01-23T14:30:00+08:00",
    closed_at:  "2026-01-23T14:30:00+08:00",
  }).run();
  await db.insert(workOrders).values({
    item_id: "wo-hist-003",
    work_type: "field",
    execution_mode: "external",
    verification_mode: "customer_confirm",
    verification_status: "verified",
    result_code: "branch_completed",
    location_text: "长营路营业厅",
  }).run();

  // 预约：到厅（含改约）
  await db.insert(workItems).values({
    id: "apt-hist-002",
    root_id: "tk-hist-003",
    parent_id: "wo-hist-003",
    type: "appointment",
    category_code: "appointment.branch_visit.service_handle",
    title: "预约: 到厅办理实名变更",
    customer_phone: "13800000003",
    customer_name: "王芳",
    queue_code: "store_changyinglu",
    priority: "medium",
    status: "closed",
    created_by: "agent_001",
    created_at: "2026-01-20T11:20:00+08:00",
    updated_at: "2026-01-23T14:00:00+08:00",
    closed_at:  "2026-01-23T14:00:00+08:00",
  }).run();
  await db.insert(appointments).values({
    item_id: "apt-hist-002",
    appointment_type: "store_visit",
    scheduled_start_at: "2026-01-23T10:00:00+08:00",
    scheduled_end_at:   "2026-01-23T11:00:00+08:00",
    actual_start_at:    "2026-01-23T10:15:00+08:00",
    actual_end_at:      "2026-01-23T10:45:00+08:00",
    booking_status: "confirmed",
    location_text: "长营路营业厅",
    reschedule_count: 1,
  }).run();

  // 子工单：营业厅异常跟进（work_order -> sub_work_order）
  await db.insert(workItems).values({
    id: "wo-sub-hist-003a",
    root_id: "tk-hist-003",
    parent_id: "wo-hist-003",
    type: "work_order",
    category_code: "work_order.exception.branch_followup",
    title: "营业厅办理异常跟进",
    summary: "客户到店后发现系统身份核验失败，需后台补录数据",
    description: "客户到长营路营业厅办理实名变更时，系统身份核验环节报错（身份证照片OCR识别失败）。营业厅工作人员已手动受理，但系统状态未同步，需后台补录核验数据并刷新账户状态。",
    channel: "internal",
    customer_phone: "13800000003",
    customer_name: "王芳",
    owner_id: "staff_ops_001",
    queue_code: "specialist",
    priority: "medium",
    severity: "low",
    status: "closed",
    created_by: "store_changyinglu",
    created_at: "2026-01-23T11:00:00+08:00",
    updated_at: "2026-01-23T14:00:00+08:00",
    closed_at:  "2026-01-23T14:00:00+08:00",
  }).run();
  await db.insert(workOrders).values({
    item_id: "wo-sub-hist-003a",
    work_type: "execution",
    execution_mode: "manual",
    verification_mode: "system_check",
    verification_status: "verified",
    result_code: "data_patched_success",
  }).run();

  // 事件链（含改约 + 子工单异常跟进）
  await db.insert(workItemEvents).values([
    { item_id: "tk-hist-003", event_type: "created", actor_type: "user", actor_id: "agent_001", visibility: "internal", created_at: "2026-01-20T11:00:00+08:00" },
    { item_id: "wo-hist-003", event_type: "created", actor_type: "user", actor_id: "agent_001", visibility: "internal", created_at: "2026-01-20T11:15:00+08:00" },
    { item_id: "apt-hist-002", event_type: "created", actor_type: "user", actor_id: "agent_001", visibility: "internal",
      payload_json: JSON.stringify({ appointment_type: "store_visit", scheduled: "2026-01-22T10:00:00+08:00" }), created_at: "2026-01-20T11:20:00+08:00" },
    { item_id: "apt-hist-002", event_type: "rescheduled", actor_type: "customer", visibility: "internal",
      payload_json: JSON.stringify({ from: "2026-01-22T10:00:00+08:00", to: "2026-01-23T10:00:00+08:00", reason: "客户临时有事" }),
      note: "客户要求改约至 1/23", created_at: "2026-01-21T16:00:00+08:00" },
    { item_id: "apt-hist-002", event_type: "status_changed", actor_type: "system", visibility: "internal",
      payload_json: JSON.stringify({ from: "scheduled", to: "closed" }), note: "客户到店完成办理", created_at: "2026-01-23T14:00:00+08:00" },
    // 子工单：营业厅异常跟进
    { item_id: "wo-hist-003", event_type: "child_created", actor_type: "user", actor_id: "store_changyinglu", visibility: "internal",
      payload_json: JSON.stringify({ child_id: "wo-sub-hist-003a", child_type: "work_order" }), created_at: "2026-01-23T11:00:00+08:00" },
    { item_id: "wo-sub-hist-003a", event_type: "created", actor_type: "user", actor_id: "store_changyinglu", visibility: "internal",
      note: "营业厅反馈：身份核验系统异常，需后台补录", created_at: "2026-01-23T11:00:00+08:00" },
    { item_id: "wo-sub-hist-003a", event_type: "status_changed", actor_type: "user", actor_id: "staff_ops_001", visibility: "internal",
      payload_json: JSON.stringify({ from: "new", to: "in_progress" }), note: "接单，开始补录核验数据", created_at: "2026-01-23T11:30:00+08:00" },
    { item_id: "wo-sub-hist-003a", event_type: "status_changed", actor_type: "user", actor_id: "staff_ops_001", visibility: "internal",
      payload_json: JSON.stringify({ from: "in_progress", to: "closed" }), note: "数据补录完成，系统状态已同步", created_at: "2026-01-23T14:00:00+08:00" },
    { item_id: "wo-hist-003", event_type: "status_changed", actor_type: "system", visibility: "internal",
      payload_json: JSON.stringify({ from: "in_progress", to: "closed" }), note: "营业厅确认实名变更完成", created_at: "2026-01-23T14:30:00+08:00" },
    { item_id: "tk-hist-003", event_type: "status_changed", actor_type: "user", actor_id: "agent_callback_01", visibility: "customer",
      payload_json: JSON.stringify({ from: "open", to: "closed" }), note: "回访确认客户满意，关闭工单", created_at: "2026-01-24T15:00:00+08:00" },
  ]).run();

  // 线程
  await db.insert(issueThreads).values({
    id: "thrd-hist-003",
    thread_key: "thrd_key_hist_003",
    customer_phone: "13800000003",
    canonical_category_code: "ticket.request.branch_handle",
    canonical_subject: "营业厅实名变更",
    status: "closed",
    master_ticket_id: "tk-hist-003",
    latest_item_id: "tk-hist-003",
    first_seen_at: "2026-01-20T11:00:00+08:00",
    last_seen_at:  "2026-01-24T15:00:00+08:00",
    reopen_until:  "2026-02-24T00:00:00+08:00",
    created_at: "2026-01-20T11:00:00+08:00",
    updated_at: "2026-01-24T15:00:00+08:00",
  }).run();

  // ── 场景 4: 转人工超时 → 历史待审核线索（2026-03-10） ─────────────────────
  await db.insert(workItemIntakes).values({
    id: "intk-hist-001",
    source_kind: "handoff_overflow",
    source_channel: "voice",
    source_ref: "sess_hist_overflow",
    customer_phone: "13800000006",
    customer_name: "周婷",
    subject: "转人工超时 — 套餐变更咨询",
    raw_payload_json: JSON.stringify({
      session_id: "sess_hist_overflow",
      summary: "客户套餐变更咨询，等待转人工超过 5 分钟后挂断",
      wait_duration_sec: 312,
    }),
    normalized_payload_json: JSON.stringify({
      customer_phone: "13800000006",
      subject: "转人工超时 — 套餐变更咨询",
      category_code: "ticket.inquiry.plan",
    }),
    status: "draft_created",
    decision_mode: "manual_confirm",
    priority_hint: "medium",
    created_at: "2026-03-10T16:45:00+08:00",
    updated_at: "2026-03-10T16:46:00+08:00",
  }).run();

  await db.insert(workItemDrafts).values({
    id: "drft-hist-001",
    intake_id: "intk-hist-001",
    target_type: "ticket",
    category_code: "ticket.inquiry.plan",
    title: "转人工超时 — 套餐变更咨询",
    summary: "客户等待转人工超时挂断，需回访确认需求",
    customer_phone: "13800000006",
    customer_name: "周婷",
    priority: "medium",
    queue_code: "callback_team",
    structured_payload_json: JSON.stringify({ ticket_category: "inquiry" }),
    status: "pending_review",
    review_required: 1,
    created_at: "2026-03-10T16:46:00+08:00",
    updated_at: "2026-03-10T16:46:00+08:00",
  }).run();

  // ── 场景 5: 重复线索命中旧事项 → merge review（2026-03-08 ~ 03-09） ───────
  // 线索：重复的未知扣费
  await db.insert(workItemIntakes).values({
    id: "intk-hist-002",
    source_kind: "self_service_form",
    source_channel: "self_service",
    source_ref: "form_charge_002",
    customer_phone: "13800000002",
    customer_name: "李华",
    subject: "再次反馈扣费问题",
    raw_payload_json: JSON.stringify({
      form_id: "form_charge_002",
      form_title: "费用问题反馈",
      form_description: "上次退了 30 元但这个月又多扣了 15 元",
    }),
    dedupe_key: "thrd_key_hist_002",
    thread_id: "thrd-hist-002",
    resolution_action: "ignored_duplicate",
    resolution_reason_json: JSON.stringify({ reason: "原投诉已解决且在重开窗口内，客户需通过原渠道追踪" }),
    status: "discarded",
    decision_mode: "manual_confirm",
    sentiment_score: 35,
    created_at: "2026-03-08T11:00:00+08:00",
    updated_at: "2026-03-08T11:05:00+08:00",
  }).run();

  // 另一条线索：情绪升级 → merge review → executed
  await db.insert(workItemIntakes).values({
    id: "intk-hist-003",
    source_kind: "emotion_escalation",
    source_channel: "online",
    source_ref: "sess_hist_emotion",
    customer_phone: "13800000002",
    customer_name: "李华",
    subject: "客户情绪升级 — 扣费争议未解决",
    raw_payload_json: JSON.stringify({
      session_id: "sess_hist_emotion",
      summary: "客户情绪激动，表示上次退费后再次被扣款",
      emotion_score: 0.92,
    }),
    dedupe_key: "thrd_key_hist_002",
    thread_id: "thrd-hist-002",
    resolution_action: "reopen_master",
    status: "materialized",
    decision_mode: "manual_confirm",
    risk_score: 80,
    sentiment_score: 15,
    created_at: "2026-03-09T09:20:00+08:00",
    updated_at: "2026-03-09T09:35:00+08:00",
  }).run();

  await db.insert(issueMergeReviews).values({
    id: "mrev-hist-001",
    intake_id: "intk-hist-003",
    candidate_thread_id: "thrd-hist-002",
    recommended_action: "reopen_master",
    score_total: 88,
    score_breakdown_json: JSON.stringify({
      customer_match: 100,
      category_match: 90,
      time_window: 75,
      semantic_similarity: 85,
    }),
    match_reason_json: JSON.stringify({ reason: "同一客户同一扣费投诉，线程仍在重开窗口内" }),
    decision_status: "executed",
    decided_by: "ops_001",
    decided_at: "2026-03-09T09:30:00+08:00",
    executed_at: "2026-03-09T09:35:00+08:00",
    created_at: "2026-03-09T09:25:00+08:00",
  }).run();

  // ── 场景 6: 外部监控告警失败态（2026-02-28） ──────────────────────────────
  await db.insert(workItemIntakes).values({
    id: "intk-hist-004",
    source_kind: "external_monitoring",
    source_channel: "webhook",
    source_ref: "alert_nagios_005",
    subject: "核心网告警 — 分类失败",
    raw_payload_json: JSON.stringify({
      alert_id: "alert_nagios_005",
      alert_title: "核心网设备温度异常",
      alert_type: "temperature_warning",
      severity: "high",
      monitoring_system: "nagios",
      alert_description: "核心网机房 B3 设备温度超过阈值",
    }),
    status: "failed",
    risk_score: 70,
    resolution_reason_json: JSON.stringify({
      reason: "告警分类不在工单系统已注册类别中，无法自动建单",
      failed_step: "category_mapping",
      alert_type: "temperature_warning",
    }),
    created_at: "2026-02-28T03:15:00+08:00",
    updated_at: "2026-02-28T03:15:30+08:00",
  }).run();

  // ── 补充 merge review: 被拒绝的案例 ──────────────────────────────────────
  await db.insert(issueMergeReviews).values({
    id: "mrev-hist-002",
    intake_id: "intk-hist-002",
    candidate_thread_id: "thrd-hist-002",
    recommended_action: "append_followup",
    score_total: 52,
    score_breakdown_json: JSON.stringify({
      customer_match: 100,
      category_match: 70,
      time_window: 30,
      semantic_similarity: 40,
    }),
    match_reason_json: JSON.stringify({ reason: "同一客户但费用金额不同，可能是新问题" }),
    decision_status: "rejected",
    decided_by: "ops_002",
    decided_at: "2026-03-08T11:03:00+08:00",
    created_at: "2026-03-08T11:01:00+08:00",
  }).run();

  console.log("[work-order] History demo data complete: 3 tickets + 3 child work orders + 2 appointments + 1 task + 4 intakes + 2 drafts + 3 threads + 2 merge reviews");

  console.log("[work-order] Seed complete (live + history)");
}

export { seed };

// 直接运行（顶层 await 确保 import 时也会等待完成）
await seed().catch(console.error);
