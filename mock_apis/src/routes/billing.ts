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
  const billsWithItems = sorted.map((bill) => ({ ...bill, items: billItemsFor(bill) }));
  return c.json({
    success: true,
    msisdn,
    count: sorted.length,
    bills: billsWithItems,
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

  // 逐项对比，生成 causes 数组
  const feeFields = [
    { field: "plan_fee" as const, label: "套餐月费", cause: "plan_fee" },
    { field: "data_fee" as const, label: "流量费", cause: "data_fee" },
    { field: "voice_fee" as const, label: "通话费", cause: "voice_fee" },
    { field: "sms_fee" as const, label: "短信费", cause: "sms_fee" },
    { field: "value_added_fee" as const, label: "增值业务费", cause: "value_added_fee" },
    { field: "tax" as const, label: "税费", cause: "tax" },
  ];

  const causes = feeFields
    .map(({ field, label, cause }) => {
      const cur = current[field] ?? 0;
      const prev = previous?.[field] ?? 0;
      const itemDiff = cur - prev;
      if (itemDiff === 0) return null;
      return { cause, label, current_amount: cur, previous_amount: prev, diff: itemDiff };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  // 用 bill_items 补充细项来源
  const currentItems = billItemsFor(current);
  const previousItems = previous ? billItemsFor(previous) : [];
  const itemDetails = currentItems
    .filter((item) => {
      const prevItem = previousItems.find((p) => p.item_type === item.item_type && p.item_name === item.item_name);
      return !prevItem || item.amount !== prevItem.amount;
    })
    .map((item) => {
      const prevItem = previousItems.find((p) => p.item_type === item.item_type && p.item_name === item.item_name);
      return { item_name: item.item_name, item_type: item.item_type, current_amount: item.amount, previous_amount: prevItem?.amount ?? 0, diff: item.amount - (prevItem?.amount ?? 0), source: item.source };
    });

  // 判断 primary_cause：取 diff 最大的
  const primary_cause = causes.length > 0 ? causes[0].cause : "unknown";
  // 检查是否有漫游费用
  const hasRoaming = currentItems.some((item) => item.source === "roaming_core");
  const effectiveCause = hasRoaming && (primary_cause === "data_fee" || primary_cause === "voice_fee") ? "roaming" : primary_cause;

  console.log(`[billing/anomaly] msisdn=${msisdn} month=${month} prev=${prevMonth} diff=${diff} causes_count=${causes.length} causes=${JSON.stringify(causes)}`);

  // ── 生成人类可读的结构化摘要（LLM 直接复述，避免自行拼数字）──────────
  const prevTotal = previous?.total ?? 0;
  const diffSign = diff > 0 ? "增加" : diff < 0 ? "减少" : "持平";
  const ratioPercent = previous?.total ? `${Math.abs(changeRatio * 100).toFixed(1)}%` : "无上月数据";

  // 逐项变化文本（按变化绝对值排序，取前 3 项）
  const topCauses = causes.slice(0, 3);
  const changedItemsText = topCauses.map(
    (c) => `${c.label}：¥${c.previous_amount} → ¥${c.current_amount}（${c.diff > 0 ? "+" : ""}¥${c.diff}）`
  );

  // 总结文本
  let summary: string;
  if (!previous) {
    summary = `${month} 总费用 ¥${current.total}，无上月账单可对比。`;
  } else if (diff === 0) {
    summary = `${month} 总费用 ¥${current.total}，与上月持平。`;
  } else {
    summary = `${month} 总费用 ¥${current.total}，较上月（${prevMonth}）¥${prevTotal} ${diffSign} ¥${Math.abs(diff)}（${ratioPercent}）。`;
    if (changedItemsText.length > 0) {
      summary += `主要变化：${changedItemsText.join("；")}。`;
    }
  }

  return c.json({
    success: true,
    msisdn,
    month,
    previous_month: prevMonth,
    current_total: current.total,
    previous_total: prevTotal,
    diff,
    change_ratio: changeRatio,
    primary_cause: effectiveCause,
    causes,
    item_details: itemDetails,
    summary,
    changed_items_text: changedItemsText,
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
