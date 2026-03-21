/**
 * 用户信息服务 — query_subscriber, query_bill, query_plans, analyze_bill_anomaly
 * Port: 18003
 */
import { db, plans, subscribers, subscriberSubscriptions, valueAddedServices, bills, mcpLog, monthLabel, startMcpHttpServer, eq, and, z, McpServer, performance } from "../shared/server.js";

// ── 领域规则（来源：billing-rules.md）────────────────────────────────────────
const OVERDUE_NORMAL_MAX = 90;
const OVERDUE_PRE_CANCEL_MAX = 180;
const ANOMALY_THRESHOLD = 0.2;

type ArrearsLevel = "none" | "normal" | "pre_cancel" | "recycled";

function classifyArrears(status: string, balance: number, overdueDays: number): ArrearsLevel {
  if (status === "cancelled") return "recycled";
  if (balance >= 0) return "none";
  if (overdueDays > OVERDUE_PRE_CANCEL_MAX) return "recycled";
  if (overdueDays > OVERDUE_NORMAL_MAX) return "pre_cancel";
  return "normal";
}

function usageRatio(used: number, total: number): number | null {
  if (total <= 0) return null; // 不限量套餐，不适用
  return Math.round((used / total) * 100) / 100;
}

interface FeeBreakdown { item: string; amount: number; ratio: number }

function buildBreakdown(bill: { total: number; plan_fee: number; data_fee: number; voice_fee: number; value_added_fee: number; tax: number }): FeeBreakdown[] {
  const total = bill.total || 1;
  return [
    { item: "套餐月费", amount: bill.plan_fee, ratio: Math.round((bill.plan_fee / total) * 100) / 100 },
    { item: "流量费", amount: bill.data_fee, ratio: Math.round((bill.data_fee / total) * 100) / 100 },
    { item: "通话费", amount: bill.voice_fee, ratio: Math.round((bill.voice_fee / total) * 100) / 100 },
    { item: "增值业务费", amount: bill.value_added_fee, ratio: Math.round((bill.value_added_fee / total) * 100) / 100 },
    { item: "税费", amount: bill.tax, ratio: Math.round((bill.tax / total) * 100) / 100 },
  ].filter(i => i.amount > 0);
}

function prevMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

// ── Server ───────────────────────────────────────────────────────────────────

