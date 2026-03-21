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
    if (!sub) return { content: [{ type: "text", text: JSON.stringify({ success: false, message: `未找到手机号 ${phone}` }) }] };
    const valid = otp === "1234" || otp === "0000" || otp.length === 6;
    return { content: [{ type: "text", text: JSON.stringify({ success: valid, verified: valid, customer_name: sub.name, message: valid ? `身份验证通过，用户：${sub.name}` : "验证码错误，请重新输入" }) }] };
  });

  server.tool("check_account_balance", "查询用户账户余额和欠费状态", {
    phone: z.string().describe("用户手机号"),
  }, async ({ phone }) => {
    mcpLog("account", "check_account_balance", { phone });
    const sub = await db.select().from(subscribers).where(eq(subscribers.phone, phone)).get();
    if (!sub) return { content: [{ type: "text", text: JSON.stringify({ success: false, message: `未找到手机号 ${phone}` }) }] };
    const hasArrears = sub.balance < 0;
    return { content: [{ type: "text", text: JSON.stringify({ success: true, phone, balance: sub.balance, has_arrears: hasArrears, arrears_amount: hasArrears ? Math.abs(sub.balance) : 0, status: sub.status, message: hasArrears ? `账户存在欠费 ¥${Math.abs(sub.balance).toFixed(2)}` : `账户余额 ¥${sub.balance.toFixed(2)}，无欠费` }) }] };
  });

  server.tool("check_contracts", "查询用户当前有效合约列表", {
    phone: z.string().describe("用户手机号"),
  }, async ({ phone }) => {
    mcpLog("account", "check_contracts", { phone });
    const rows = await db.select().from(contracts).where(eq(contracts.phone, phone)).all();
    const activeContracts = rows.filter(c => c.status === "active");
    const hasHighRisk = activeContracts.some(c => c.risk_level === "high");
    return { content: [{ type: "text", text: JSON.stringify({ success: true, phone, contracts: activeContracts, has_active_contracts: activeContracts.length > 0, has_high_risk: hasHighRisk, message: hasHighRisk ? `存在高风险合约，停机需支付违约金` : activeContracts.length > 0 ? `存在 ${activeContracts.length} 个合约，不影响停机` : "无有效合约，可直接办理停机" }) }] };
  });

  return server;
}

startMcpHttpServer("account-service", Number(process.env.PORT ?? 18007), createServer);
