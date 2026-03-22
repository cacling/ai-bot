/**
 * 账户操作服务 — verify_identity, check_account_balance, check_contracts
 * Port: 18007
 *
 * 重构2：MCP Server = 防腐层，调用 mock_apis (demo backend)
 */
import { backendGet, backendPost, mcpLog, startMcpHttpServer, z, McpServer } from "../shared/server.js";

function createServer(): McpServer {
  const server = new McpServer({ name: "account-service", version: "2.0.0" });

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

  return server;
}

startMcpHttpServer("account-service", Number(process.env.PORT ?? 18007), createServer);