function createServer(): McpServer {
  const server = new McpServer({ name: "user-info-service", version: "1.0.0" });

  server.tool("query_subscriber", "根据手机号查询电信用户信息（套餐、状态、余额、用量分析、增值业务详情、欠费分层）", {
    phone: z.string().describe('用户手机号，如 "13800000001"'),
  }, async ({ phone }) => {
    const t0 = performance.now();
    const sub = await db.select().from(subscribers).where(eq(subscribers.phone, phone)).get();
    if (!sub) {
      mcpLog("user-info", "query_subscriber", { phone, found: false, ms: Math.round(performance.now() - t0) });
      return { content: [{ type: "text", text: JSON.stringify({ phone, name: null, gender: null, status: null, balance: 0, plan_fee: 0, data_used_gb: 0, data_total_gb: 0, data_usage_ratio: 0, voice_used_min: 0, voice_total_min: 0, voice_usage_ratio: 0, is_arrears: false, arrears_level: null, overdue_days: 0, services: [], vas_total_fee: 0 }) }] };
    }
    const plan = await db.select().from(plans).where(eq(plans.plan_id, sub.plan_id)).get();
    const subs = await db.select({
      service_id: subscriberSubscriptions.service_id,
      name: valueAddedServices.name,
      monthly_fee: valueAddedServices.monthly_fee,
    }).from(subscriberSubscriptions)
      .leftJoin(valueAddedServices, eq(subscriberSubscriptions.service_id, valueAddedServices.service_id))
      .where(eq(subscriberSubscriptions.phone, phone)).all();

    const dataTotal = plan?.data_gb ?? -1;
    const voiceTotal = plan?.voice_min ?? -1;
    const services = subs.map(s => ({ service_id: s.service_id, name: s.name ?? s.service_id, monthly_fee: s.monthly_fee ?? 0 }));
    const vasTotalFee = services.reduce((sum, s) => sum + s.monthly_fee, 0);
    const arrearsLevel = classifyArrears(sub.status, sub.balance, (sub as any).overdue_days ?? 0);

    mcpLog("user-info", "query_subscriber", { phone, found: true, ms: Math.round(performance.now() - t0) });
    return { content: [{ type: "text", text: JSON.stringify({
      phone: sub.phone,
      name: sub.name,
      gender: (sub as any).gender ?? null,
      status: sub.status,
      balance: sub.balance,
      plan_fee: plan?.monthly_fee ?? 0,
      data_used_gb: sub.data_used_gb,
      data_total_gb: dataTotal,
      data_usage_ratio: usageRatio(sub.data_used_gb, dataTotal),
      voice_used_min: sub.voice_used_min,
      voice_total_min: voiceTotal,
      voice_usage_ratio: usageRatio(sub.voice_used_min, voiceTotal),
      is_arrears: sub.balance < 0,
      arrears_level: arrearsLevel,
      overdue_days: (sub as any).overdue_days ?? 0,
      services,
      vas_total_fee: vasTotalFee,
    }) }] };
  });

  server.tool("query_bill", "查询用户指定月份的账单明细（含费用拆解 breakdown）", {
    phone: z.string().describe("用户手机号"),
    month: z.string().optional().describe('账单月份，格式 "YYYY-MM"，不填则返回最近3个月'),
  }, async ({ phone, month }) => {
    const t0 = performance.now();
    const sub = await db.select({ phone: subscribers.phone }).from(subscribers).where(eq(subscribers.phone, phone)).get();
    if (!sub) { mcpLog("user-info", "query_bill", { phone, found: false, ms: Math.round(performance.now() - t0) }); return { content: [{ type: "text", text: JSON.stringify({ bills: [], count: 0, requested_month: month ?? null, note: `未找到手机号 ${phone} 的账单记录` }) }] }; }
    if (month) {
      const bill = await db.select().from(bills).where(and(eq(bills.phone, phone), eq(bills.month, month))).get();
      if (!bill) { mcpLog("user-info", "query_bill", { phone, month, found: false, ms: Math.round(performance.now() - t0) }); return { content: [{ type: "text", text: JSON.stringify({ bills: [], count: 0, requested_month: month, note: `未找到 ${month} 的账单` }) }] }; }
      mcpLog("user-info", "query_bill", { phone, month, found: true, ms: Math.round(performance.now() - t0) });
      const label = monthLabel(bill.month);
      const enriched = { ...bill, month_label: label, breakdown: buildBreakdown(bill), payable: bill.status === "unpaid" };
      return { content: [{ type: "text", text: JSON.stringify({ bills: [enriched], count: 1, requested_month: month, note: `本结果为${label}账单` }) }] };
    }
    const recentBills = await db.select().from(bills).where(eq(bills.phone, phone)).orderBy(bills.month).limit(3).all();
    mcpLog("user-info", "query_bill", { phone, found: true, count: recentBills.length, ms: Math.round(performance.now() - t0) });
    const labeled = recentBills.map(b => ({ ...b, month_label: monthLabel(b.month), breakdown: buildBreakdown(b), payable: b.status === "unpaid" }));
    return { content: [{ type: "text", text: JSON.stringify({ bills: labeled, count: labeled.length, requested_month: null, note: `以下为最近${labeled.length}个月账单` }) }] };
  });

  server.tool("query_plans", "获取所有可用套餐列表，或查询指定套餐详情", {
    plan_id: z.string().optional().describe("套餐 ID，不填则返回全部套餐"),
  }, async ({ plan_id }) => {
    const t0 = performance.now();
    const parsePlan = (p: typeof plans.$inferSelect) => ({ ...p, features: JSON.parse(p.features) as string[] });
    if (plan_id) {
      const plan = await db.select().from(plans).where(eq(plans.plan_id, plan_id)).get();
      if (!plan) { mcpLog("user-info", "query_plans", { plan_id, found: false, ms: Math.round(performance.now() - t0) }); return { content: [{ type: "text", text: JSON.stringify({ plans: [], count: 0, requested_plan_id: plan_id }) }] }; }
      mcpLog("user-info", "query_plans", { plan_id, found: true, ms: Math.round(performance.now() - t0) });
      return { content: [{ type: "text", text: JSON.stringify({ plans: [parsePlan(plan)], count: 1, requested_plan_id: plan_id }) }] };
    }
    const allPlans = await db.select().from(plans).all();
    mcpLog("user-info", "query_plans", { found: true, count: allPlans.length, ms: Math.round(performance.now() - t0) });
    return { content: [{ type: "text", text: JSON.stringify({ plans: allPlans.map(parsePlan), count: allPlans.length, requested_plan_id: null }) }] };
  });

  server.tool("analyze_bill_anomaly", "分析用户账单异常：自动对比当月与上月账单，计算差额和涨幅，定位费用异常原因，给出处理建议", {
    phone: z.string().describe("用户手机号"),
    month: z.string().describe('当月账期，格式 YYYY-MM'),
  }, async ({ phone, month }) => {
    const t0 = performance.now();
    const prev = prevMonth(month);
    const [curBill, prevBill] = await Promise.all([
      db.select().from(bills).where(and(eq(bills.phone, phone), eq(bills.month, month))).get(),
      db.select().from(bills).where(and(eq(bills.phone, phone), eq(bills.month, prev))).get(),
    ]);

    if (!curBill) {
      mcpLog("user-info", "analyze_bill_anomaly", { phone, month, found: false, ms: Math.round(performance.now() - t0) });
      return { content: [{ type: "text", text: JSON.stringify({ is_anomaly: false, current_month: month, previous_month: prev, current_total: 0, previous_total: prevBill?.total ?? 0, diff: 0, change_ratio: 0, primary_cause: "unknown", causes: [], recommendation: "当月账单未找到。" }) }] };
    }
    if (!prevBill) {
      mcpLog("user-info", "analyze_bill_anomaly", { phone, month, no_prev: true, ms: Math.round(performance.now() - t0) });
      return { content: [{ type: "text", text: JSON.stringify({ is_anomaly: false, current_month: month, previous_month: prev, current_total: curBill.total, previous_total: 0, diff: curBill.total, change_ratio: 0, primary_cause: "unknown", causes: [], recommendation: "无上月账单可供对比。" }) }] };
    }

    const diff = Math.round((curBill.total - prevBill.total) * 100) / 100;
    const changeRatio = prevBill.total > 0 ? Math.round((diff / prevBill.total) * 100) / 100 : 0;
    const isAnomaly = changeRatio > ANOMALY_THRESHOLD;

    type CauseType = "data_overage" | "voice_overage" | "new_vas" | "unknown";
    const causes: Array<{ type: CauseType; item: string; current_amount: number; previous_amount: number; diff: number }> = [];
    const pairs: Array<{ item: string; type: CauseType; cur: number; prev: number }> = [
      { item: "流量费", type: "data_overage", cur: curBill.data_fee, prev: prevBill.data_fee },
      { item: "通话费", type: "voice_overage", cur: curBill.voice_fee, prev: prevBill.voice_fee },
      { item: "增值业务费", type: "new_vas", cur: curBill.value_added_fee, prev: prevBill.value_added_fee },
    ];
    for (const p of pairs) {
      if (p.cur > p.prev) causes.push({ type: p.type, item: p.item, current_amount: p.cur, previous_amount: p.prev, diff: Math.round((p.cur - p.prev) * 100) / 100 });
    }
    causes.sort((a, b) => b.diff - a.diff);
    const primaryCause = causes.length > 0 ? causes[0].type : "unknown";

    const recs: Record<CauseType, string> = {
      data_overage: "流量超出套餐额度，建议购买流量加油包或升级套餐。",
      voice_overage: "通话时长超出套餐额度，建议购买通话加油包或升级套餐。",
      new_vas: "增值业务费用增加，建议在 APP 中查看已订业务并退订不需要的服务。",
      unknown: "无法定位具体原因，建议拨打 10086 由人工客服核查。",
    };

    mcpLog("user-info", "analyze_bill_anomaly", { phone, month, is_anomaly: isAnomaly, primary_cause: primaryCause, ms: Math.round(performance.now() - t0) });
    return { content: [{ type: "text", text: JSON.stringify({
      is_anomaly: isAnomaly,
      current_month: month,
      previous_month: prev,
      current_total: curBill.total,
      previous_total: prevBill.total,
      diff,
      change_ratio: Math.round(changeRatio * 100),
      primary_cause: primaryCause,
      causes,
      recommendation: recs[primaryCause] ?? recs.unknown,
    }) }] };
  });

  return server;
}

startMcpHttpServer("user-info-service", Number(process.env.PORT ?? 18003), createServer);
