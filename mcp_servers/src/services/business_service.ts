/**
 * 业务办理服务 — cancel_service, issue_invoice
 * Port: 18004
 */
import { db, subscribers, subscriberSubscriptions, valueAddedServices, bills, mcpLog, startMcpHttpServer, eq, and, z, McpServer, performance } from "../shared/server.js";

function createServer(): McpServer {
  const server = new McpServer({ name: "business-service", version: "1.0.0" });

  server.tool("cancel_service", "退订用户已订阅的增值业务（如流量包、短信包等）", {
    phone: z.string().describe("用户手机号"),
    service_id: z.string().describe("要退订的业务 ID（如 video_pkg、sms_100）"),
  }, async ({ phone, service_id }) => {
    const t0 = performance.now();
    const sub = await db.select({ phone: subscribers.phone }).from(subscribers).where(eq(subscribers.phone, phone)).get();
    if (!sub) { mcpLog("business", "cancel_service", { phone, service_id, success: false, ms: Math.round(performance.now() - t0) }); return { content: [{ type: "text", text: JSON.stringify({ success: false, message: `未找到手机号 ${phone}` }) }] }; }
    const subscription = await db.select().from(subscriberSubscriptions).where(and(eq(subscriberSubscriptions.phone, phone), eq(subscriberSubscriptions.service_id, service_id))).get();
    if (!subscription) { mcpLog("business", "cancel_service", { phone, service_id, success: false, ms: Math.round(performance.now() - t0) }); return { content: [{ type: "text", text: JSON.stringify({ success: false, message: `用户未订阅业务 ${service_id}` }) }] }; }
    const svc = await db.select().from(valueAddedServices).where(eq(valueAddedServices.service_id, service_id)).get();
    if (!svc) { return { content: [{ type: "text", text: JSON.stringify({ success: false, message: `业务 ${service_id} 不存在` }) }] }; }
    await db.delete(subscriberSubscriptions).where(and(eq(subscriberSubscriptions.phone, phone), eq(subscriberSubscriptions.service_id, service_id))).run();
    mcpLog("business", "cancel_service", { phone, service_id, success: true, ms: Math.round(performance.now() - t0) });
    return { content: [{ type: "text", text: JSON.stringify({ success: true, phone, service_id, service_name: svc.name, monthly_fee: svc.monthly_fee, effective_end: svc.effective_end, refund_eligible: false, refund_note: "当月费用不退，次月起不再扣费。", message: `已成功退订「${svc.name}」，将于 ${svc.effective_end} 生效，本月费用正常收取` }) }] };
  });

  server.tool("issue_invoice", "为指定用户的指定月份账单开具电子发票并发送到邮箱", {
    phone: z.string().describe("用户手机号"),
    month: z.string().describe('账单月份，格式 YYYY-MM'),
    email: z.string().describe("发票接收邮箱地址"),
  }, async ({ phone, month, email }) => {
    const t0 = performance.now();
    const sub = await db.select().from(subscribers).where(eq(subscribers.phone, phone)).get();
    if (!sub) { return { content: [{ type: "text", text: JSON.stringify({ success: false, message: `未找到手机号 ${phone}` }) }] }; }
    const bill = await db.select().from(bills).where(and(eq(bills.phone, phone), eq(bills.month, month))).get();
    if (!bill) { return { content: [{ type: "text", text: JSON.stringify({ success: false, message: `未找到 ${phone} 用户 ${month} 的账单记录` }) }] }; }
    const invoiceNo = `INV-${month.replace('-', '')}-${phone.slice(-4)}-${Date.now().toString(36).toUpperCase().slice(-4)}`;
    const maskedEmail = email.replace(/^(.{2})(.*)(@.*)$/, (_, a, b, c) => a + '*'.repeat(Math.min(b.length, 4)) + c);
    mcpLog("business", "issue_invoice", { phone, month, invoiceNo, success: true, ms: Math.round(performance.now() - t0) });
    return { content: [{ type: "text", text: JSON.stringify({ success: true, invoice_no: invoiceNo, phone, month, total: bill.total, email: maskedEmail, status: "已发送", message: `${month} 账单电子发票（金额 ¥${bill.total}）已发送至 ${maskedEmail}，发票号：${invoiceNo}` }) }] };
  });

  return server;
}

startMcpHttpServer("business-service", Number(process.env.PORT ?? 18004), createServer);
