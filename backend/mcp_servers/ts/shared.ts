/**
 * shared.ts — 共享 DB 连接与表定义
 */
import path from "node:path";
import http from "node:http";
import { performance } from "node:perf_hooks";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

const dbPath = process.env.SQLITE_PATH ?? path.resolve(import.meta.dirname, "../../data/telecom.db");
const client = createClient({ url: `file:${dbPath}` });
await client.execute("PRAGMA journal_mode = WAL");

export const plans = sqliteTable("plans", {
  plan_id: text("plan_id").primaryKey(),
  name: text("name").notNull(),
  monthly_fee: real("monthly_fee").notNull(),
  data_gb: integer("data_gb").notNull(),
  voice_min: integer("voice_min").notNull(),
  sms: integer("sms").notNull(),
  features: text("features").notNull().default("[]"),
  description: text("description").notNull(),
});

export const valueAddedServices = sqliteTable("value_added_services", {
  service_id: text("service_id").primaryKey(),
  name: text("name").notNull(),
  monthly_fee: real("monthly_fee").notNull(),
  effective_end: text("effective_end").notNull(),
});

export const subscribers = sqliteTable("subscribers", {
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

export const subscriberSubscriptions = sqliteTable("subscriber_subscriptions", {
  phone: text("phone").notNull(),
  service_id: text("service_id").notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.phone, table.service_id] }),
}));

export const bills = sqliteTable("bills", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  phone: text("phone").notNull(),
  month: text("month").notNull(),
  total: real("total").notNull(),
  plan_fee: real("plan_fee").notNull(),
  data_fee: real("data_fee").notNull(),
  voice_fee: real("voice_fee").notNull(),
  sms_fee: real("sms_fee").notNull(),
  value_added_fee: real("value_added_fee").notNull(),
  tax: real("tax").notNull(),
  status: text("status").notNull(),
});

export const deviceContexts = sqliteTable("device_contexts", {
  phone: text("phone").primaryKey(),
  installed_app_version: text("installed_app_version").notNull(),
  latest_app_version: text("latest_app_version").notNull(),
  device_os: text("device_os").notNull(),
  os_version: text("os_version").notNull(),
  device_rooted: integer("device_rooted", { mode: "boolean" }).notNull(),
  developer_mode_on: integer("developer_mode_on", { mode: "boolean" }).notNull(),
  running_on_emulator: integer("running_on_emulator", { mode: "boolean" }).notNull(),
  has_vpn_active: integer("has_vpn_active", { mode: "boolean" }).notNull(),
  has_fake_gps: integer("has_fake_gps", { mode: "boolean" }).notNull(),
  has_remote_access_app: integer("has_remote_access_app", { mode: "boolean" }).notNull(),
  has_screen_share_active: integer("has_screen_share_active", { mode: "boolean" }).notNull(),
  flagged_apps: text("flagged_apps").notNull(),
  login_location_changed: integer("login_location_changed", { mode: "boolean" }).notNull(),
  new_device: integer("new_device", { mode: "boolean" }).notNull(),
  otp_delivery_issue: integer("otp_delivery_issue", { mode: "boolean" }).notNull(),
});

export const callbackTasks = sqliteTable("callback_tasks", {
  task_id: text("task_id").primaryKey(),
  original_task_id: text("original_task_id").notNull(),
  customer_name: text("customer_name").notNull(),
  callback_phone: text("callback_phone").notNull(),
  preferred_time: text("preferred_time").notNull(),
  product_name: text("product_name").notNull(),
  created_at: text("created_at"),
  status: text("status").notNull().default("pending"),
});

export const db = drizzle(client, { schema: { plans, valueAddedServices, subscribers, subscriberSubscriptions, bills, deviceContexts, callbackTasks } });

export function mcpLog(mod: string, tool: string, extra: Record<string, unknown>): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), mod, tool, ...extra }));
}

export function monthLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split("-");
  return `${y}年${parseInt(m, 10)}月`;
}

/** Start an MCP HTTP server */
export function startMcpHttpServer(name: string, port: number, createServer: () => McpServer) {
  const httpServer = http.createServer(async (req, res) => {
    if (req.url !== "/mcp") { res.writeHead(404).end("Not found"); return; }
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const mcpServer = createServer();
    res.on("close", () => { mcpServer.close().catch(() => {}); });
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res);
  });
  httpServer.listen(port, "0.0.0.0", () => {
    console.log(`[${name}] MCP endpoint: http://0.0.0.0:${port}/mcp`);
  });
}

export { eq, and } from "drizzle-orm";
export { z } from "zod";
export { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
export { performance } from "node:perf_hooks";
