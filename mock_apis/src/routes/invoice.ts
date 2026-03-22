/**
 * POST /api/invoice/issue — 开具电子发票
 *
 * 模拟开票系统：校验账单存在 + 生成发票号 + 脱敏邮箱。
 */
import { Hono } from "hono";
import { db, subscribers, bills, invoiceRecords, eq, and } from "../db.js";

const app = new Hono();

app.post("/issue", async (c) => {
  const { phone, month, email } = await c.req.json<{ phone?: string; month?: string; email?: string }>();
  if (!phone || !month || !email) return c.json({ success: false, message: "phone、month、email 不能为空" }, 400);

  const sub = await db.select().from(subscribers).where(eq(subscribers.phone, phone)).get();
  if (!sub) return c.json({ success: false, message: `未找到手机号 ${phone}` }, 404);

  const bill = await db.select().from(bills).where(and(eq(bills.phone, phone), eq(bills.month, month))).get();
  if (!bill) return c.json({ success: false, message: `未找到 ${phone} 用户 ${month} 的账单记录` }, 404);

  const invoiceNo = `INV-${month.replace("-", "")}-${phone.slice(-4)}-${Date.now().toString(36).toUpperCase().slice(-4)}`;
  const maskedEmail = email.replace(/^(.{2})(.*)(@.*)$/, (_, a, b, d) => a + "*".repeat(Math.min(b.length, 4)) + d);

  await db.insert(invoiceRecords).values({
    invoice_no: invoiceNo,
    phone,
    month,
    total: bill.total,
    email,
    status: "issued",
    requested_at: new Date().toISOString(),
  }).run();

  return c.json({
    success: true,
    invoice_no: invoiceNo,
    phone,
    month,
    total: bill.total,
    email: maskedEmail,
    status: "已发送",
    message: `${month} 账单电子发票（金额 ¥${bill.total}）已发送至 ${maskedEmail}，发票号：${invoiceNo}`,
  });
});

export default app;
