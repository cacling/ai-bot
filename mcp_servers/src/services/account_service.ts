/**
 * 账户操作服务 — verify_identity, check_account_balance, check_contracts
 * Port: 18007
 */
import { db, subscribers, contracts, mcpLog, startMcpHttpServer, eq, z, McpServer } from "../shared/server.js";

function createServer(): McpServer {
  const server = new McpServer({ name: "account-service", version: "1.0.0" });

  server.tool("verify_identity", "验证用户身份（通过短信验证码）。高风险操作前必须先验证。", {
    phone: z.string().describe("用户手机号"),
    otp: z.string().describe("用户输入的验证码"),
  }, async ({ phone, otp }) => {
    mcpLog("account", "verify_identity", { phone, otp: "***" });
    const sub = await db.select().from(subscribers).where(eq(subscribers.phone, phone)).get();
    if (!sub) return { content: [{ type: "text", text: JSON.stringify({ verified: false, customer_name: null, verification_method: "otp" }) }] };
    const valid = otp === "1234" || otp === "0000" || otp.length === 6;
    return { content: [{ type: "text", text: JSON.stringify({ verified: valid, customer_name: valid ? sub.name : null, verification_method: "otp" }) }] };
  });

  server.tool("check_account_balance", "查询用户账户余额和欠费状态", {
    phone: z.string().describe("用户手机号"),
  }, async ({ phone }) => {
    mcpLog("account", "check_account_balance", { phone });
    const sub = await db.select().from(subscribers).where(eq(subscribers.phone, phone)).get();
    if (!sub) return { content: [{ type: "text", text: JSON.stringify({ phone, balance: 0, has_arrears: false, arrears_amount: 0, status: null }) }] };
    const hasArrears = sub.balance < 0;
    return { content: [{ type: "text", text: JSON.stringify({ phone, balance: sub.balance, has_arrears: hasArrears, arrears_amount: hasArrears ? Math.abs(sub.balance) : 0, status: sub.status }) }] };
  });

  server.tool("check_contracts", "查询用户当前有效合约列表", {
    phone: z.string().describe("用户手机号"),
  }, async ({ phone }) => {
    mcpLog("account", "check_contracts", { phone });
    const rows = await db.select().from(contracts).where(eq(contracts.phone, phone)).all();
    const activeContracts = rows.filter(c => c.status === "active");
    const hasHighRisk = activeContracts.some(c => c.risk_level === "high");
    return { content: [{ type: "text", text: JSON.stringify({ phone, contracts: activeContracts, has_active_contracts: activeContracts.length > 0, has_high_risk: hasHighRisk }) }] };
  });

  return server;
}

startMcpHttpServer("account-service", Number(process.env.PORT ?? 18007), createServer);
