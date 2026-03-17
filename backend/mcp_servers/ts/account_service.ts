/**
 * Account Service MCP Server
 *
 * 提供账户操作工具：身份验证、余额查询、合约查询、停机申请。
 * 对应 service-suspension 技能引用的 4 个工具。
 * test 模式返回 mock 数据，prod 模式对接真实系统。
 *
 * Run: node --import tsx/esm account_service.ts
 *      → MCP endpoint: http://localhost:8005/mcp
 */

import http from "node:http";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { z } from "zod";

// ── 数据库连接 ─────────────────────────────────────────────────────────────────
const dbPath =
  process.env.SQLITE_PATH ??
  path.resolve(import.meta.dirname, "../../data/telecom.db");

const client = createClient({ url: `file:${dbPath}` });
await client.execute("PRAGMA journal_mode = WAL");

const subscribers = sqliteTable("subscribers", {
  phone: text("phone").primaryKey(),
  name: text("name").notNull(),
  id_type: text("id_type").notNull(),
  plan_id: text("plan_id").notNull(),
  status: text("status").notNull(),
  balance: real("balance").notNull(),
  data_used_gb: real("data_used_gb").notNull(),
  voice_used_min: integer("voice_used_min").notNull(),
  activated_at: text("activated_at").notNull(),
});

const db = drizzle(client, { schema: { subscribers } });

// ── 日志 ───────────────────────────────────────────────────────────────────────
function mcpLog(tool: string, extra: Record<string, unknown>): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), mod: "account", tool, ...extra }));
}

// ── Mock 合约数据 ──────────────────────────────────────────────────────────────
const MOCK_CONTRACTS: Record<string, Array<{ contract_id: string; name: string; end_date: string; penalty: number; risk_level: string }>> = {
  "13800000001": [
    { contract_id: "CT001", name: "24个月合约套餐", end_date: "2027-06-30", penalty: 200, risk_level: "high" },
  ],
  "13800000002": [],
};

// ── MCP Server ─────────────────────────────────────────────────────────────────
function createMcpServer(): McpServer {
  const server = new McpServer({ name: "account-service", version: "1.0.0" });

  // 1. 身份验证
  server.tool(
    "verify_identity",
    "验证用户身份（通过短信验证码或其他方式）。停机等高风险操作前必须先验证身份。",
    {
      phone: z.string().describe("用户手机号"),
      otp: z.string().describe("用户输入的验证码"),
    },
    async ({ phone, otp }) => {
      mcpLog("verify_identity", { phone, otp: "***" });

      const sub = await db.select().from(subscribers).where(eq(subscribers.phone, phone)).get();
      if (!sub) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, message: `未找到手机号 ${phone}` }) }] };
      }

      // Mock: 验证码 "1234" 或 "0000" 视为通过
      const valid = otp === "1234" || otp === "0000" || otp.length === 6;
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: valid,
            verified: valid,
            customer_name: sub.name,
            message: valid ? `身份验证通过，用户：${sub.name}` : "验证码错误，请重新输入",
          }),
        }],
      };
    },
  );

  // 2. 查询账户余额
  server.tool(
    "check_account_balance",
    "查询用户账户余额和欠费状态",
    {
      phone: z.string().describe("用户手机号"),
    },
    async ({ phone }) => {
      mcpLog("check_account_balance", { phone });

      const sub = await db.select().from(subscribers).where(eq(subscribers.phone, phone)).get();
      if (!sub) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, message: `未找到手机号 ${phone}` }) }] };
      }

      const hasArrears = sub.balance < 0;
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            phone,
            balance: sub.balance,
            has_arrears: hasArrears,
            arrears_amount: hasArrears ? Math.abs(sub.balance) : 0,
            status: sub.status,
            message: hasArrears
              ? `账户存在欠费 ¥${Math.abs(sub.balance).toFixed(2)}，需先缴清欠费才能办理停机`
              : `账户余额 ¥${sub.balance.toFixed(2)}，无欠费`,
          }),
        }],
      };
    },
  );

  // 3. 查询合约
  server.tool(
    "check_contracts",
    "查询用户当前有效合约列表，判断是否有高风险合约阻止停机",
    {
      phone: z.string().describe("用户手机号"),
    },
    async ({ phone }) => {
      mcpLog("check_contracts", { phone });

      const contracts = MOCK_CONTRACTS[phone] ?? [];
      const hasHighRisk = contracts.some(c => c.risk_level === "high");

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            phone,
            contracts,
            has_active_contracts: contracts.length > 0,
            has_high_risk: hasHighRisk,
            message: hasHighRisk
              ? `用户存在 ${contracts.length} 个有效合约，其中包含高风险合约，停机需支付违约金`
              : contracts.length > 0
                ? `用户存在 ${contracts.length} 个有效合约，但不影响停机操作`
                : "用户无有效合约，可直接办理停机",
          }),
        }],
      };
    },
  );

  // 4. 申请停机
  server.tool(
    "apply_service_suspension",
    "执行停机操作。需在身份验证、余额检查、合约检查全部通过后调用。",
    {
      phone: z.string().describe("用户手机号"),
      suspension_type: z.enum(["temporary", "permanent"]).optional()
        .describe("停机类型：temporary=临时停机（可复机），permanent=永久停机"),
    },
    async ({ phone, suspension_type = "temporary" }) => {
      mcpLog("apply_service_suspension", { phone, suspension_type });

      const sub = await db.select().from(subscribers).where(eq(subscribers.phone, phone)).get();
      if (!sub) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, message: `未找到手机号 ${phone}` }) }] };
      }

      if (sub.status === "suspended") {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ success: false, message: "该号码已处于停机状态" }),
          }],
        };
      }

      // Mock: 标记为停机（实际不修改 DB，仅返回成功）
      const suspendDate = new Date().toISOString().slice(0, 10);
      const resumeDeadline = suspension_type === "temporary"
        ? new Date(Date.now() + 90 * 86400_000).toISOString().slice(0, 10)
        : null;

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            phone,
            suspension_type,
            effective_date: suspendDate,
            resume_deadline: resumeDeadline,
            message: suspension_type === "temporary"
              ? `临时停机已生效，请在 ${resumeDeadline} 前办理复机，逾期将自动销号`
              : "永久停机已生效，号码将在 90 天后释放",
          }),
        }],
      };
    },
  );

  return server;
}

// ── HTTP Server ──────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT ?? 8005);

const httpServer = http.createServer(async (req, res) => {
  if (req.url !== "/mcp") {
    res.writeHead(404).end("Not found");
    return;
  }
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const mcpServer = createMcpServer();
  res.on("close", () => { mcpServer.close().catch(() => {}); });
  await mcpServer.connect(transport);
  await transport.handleRequest(req, res);
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`[account-service] MCP endpoint: http://0.0.0.0:${PORT}/mcp`);
  console.log(`[account-service] DB: ${dbPath}`);
});
