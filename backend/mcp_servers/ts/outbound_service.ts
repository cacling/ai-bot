/**
 * Outbound Service MCP Server
 *
 * 提供外呼场景的工具：记录通话结果、发送跟进短信、创建回访任务。
 * test 模式返回 mock 数据，prod 模式对接真实系统（通过环境变量配置）。
 *
 * Run: node --import tsx/esm outbound_service.ts
 *      → MCP endpoint: http://localhost:8004/mcp
 */

import http from "node:http";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { z } from "zod";

// ── 数据库（写入回访任务等） ─────────────────────────────────────────────────
const dbPath =
  process.env.SQLITE_PATH ??
  path.resolve(import.meta.dirname, "../../data/telecom.db");

const client = createClient({ url: `file:${dbPath}` });
await client.execute("PRAGMA journal_mode = WAL");

const callbackTasks = sqliteTable("callback_tasks", {
  task_id:          text("task_id").primaryKey(),
  original_task_id: text("original_task_id").notNull(),
  customer_name:    text("customer_name").notNull(),
  callback_phone:   text("callback_phone").notNull(),
  preferred_time:   text("preferred_time").notNull(),
  product_name:     text("product_name").notNull(),
  created_at:       text("created_at"),
  status:           text("status").notNull().default("pending"),
});

const db = drizzle(client, { schema: { callbackTasks } });

// ── 日志 ───────────────────────────────────────────────────────────────────────
function mcpLog(tool: string, extra: Record<string, unknown>): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), mod: "outbound", tool, ...extra }));
}

// ── MCP Server ─────────────────────────────────────────────────────────────────
function createMcpServer(): McpServer {
  const server = new McpServer({ name: "outbound-service", version: "1.0.0" });

  // 1. 记录通话结果
  server.tool(
    "record_call_result",
    "记录本次外呼通话结果。通话结束前必须调用。",
    {
      result: z.enum([
        "ptp", "refusal", "dispute", "no_answer", "busy",
        "converted", "callback", "not_interested", "non_owner", "verify_failed",
      ]).describe("通话结果"),
      remark: z.string().optional().describe("备注信息"),
      callback_time: z.string().optional().describe("约定回访时间，result=callback 时填写"),
      ptp_date: z.string().optional().describe("承诺还款日期，result=ptp 时填写"),
    },
    async ({ result, remark, callback_time, ptp_date }) => {
      mcpLog("record_call_result", { result, remark, callback_time, ptp_date });
      const extra = ptp_date
        ? `，承诺还款日期：${ptp_date}`
        : callback_time
          ? `，约定回访时间：${callback_time}`
          : "";
      const remarkStr = remark ? `，备注：${remark}` : "";
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            message: `通话结果已记录：${result}${extra}${remarkStr}`,
          }),
        }],
      };
    },
  );

  // 2. 发送跟进短信
  server.tool(
    "send_followup_sms",
    "向客户发送跟进短信（还款链接、套餐详情、回访提醒等）",
    {
      phone: z.string().describe("客户手机号"),
      sms_type: z.enum(["payment_link", "plan_detail", "callback_reminder", "product_detail"])
        .describe("短信类型"),
    },
    async ({ phone, sms_type }) => {
      mcpLog("send_followup_sms", { phone, sms_type });
      const labels: Record<string, string> = {
        payment_link: "还款链接",
        plan_detail: "套餐详情",
        callback_reminder: "回访提醒",
        product_detail: "产品详情",
      };
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            message: `${labels[sms_type] ?? sms_type}短信已发送至 ${phone}`,
          }),
        }],
      };
    },
  );

  // 3. 创建回访任务
  server.tool(
    "create_callback_task",
    "创建回访任务。客户感兴趣但当前不方便时，约定下次回访时间。",
    {
      original_task_id: z.string().describe("原始外呼任务 ID"),
      callback_phone: z.string().describe("回访电话号码"),
      preferred_time: z.string().describe("客户期望的回访时间"),
      customer_name: z.string().optional().describe("客户姓名"),
      product_name: z.string().optional().describe("关联产品名称"),
    },
    async ({ original_task_id, callback_phone, preferred_time, customer_name, product_name }) => {
      const taskId = `CB-${Date.now().toString(36)}`;
      mcpLog("create_callback_task", { taskId, original_task_id, callback_phone, preferred_time });

      await db.insert(callbackTasks).values({
        task_id: taskId,
        original_task_id,
        customer_name: customer_name ?? "",
        callback_phone,
        preferred_time,
        product_name: product_name ?? "",
        created_at: new Date().toISOString(),
        status: "pending",
      });

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            callback_task_id: taskId,
            message: `回访任务已创建，将于 ${preferred_time} 回访 ${callback_phone}`,
          }),
        }],
      };
    },
  );

  // 4. 记录营销结果
  server.tool(
    "record_marketing_result",
    "记录营销外呼的通话结果。通话结束前必须调用。",
    {
      campaign_id: z.string().describe("营销活动 ID"),
      phone: z.string().describe("客户手机号"),
      result: z.enum([
        "converted", "callback", "not_interested", "no_answer",
        "busy", "wrong_number", "dnd",
      ]).describe("营销结果"),
      callback_time: z.string().optional().describe("约定回访时间"),
    },
    async ({ campaign_id, phone, result, callback_time }) => {
      mcpLog("record_marketing_result", { campaign_id, phone, result, callback_time });
      const extra = callback_time ? `，约定回访时间：${callback_time}` : "";
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            message: `营销结果已记录：${result}${extra}`,
          }),
        }],
      };
    },
  );

  return server;
}

// ── HTTP Server ──────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT ?? 8004);

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
  console.log(`[outbound-service] MCP endpoint: http://0.0.0.0:${PORT}/mcp`);
  console.log(`[outbound-service] DB: ${dbPath}`);
});
