/**
 * Telecom Service MCP Server (TypeScript)
 *
 * 提供电信用户信息查询、账单查询、套餐查询、退订业务、网络故障诊断能力。
 * 数据存储于 SQLite，通过 Drizzle ORM + better-sqlite3 查询。
 *
 * Run: node --import tsx/esm telecom_service.ts
 *      → MCP endpoint: http://localhost:8003/mcp
 */

import http from "node:http";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { and, eq } from "drizzle-orm";
import { integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { z } from "zod";
import { runDiagnosis } from "../../skills/fault-diagnosis/scripts/run_diagnosis.ts";
import type { IssueType } from "../../skills/fault-diagnosis/scripts/types.ts";
import { runSecurityDiagnosis } from "../../skills/telecom-app/scripts/run_security_diagnosis.ts";
import type { SecurityIssueType, AppUserContext } from "../../skills/telecom-app/scripts/types.ts";

// ── 数据库连接 ─────────────────────────────────────────────────────────────────
// SQLITE_PATH 可由环境变量覆盖，默认指向 backend/data/telecom.db
const dbPath =
  process.env.SQLITE_PATH ??
  path.resolve(import.meta.dirname, "../../data/telecom.db");

const client = createClient({ url: `file:${dbPath}` });
await client.execute("PRAGMA journal_mode = WAL");

// ── 内联表定义（避免跨进程 import 路径问题）────────────────────────────────────
const plans = sqliteTable("plans", {
  plan_id: text("plan_id").primaryKey(),
  name: text("name").notNull(),
  monthly_fee: real("monthly_fee").notNull(),
  data_gb: integer("data_gb").notNull(),
  voice_min: integer("voice_min").notNull(),
  sms: integer("sms").notNull(),
  features: text("features").notNull().default("[]"),
  description: text("description").notNull(),
});

const valueAddedServices = sqliteTable("value_added_services", {
  service_id: text("service_id").primaryKey(),
  name: text("name").notNull(),
  monthly_fee: real("monthly_fee").notNull(),
  effective_end: text("effective_end").notNull(),
});

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

const subscriberSubscriptions = sqliteTable("subscriber_subscriptions", {
  phone: text("phone").notNull(),
  service_id: text("service_id").notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.phone, table.service_id] }),
}));

const bills = sqliteTable("bills", {
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

const db = drizzle(client, { schema: { plans, valueAddedServices, subscribers, subscriberSubscriptions, bills } });

// ── 日志 ───────────────────────────────────────────────────────────────────────
function mcpLog(tool: string, extra: Record<string, unknown>): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), mod: "telecom", tool, ...extra }));
}

