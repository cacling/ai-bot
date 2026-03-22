/**
 * billing.ts — 模拟账务系统
 */
import { Hono } from "hono";
import { db, subscribers, bills, billingBillItems, billingDisputeCases, paymentsTransactions, eq, and } from "../db.js";

const app = new Hono();

type BillRow = typeof bills.$inferSelect;

function billItemsFor(bill: BillRow) {
  const items = [
    { item_type: "plan_fee", item_name: "套餐月费", amount: bill.plan_fee, disputable: false },
    { item_type: "data_fee", item_name: "流量超额费", amount: bill.data_fee, disputable: bill.data_fee > 0 },
    { item_type: "voice_fee", item_name: "语音超额费", amount: bill.voice_fee, disputable: bill.voice_fee > 0 },
    { item_type: "sms_fee", item_name: "短信费", amount: bill.sms_fee, disputable: bill.sms_fee > 0 },
    { item_type: "value_added_fee", item_name: "增值业务费", amount: bill.value_added_fee, disputable: bill.value_added_fee > 0 },
    { item_type: "tax", item_name: "税费", amount: bill.tax, disputable: false },
  ].filter((item) => item.amount > 0);

  return items.map((item, index) => ({
    line_id: `${bill.phone}-${bill.month}-${index + 1}`,
    occurred_at: `${bill.month}-01T00:00:00+08:00`,
    source: "mock_billing_system",
    ...item,
  }));
}

app.get("/accounts/:msisdn/bills", async (c) => {
  const msisdn = c.req.param("msisdn");
  const limit = Number(c.req.query("limit") ?? 6);
  const sub = await db.select().from(subscribers).where(eq(subscribers.phone, msisdn)).get();
  if (!sub) return c.json({ success: false, message: `未找到手机号 ${msisdn}` }, 404);

  const rows = await db.select().from(bills).where(eq(bills.phone, msisdn)).all();
  const sorted = rows.sort((a, b) => b.month.localeCompare(a.month)).slice(0, limit);
  return c.json({
    success: true,
    msisdn,
    count: sorted.length,
    bills: sorted,
  });
});

// A1: 单月账单查询（MCP Server query_bill 单月模式使用）
app.get("/accounts/:msisdn/bills/:month", async (c) => {
  const msisdn = c.req.param("msisdn");
  const month = c.req.param("month");
  const bill = await db.select().from(bills).where(and(eq(bills.phone, msisdn), eq(bills.month, month))).get();
  if (!bill) return c.json({ success: false, message: `未找到 ${msisdn} 在 ${month} 的账单` }, 404);

  return c.json({
    success: true,
    msisdn,
    month,
    bill: { ...bill, items: billItemsFor(bill) },
  });
});

app.get("/accounts/:msisdn/bills/:month/items", async (c) => {
  const msisdn = c.req.param("msisdn");
  const month = c.req.param("month");
  const bill = await db.select().from(bills).where(and(eq(bills.phone, msisdn), eq(bills.month, month))).get();
  if (!bill) return c.json({ success: false, message: `未找到 ${msisdn} 在 ${month} 的账单` }, 404);
  const storedItems = await db.select().from(billingBillItems)
    .where(and(eq(billingBillItems.phone, msisdn), eq(billingBillItems.month, month)))
    .all();

  return c.json({
    success: true,
    msisdn,
    month,
    total: bill.total,
    items: storedItems.length > 0 ? storedItems : billItemsFor(bill),
  });
});

app.get("/accounts/:msisdn/payments", async (c) => {
  const msisdn = c.req.param("msisdn");
  const sub = await db.select().from(subscribers).where(eq(subscribers.phone, msisdn)).get();
  if (!sub) return c.json({ success: false, message: `未找到手机号 ${msisdn}` }, 404);

  const payments = await db.select().from(paymentsTransactions).where(eq(paymentsTransactions.phone, msisdn)).all();

  return c.json({
    success: true,
    msisdn,
    payments,
  });
});

app.post("/anomaly/analyze", async (c) => {
  const { msisdn, month } = await c.req.json<{ msisdn?: string; month?: string }>();
  if (!msisdn || !month) return c.json({ success: false, message: "msisdn 和 month 不能为空" }, 400);

  const current = await db.select().from(bills).where(and(eq(bills.phone, msisdn), eq(bills.month, month))).get();
  if (!current) return c.json({ success: false, message: `未找到 ${msisdn} 在 ${month} 的账单` }, 404);

  const [year, mon] = month.split("-").map(Number);
  const prevMonth = mon === 1 ? `${year - 1}-12` : `${year}-${String(mon - 1).padStart(2, "0")}`;
  const previous = await db.select().from(bills).where(and(eq(bills.phone, msisdn), eq(bills.month, prevMonth))).get();

  const diff = current.total - (previous?.total ?? 0);
  const changeRatio = previous?.total ? Number((diff / previous.total).toFixed(2)) : 0;
  const primary_cause = current.data_fee > (previous?.data_fee ?? 0)
    ? "data_fee"
    : current.value_added_fee > (previous?.value_added_fee ?? 0)
      ? "value_added_fee"
      : "unknown";

  return c.json({
    success: true,
    msisdn,
    month,
    previous_month: prevMonth,
    current_total: current.total,
    previous_total: previous?.total ?? 0,
    diff,
    change_ratio: changeRatio,
    primary_cause,
  });
});

app.get("/accounts/:msisdn/disputes", async (c) => {
  const msisdn = c.req.param("msisdn");
  const sub = await db.select().from(subscribers).where(eq(subscribers.phone, msisdn)).get();
  if (!sub) return c.json({ success: false, message: `未找到手机号 ${msisdn}` }, 404);

  const disputes = await db.select().from(billingDisputeCases).where(eq(billingDisputeCases.phone, msisdn)).all();
  return c.json({
    success: true,
    msisdn,
    count: disputes.length,
    disputes,
  });
});

export default app;
