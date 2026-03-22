/**
 * 业务办理服务 — cancel_service, issue_invoice
 * Port: 18004
 *
 * 重构2：MCP Server = 防腐层，调用 mock_apis (demo backend)
 */
import { backendPost, mcpLog, startMcpHttpServer, z, McpServer, performance } from "../shared/server.js";

function createServer(): McpServer {
  const server = new McpServer({ name: "business-service", version: "2.0.0" });

  server.tool("cancel_service", "退订用户已订阅的增值业务（如流量包、短信包等）", {
    phone: z.string().describe("用户手机号"),
    service_id: z.string().describe("要退订的业务 ID（如 video_pkg、sms_100）"),
    operator: z.string().optional().describe("操作者标识"),
    reason: z.string().optional().describe("操作原因"),
    traceId: z.string().optional().describe("链路追踪 ID"),
    idempotencyKey: z.string().optional().describe("幂等键"),
  }, async ({ phone, service_id, operator, reason, traceId, idempotencyKey }) => {
    const t0 = performance.now();
    try {
      const res = await backendPost<{
        success: boolean; order_id?: string; phone?: string; service_id?: string;
        service_name?: string; monthly_fee?: number; status?: string;
        effective_at?: string; refund_eligible?: boolean; refund_note?: string;
        message?: string;
      }>('/api/orders/service-cancel', { phone, service_id, reason });

      mcpLog("business", "cancel_service", { phone, service_id, success: res.success, operator, reason, traceId, idempotencyKey, ms: Math.round(performance.now() - t0) });

      return { content: [{ type: "text" as const, text: JSON.stringify({
        order_id: res.order_id ?? null,
        phone: res.phone ?? phone,
        service_id: res.service_id ?? service_id,
        service_name: res.service_name ?? null,
        monthly_fee: res.monthly_fee ?? 0,
        status: res.status ?? null,
        effective_end: res.effective_at ?? null,
        refund_eligible: res.refund_eligible ?? false,
        refund_note: res.refund_note || "当月费用不退，次月起不再扣费。",
        requires_manual_review: res.requires_manual_review ?? false,
      }) }] };
    } catch (err) {
      mcpLog("business", "cancel_service", { phone, service_id, success: false, error: String(err), ms: Math.round(performance.now() - t0) });
      return { content: [{ type: "text" as const, text: JSON.stringify({ phone, service_id, service_name: null, monthly_fee: 0, effective_end: null, refund_eligible: false, refund_note: null }) }] };
    }
  });

  server.tool("issue_invoice", "为指定用户的指定月份账单开具电子发票并发送到邮箱", {
    phone: z.string().describe("用户手机号"),
    month: z.string().describe('账单月份，格式 YYYY-MM'),
    email: z.string().describe("发票接收邮箱地址"),
    operator: z.string().optional().describe("操作者标识"),
    traceId: z.string().optional().describe("链路追踪 ID"),
  }, async ({ phone, month, email, operator, traceId }) => {
    const t0 = performance.now();
    try {
      const res = await backendPost<{
        success: boolean; invoice_no?: string; total?: number; email?: string; status?: string; message?: string;
      }>('/api/invoice/issue', { phone, month, email });

      mcpLog("business", "issue_invoice", { phone, month, invoiceNo: res.invoice_no, success: res.success, operator, traceId, ms: Math.round(performance.now() - t0) });

      return { content: [{ type: "text" as const, text: JSON.stringify({
        invoice_no: res.invoice_no ?? null,
        phone,
        month,
        total: res.total ?? 0,
        email: res.email ?? null,
        status: res.status ?? null,
      }) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ invoice_no: null, phone, month, total: 0, email: null, status: null }) }] };
    }
  });

  return server;
}

startMcpHttpServer("business-service", Number(process.env.PORT ?? 18004), createServer);