// ── 工具注册工厂 ───────────────────────────────────────────────────────────────
function createMcpServer(): McpServer {
  const server = new McpServer({ name: "telecom-service", version: "2.0.0" });

  // 1. 查询用户信息
  server.tool(
    "query_subscriber",
    "根据手机号查询电信用户信息（套餐、状态、余额、流量使用情况）",
    {
      phone: z.string().describe('用户手机号，如 "13800000001"'),
    },
    async ({ phone }) => {
      const t0 = performance.now();
      const sub = await db.select().from(subscribers).where(eq(subscribers.phone, phone)).get();
      if (!sub) {
        mcpLog("query_subscriber", { phone, found: false, ms: Math.round(performance.now() - t0) });
        return {
          content: [{ type: "text", text: JSON.stringify({ found: false, message: `未找到手机号 ${phone} 的用户信息` }) }],
        };
      }

      // 查询套餐详情（获取总量上限）
      const plan = await db.select().from(plans).where(eq(plans.plan_id, sub.plan_id)).get();

      // 查询已订增值业务 ID 列表
      const subs = await db
        .select({ service_id: subscriberSubscriptions.service_id })
        .from(subscriberSubscriptions)
        .where(eq(subscriberSubscriptions.phone, phone))
        .all();

      mcpLog("query_subscriber", { phone, found: true, ms: Math.round(performance.now() - t0) });
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            found: true,
            subscriber: {
              ...sub,
              plan: plan?.name ?? sub.plan_id,
              data_total_gb: plan?.data_gb ?? -1,
              voice_total_min: plan?.voice_min ?? -1,
              subscriptions: subs.map((s) => s.service_id),
            },
          }),
        }],
      };
    }
  );

  // 2. 查询账单
  server.tool(
    "query_bill",
    "查询用户指定月份的账单明细（月费、流量费、通话费、增值业务费、税费）",
    {
      phone: z.string().describe("用户手机号"),
      month: z.string().optional().describe('账单月份，格式 "YYYY-MM"，不填则返回最近3个月'),
    },
    async ({ phone, month }) => {
      const t0 = performance.now();

      const sub = await db.select({ phone: subscribers.phone }).from(subscribers).where(eq(subscribers.phone, phone)).get();
      if (!sub) {
        mcpLog("query_bill", { phone, month: month ?? null, found: false, ms: Math.round(performance.now() - t0) });
        return {
          content: [{ type: "text", text: JSON.stringify({ found: false, message: `未找到手机号 ${phone} 的账单记录` }) }],
        };
      }

      if (month) {
        const bill = await db
          .select()
          .from(bills)
          .where(and(eq(bills.phone, phone), eq(bills.month, month)))
          .get();
        if (!bill) {
          mcpLog("query_bill", { phone, month, found: false, ms: Math.round(performance.now() - t0) });
          return {
            content: [{ type: "text", text: JSON.stringify({ found: false, message: `未找到 ${month} 的账单` }) }],
          };
        }
        mcpLog("query_bill", { phone, month, found: true, ms: Math.round(performance.now() - t0) });
        return { content: [{ type: "text", text: JSON.stringify({ found: true, bill }) }] };
      }

      // 返回最近3条账单（real 类型直接返回 number，无需转换）
      const recentBills = await db
        .select()
        .from(bills)
        .where(eq(bills.phone, phone))
        .orderBy(bills.month)
        .limit(3)
        .all();
      mcpLog("query_bill", { phone, month: null, found: true, count: recentBills.length, ms: Math.round(performance.now() - t0) });
      return { content: [{ type: "text", text: JSON.stringify({ found: true, bills: recentBills }) }] };
    }
  );

  // 3. 查询套餐
  server.tool(
    "query_plans",
    "获取所有可用套餐列表，或查询指定套餐详情",
    {
      plan_id: z.string().optional().describe("套餐 ID，不填则返回全部套餐"),
    },
    async ({ plan_id }) => {
      const t0 = performance.now();

      const parsePlan = (p: typeof plans.$inferSelect) => ({
        ...p,
        features: JSON.parse(p.features) as string[],
      });

      if (plan_id) {
        const plan = await db.select().from(plans).where(eq(plans.plan_id, plan_id)).get();
        if (!plan) {
          mcpLog("query_plans", { plan_id, found: false, ms: Math.round(performance.now() - t0) });
          return { content: [{ type: "text", text: JSON.stringify({ found: false, message: `套餐 ${plan_id} 不存在` }) }] };
        }
        mcpLog("query_plans", { plan_id, found: true, ms: Math.round(performance.now() - t0) });
        return { content: [{ type: "text", text: JSON.stringify({ found: true, plan: parsePlan(plan) }) }] };
      }

      const allPlans = await db.select().from(plans).all();
      mcpLog("query_plans", { plan_id: null, found: true, count: allPlans.length, ms: Math.round(performance.now() - t0) });
      return { content: [{ type: "text", text: JSON.stringify({ found: true, plans: allPlans.map(parsePlan) }) }] };
    }
  );

  // 4. 退订增值业务
  server.tool(
    "cancel_service",
    "退订用户已订阅的增值业务（如流量包、短信包等）",
    {
      phone: z.string().describe("用户手机号"),
      service_id: z.string().describe("要退订的业务 ID（如 video_pkg、sms_100）"),
    },
    async ({ phone, service_id }) => {
      const t0 = performance.now();

      const sub = await db.select({ phone: subscribers.phone }).from(subscribers).where(eq(subscribers.phone, phone)).get();
      if (!sub) {
        mcpLog("cancel_service", { phone, service_id, success: false, reason: "no_subscriber", ms: Math.round(performance.now() - t0) });
        return {
          content: [{ type: "text", text: JSON.stringify({ success: false, message: `未找到手机号 ${phone}` }) }],
        };
      }

      const subscription = await db
        .select()
        .from(subscriberSubscriptions)
        .where(and(eq(subscriberSubscriptions.phone, phone), eq(subscriberSubscriptions.service_id, service_id)))
        .get();
      if (!subscription) {
        mcpLog("cancel_service", { phone, service_id, success: false, reason: "not_subscribed", ms: Math.round(performance.now() - t0) });
        return {
          content: [{ type: "text", text: JSON.stringify({ success: false, message: `用户未订阅业务 ${service_id}` }) }],
        };
      }

      const svc = await db.select().from(valueAddedServices).where(eq(valueAddedServices.service_id, service_id)).get();
      if (!svc) {
        mcpLog("cancel_service", { phone, service_id, success: false, reason: "no_service", ms: Math.round(performance.now() - t0) });
        return {
          content: [{ type: "text", text: JSON.stringify({ success: false, message: `业务 ${service_id} 不存在` }) }],
        };
      }

      // 执行退订（删除订阅关系，持久化到 DB）
      await db.delete(subscriberSubscriptions)
        .where(and(eq(subscriberSubscriptions.phone, phone), eq(subscriberSubscriptions.service_id, service_id)))
        .run();

      mcpLog("cancel_service", { phone, service_id, success: true, ms: Math.round(performance.now() - t0) });
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            phone,
            service_id,
            service_name: svc.name,
            monthly_fee: svc.monthly_fee,
            effective_end: svc.effective_end,
            message: `已成功退订「${svc.name}」，将于 ${svc.effective_end} 生效，本月费用正常收取`,
          }),
        }],
      };
    }
  );

  // 5. 网络故障诊断
  server.tool(
    "diagnose_network",
    "对指定手机号进行网络故障诊断，检查信号、基站、DNS、路由等状态。可选 lang 参数控制返回语言：'zh'（默认）或 'en'（英文）",
    {
      phone: z.string().describe("用户手机号"),
      issue_type: z.enum(["no_signal", "slow_data", "call_drop", "no_network"]).describe(
        "故障类型：no_signal=无信号，slow_data=网速慢，call_drop=通话中断，no_network=无法上网"
      ),
      lang: z.enum(["zh", "en"]).optional().describe("Response language: 'zh' for Chinese (default), 'en' for English"),
    },
    async ({ phone, issue_type, lang = "zh" }) => {
      const t0 = performance.now();
      const sub = await db.select().from(subscribers).where(eq(subscribers.phone, phone)).get();
      if (!sub) {
        mcpLog("diagnose_network", { phone, issue_type, success: false, reason: "no_subscriber", ms: Math.round(performance.now() - t0) });
        return {
          content: [{ type: "text", text: JSON.stringify({ success: false, message: `未找到手机号 ${phone}` }) }],
        };
      }

      const subs = await db
        .select({ service_id: subscriberSubscriptions.service_id })
        .from(subscriberSubscriptions)
        .where(eq(subscriberSubscriptions.phone, phone))
        .all();

      const subForDiagnosis = {
        ...sub,
        subscriptions: subs.map((s) => s.service_id),
      };

      const result = runDiagnosis(subForDiagnosis as any, issue_type as IssueType, lang as 'zh' | 'en');
      mcpLog("diagnose_network", { phone, issue_type, success: true, ms: Math.round(performance.now() - t0) });

      return {
        content: [{
          type: "text",
          text: JSON.stringify({ success: true, phone, ...result }),
        }],
      };
    }
  );

  // 6. 营业厅 App 问题诊断
  server.tool(
    "diagnose_app",
    "对指定手机号的营业厅 App 进行问题诊断，涵盖账号被锁、登录失败、设备不兼容、可疑活动等安全类问题",
    {
      phone: z.string().describe("用户手机号"),
      issue_type: z.enum(["app_locked", "login_failed", "device_incompatible", "suspicious_activity"]).describe(
        "故障类型：app_locked=App被锁定，login_failed=登录失败，device_incompatible=设备不兼容，suspicious_activity=可疑活动"
      ),
    },
    async ({ phone, issue_type }) => {
      const t0 = performance.now();
      const sub = await db.select().from(subscribers).where(eq(subscribers.phone, phone)).get();
      if (!sub) {
        mcpLog("diagnose_app", { phone, issue_type, success: false, reason: "no_subscriber", ms: Math.round(performance.now() - t0) });
        return {
          content: [{ type: "text", text: JSON.stringify({ success: false, message: `未找到手机号 ${phone}` }) }],
        };
      }

      // 构造安全诊断上下文（设备状态使用模拟数据，账号状态映射自真实数据）
      const accountStatus = sub.status === "active" ? "active" : sub.status === "suspended" ? "temp_locked" : "active";
      const ctx: AppUserContext = {
        account_status: accountStatus as AppUserContext["account_status"],
        lock_reason: "unknown",
        failed_attempts: 0,
        last_successful_login_days: 1,
        installed_app_version: "3.2.1",
        latest_app_version: "3.5.0",
        device_os: "android",
        os_version: "Android 13",
        device_rooted: false,
        developer_mode_on: false,
        running_on_emulator: false,
        has_vpn_active: false,
        has_fake_gps: false,
        has_remote_access_app: false,
        has_screen_share_active: false,
        flagged_apps: [],
        login_location_changed: false,
        new_device: false,
        otp_delivery_issue: false,
      };

      const result = runSecurityDiagnosis(ctx, issue_type as SecurityIssueType);
      mcpLog("diagnose_app", { phone, issue_type, success: true, ms: Math.round(performance.now() - t0) });

      return {
        content: [{
          type: "text",
          text: JSON.stringify({ success: true, phone, ...result }),
        }],
      };
    }
  );

  return server;
}

// ── HTTP Server：每个请求独立创建 transport（stateless 模式）──────────────────
const PORT = 8003;

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
  console.log(`[telecom-service] MCP endpoint: http://0.0.0.0:${PORT}/mcp`);
  console.log(`[telecom-service] DB: ${dbPath}`);
});
