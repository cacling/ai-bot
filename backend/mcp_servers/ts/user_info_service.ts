/**
 * 用户信息服务 — query_subscriber, query_bill, query_plans
 * Port: 18003
 */
import { db, plans, subscribers, subscriberSubscriptions, bills, mcpLog, monthLabel, startMcpHttpServer, eq, and, z, McpServer, performance } from "./shared.js";

function createServer(): McpServer {
  const server = new McpServer({ name: "user-info-service", version: "1.0.0" });

  server.tool("query_subscriber", "根据手机号查询电信用户信息（套餐、状态、余额、流量使用情况）", {
    phone: z.string().describe('用户手机号，如 "13800000001"'),
  }, async ({ phone }) => {
    const t0 = performance.now();
    const sub = await db.select().from(subscribers).where(eq(subscribers.phone, phone)).get();
    if (!sub) {
      mcpLog("user-info", "query_subscriber", { phone, found: false, ms: Math.round(performance.now() - t0) });
      return { content: [{ type: "text", text: JSON.stringify({ found: false, message: `未找到手机号 ${phone} 的用户信息` }) }] };
    }
    const plan = await db.select().from(plans).where(eq(plans.plan_id, sub.plan_id)).get();
    const subs = await db.select({ service_id: subscriberSubscriptions.service_id }).from(subscriberSubscriptions).where(eq(subscriberSubscriptions.phone, phone)).all();
    mcpLog("user-info", "query_subscriber", { phone, found: true, ms: Math.round(performance.now() - t0) });
    return { content: [{ type: "text", text: JSON.stringify({ found: true, subscriber: { ...sub, plan: plan?.name ?? sub.plan_id, data_total_gb: plan?.data_gb ?? -1, voice_total_min: plan?.voice_min ?? -1, subscriptions: subs.map(s => s.service_id) } }) }] };
  });

  server.tool("query_bill", "查询用户指定月份的账单明细（月费、流量费、通话费、增值业务费、税费）", {
    phone: z.string().describe("用户手机号"),
    month: z.string().optional().describe('账单月份，格式 "YYYY-MM"，不填则返回最近3个月'),
  }, async ({ phone, month }) => {
    const t0 = performance.now();
    const sub = await db.select({ phone: subscribers.phone }).from(subscribers).where(eq(subscribers.phone, phone)).get();
    if (!sub) { mcpLog("user-info", "query_bill", { phone, found: false, ms: Math.round(performance.now() - t0) }); return { content: [{ type: "text", text: JSON.stringify({ found: false, message: `未找到手机号 ${phone} 的账单记录` }) }] }; }
    if (month) {
      const bill = await db.select().from(bills).where(and(eq(bills.phone, phone), eq(bills.month, month))).get();
      if (!bill) { mcpLog("user-info", "query_bill", { phone, month, found: false, ms: Math.round(performance.now() - t0) }); return { content: [{ type: "text", text: JSON.stringify({ found: false, message: `未找到 ${month} 的账单` }) }] }; }
      mcpLog("user-info", "query_bill", { phone, month, found: true, ms: Math.round(performance.now() - t0) });
      const label = monthLabel(bill.month);
      return { content: [{ type: "text", text: JSON.stringify({ found: true, note: `本结果为${label}账单`, bill: { ...bill, month_label: label } }) }] };
    }
    const recentBills = await db.select().from(bills).where(eq(bills.phone, phone)).orderBy(bills.month).limit(3).all();
    mcpLog("user-info", "query_bill", { phone, found: true, count: recentBills.length, ms: Math.round(performance.now() - t0) });
    const labeled = recentBills.map(b => ({ ...b, month_label: monthLabel(b.month) }));
    return { content: [{ type: "text", text: JSON.stringify({ found: true, note: `以下为最近${labeled.length}个月账单`, bills: labeled }) }] };
  });

  server.tool("query_plans", "获取所有可用套餐列表，或查询指定套餐详情", {
    plan_id: z.string().optional().describe("套餐 ID，不填则返回全部套餐"),
  }, async ({ plan_id }) => {
    const t0 = performance.now();
    const parsePlan = (p: typeof plans.$inferSelect) => ({ ...p, features: JSON.parse(p.features) as string[] });
    if (plan_id) {
      const plan = await db.select().from(plans).where(eq(plans.plan_id, plan_id)).get();
      if (!plan) { mcpLog("user-info", "query_plans", { plan_id, found: false, ms: Math.round(performance.now() - t0) }); return { content: [{ type: "text", text: JSON.stringify({ found: false, message: `套餐 ${plan_id} 不存在` }) }] }; }
      mcpLog("user-info", "query_plans", { plan_id, found: true, ms: Math.round(performance.now() - t0) });
      return { content: [{ type: "text", text: JSON.stringify({ found: true, plan: parsePlan(plan) }) }] };
    }
    const allPlans = await db.select().from(plans).all();
    mcpLog("user-info", "query_plans", { found: true, count: allPlans.length, ms: Math.round(performance.now() - t0) });
    return { content: [{ type: "text", text: JSON.stringify({ found: true, plans: allPlans.map(parsePlan) }) }] };
  });

  return server;
}

startMcpHttpServer("user-info-service", Number(process.env.PORT ?? 18003), createServer);
