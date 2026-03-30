/**
 * 账户操作服务 — verify_identity, check_account_balance, check_contracts
 * Port: 18007
 *
 * 重构2：MCP Server = 防腐层，调用 mock_apis (demo backend)
 */
import { backendGet, backendPost, mcpLog, startMcpHttpServer, z, McpServer } from "../shared/server.js";

export function registerAccountTools(server: McpServer): void {
  server.tool("verify_identity", "验证用户身份（通过短信验证码）。高风险操作前必须先验证。", {
    phone: z.string().describe("用户手机号"),
    otp: z.string().describe("用户输入的验证码"),
  }, async ({ phone, otp }) => {
    mcpLog("account", "verify_identity", { phone, otp: "***" });
    try {
      const res = await backendPost<{ success: boolean; verified?: boolean; customer_name?: string; message?: string }>(
        '/api/identity/verify', { phone, otp }
      );
      return { content: [{ type: "text" as const, text: JSON.stringify({
        verified: res.verified ?? false,
        customer_name: res.customer_name ?? null,
        verification_method: "otp",
      }) }] };
    } catch {
      return { content: [{ type: "text" as const, text: JSON.stringify({ verified: false, customer_name: null, verification_method: "otp" }) }] };
    }
  });

  server.tool("check_account_balance", "查询用户账户余额和欠费状态", {
    phone: z.string().describe("用户手机号"),
  }, async ({ phone }) => {
    mcpLog("account", "check_account_balance", { phone });
    try {
      const res = await backendGet<{
        success: boolean; balance?: number; status?: string;
        has_arrears?: boolean; arrears_amount?: number; overdue_days?: number;
      }>(`/api/customer/subscribers/${phone}/account-summary`);

      if (!res.success) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ phone, balance: 0, has_arrears: false, arrears_amount: 0, status: null }) }] };
      }
      return { content: [{ type: "text" as const, text: JSON.stringify({
        phone,
        balance: res.balance ?? 0,
        has_arrears: res.has_arrears ?? false,
        arrears_amount: res.arrears_amount ?? 0,
        status: res.status ?? null,
      }) }] };
    } catch {
      return { content: [{ type: "text" as const, text: JSON.stringify({ phone, balance: 0, has_arrears: false, arrears_amount: 0, status: null }) }] };
    }
  });

  server.tool("check_contracts", "查询用户当前有效合约列表", {
    phone: z.string().describe("用户手机号"),
  }, async ({ phone }) => {
    mcpLog("account", "check_contracts", { phone });
    try {
      const res = await backendGet<{ success: boolean; contracts?: any[] }>(`/api/customer/subscribers/${phone}/contracts`);
      const allContracts = res.contracts ?? [];
      const activeContracts = allContracts.filter((c: any) => c.status === "active");
      const hasHighRisk = activeContracts.some((c: any) => c.risk_level === "high");
      return { content: [{ type: "text" as const, text: JSON.stringify({ phone, contracts: activeContracts, has_active_contracts: activeContracts.length > 0, has_high_risk: hasHighRisk }) }] };
    } catch {
      return { content: [{ type: "text" as const, text: JSON.stringify({ phone, contracts: [], has_active_contracts: false, has_high_risk: false }) }] };
    }
  });

  server.tool("apply_service_suspension", "执行停机保号操作，暂停语音/短信/流量服务，保留号码", {
    phone: z.string().describe("用户手机号"),
  }, async ({ phone }) => {
    mcpLog("account", "apply_service_suspension", { phone });
    // 检查用户是否存在
    try {
      const sub = await backendGet<{ success: boolean; name?: string }>(`/api/customer/subscribers/${phone}`);
      if (!sub.success) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ success: false, message: `未找到手机号 ${phone}` }) }] };
      }
      // 模拟停机保号操作
      const resumeDeadline = new Date();
      resumeDeadline.setMonth(resumeDeadline.getMonth() + 3);
      return { content: [{ type: "text" as const, text: JSON.stringify({
        success: true,
        phone,
        suspension_type: "temporary",
        effective_date: new Date().toISOString().split('T')[0],
        resume_deadline: resumeDeadline.toISOString().split('T')[0],
        monthly_fee: 5.00,
        message: `停机保号已生效，号码 ${phone} 的语音/短信/流量服务已暂停，每月保号费 ¥5.00，请在 ${resumeDeadline.toISOString().split('T')[0]} 前办理复机`,
      }) }] };
    } catch {
      return { content: [{ type: "text" as const, text: JSON.stringify({ success: false, message: "停机保号操作失败，请稍后重试" }) }] };
    }
  });

}

function createServer(): McpServer {
  const server = new McpServer({ name: "account-service", version: "2.0.0" });
  registerAccountTools(server);
  return server;
}

if (import.meta.main) startMcpHttpServer("account-service", Number(process.env.PORT ?? 18007), createServer);
