/**
 * payments.ts — 模拟支付 / 交易系统
 */
import { Hono } from "hono";
import { db, subscribers, paymentsTransactions, eq } from "../db.js";

const app = new Hono();

app.get("/transactions", async (c) => {
  const msisdn = c.req.query("msisdn");
  if (!msisdn) return c.json({ success: false, message: "msisdn 不能为空" }, 400);

  const sub = await db.select().from(subscribers).where(eq(subscribers.phone, msisdn)).get();
  if (!sub) return c.json({ success: false, message: `未找到手机号 ${msisdn}` }, 404);

  const transactions = await db.select().from(paymentsTransactions).where(eq(paymentsTransactions.phone, msisdn)).all();

  return c.json({
    success: true,
    msisdn,
    count: transactions.length,
    transactions,
  });
});

app.get("/transactions/:paymentId", async (c) => {
  const payment = await db.select().from(paymentsTransactions).where(eq(paymentsTransactions.payment_id, c.req.param("paymentId"))).get();
  if (!payment) return c.json({ success: false, message: `未找到交易 ${c.req.param("paymentId")}` }, 404);

  return c.json({
    success: true,
    transaction: payment,
  });
});

app.post("/payment-link", async (c) => {
  const { msisdn, amount } = await c.req.json<{ msisdn?: string; amount?: number }>();
  if (!msisdn) return c.json({ success: false, message: "msisdn 不能为空" }, 400);

  const sub = await db.select().from(subscribers).where(eq(subscribers.phone, msisdn)).get();
  if (!sub) return c.json({ success: false, message: `未找到手机号 ${msisdn}` }, 404);

  const amountDue = amount ?? (sub.balance < 0 ? Math.abs(sub.balance) : 0);
  return c.json({
    success: amountDue > 0,
    msisdn,
    amount_due: amountDue,
    payment_link: amountDue > 0 ? `https://mock-pay.local/pay/${msisdn}/${amountDue.toFixed(2)}` : null,
    expires_at: amountDue > 0 ? "2026-03-23T23:59:59+08:00" : null,
    message: amountDue > 0 ? "支付链接已生成" : "当前号码无待支付金额",
  });
});

export default app;
