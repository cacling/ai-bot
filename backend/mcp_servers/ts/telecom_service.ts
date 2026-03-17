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
import { runDiagnosis } from "../../skills/biz-skills/fault-diagnosis/scripts/run_diagnosis.ts";
import type { IssueType } from "../../skills/biz-skills/fault-diagnosis/scripts/types.ts";
import { runSecurityDiagnosis } from "../../skills/biz-skills/telecom-app/scripts/run_security_diagnosis.ts";
import type { SecurityIssueType, AppUserContext } from "../../skills/biz-skills/telecom-app/scripts/types.ts";

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

const deviceContexts = sqliteTable("device_contexts", {
  phone:                  text("phone").primaryKey(),
  installed_app_version:  text("installed_app_version").notNull(),
  latest_app_version:     text("latest_app_version").notNull(),
  device_os:              text("device_os").notNull(),
  os_version:             text("os_version").notNull(),
  device_rooted:          integer("device_rooted", { mode: "boolean" }).notNull(),
  developer_mode_on:      integer("developer_mode_on", { mode: "boolean" }).notNull(),
  running_on_emulator:    integer("running_on_emulator", { mode: "boolean" }).notNull(),
  has_vpn_active:         integer("has_vpn_active", { mode: "boolean" }).notNull(),
  has_fake_gps:           integer("has_fake_gps", { mode: "boolean" }).notNull(),
  has_remote_access_app:  integer("has_remote_access_app", { mode: "boolean" }).notNull(),
  has_screen_share_active: integer("has_screen_share_active", { mode: "boolean" }).notNull(),
  flagged_apps:           text("flagged_apps").notNull(),
  login_location_changed: integer("login_location_changed", { mode: "boolean" }).notNull(),
  new_device:             integer("new_device", { mode: "boolean" }).notNull(),
  otp_delivery_issue:     integer("otp_delivery_issue", { mode: "boolean" }).notNull(),
});

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

const db = drizzle(client, { schema: { plans, valueAddedServices, subscribers, subscriberSubscriptions, bills, deviceContexts, callbackTasks } });

// ── Mock 合约数据（account-service 工具使用）──────────────────────────────────
const MOCK_CONTRACTS: Record<string, Array<{ contract_id: string; name: string; end_date: string; penalty: number; risk_level: string }>> = {
  "13800000001": [
    { contract_id: "CT001", name: "24个月合约套餐", end_date: "2027-06-30", penalty: 200, risk_level: "high" },
  ],
  "13800000002": [],
};

// ── 日志 ───────────────────────────────────────────────────────────────────────
function mcpLog(tool: string, extra: Record<string, unknown>): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), mod: "telecom", tool, ...extra }));
}

/** "2026-03" → "2026年3月" — 避免模型将 YYYY-MM 格式误读为错误月份 */
function monthLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split("-");
  return `${y}年${parseInt(m, 10)}月`;
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
        const label = monthLabel(bill.month);
        return { content: [{ type: "text", text: JSON.stringify({ found: true, note: `本结果为${label}账单，请核对是否为用户所查询的月份`, bill: { ...bill, month_label: label } }) }] };
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
      const labeled = recentBills.map(b => ({ ...b, month_label: monthLabel(b.month) }));
      return { content: [{ type: "text", text: JSON.stringify({ found: true, note: `以下为最近${labeled.length}个月账单，请根据用户需求选择对应月份回复`, bills: labeled }) }] };
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

      // 构造安全诊断上下文（设备状态从 DB 查询，账号状态映射自用户数据）
      const accountStatus = sub.status === "active" ? "active" : sub.status === "suspended" ? "temp_locked" : "active";
      const deviceRow = db.select().from(deviceContexts).where(eq(deviceContexts.phone, phone)).get();
      const ctx: AppUserContext = {
        account_status: accountStatus as AppUserContext["account_status"],
        lock_reason: "unknown",
        failed_attempts: 0,
        last_successful_login_days: 1,
        installed_app_version:  deviceRow?.installed_app_version ?? "3.2.1",
        latest_app_version:     deviceRow?.latest_app_version ?? "3.5.0",
        device_os:              deviceRow?.device_os ?? "android",
        os_version:             deviceRow?.os_version ?? "Android 13",
        device_rooted:          deviceRow?.device_rooted ?? false,
        developer_mode_on:      deviceRow?.developer_mode_on ?? false,
        running_on_emulator:    deviceRow?.running_on_emulator ?? false,
        has_vpn_active:         deviceRow?.has_vpn_active ?? false,
        has_fake_gps:           deviceRow?.has_fake_gps ?? false,
        has_remote_access_app:  deviceRow?.has_remote_access_app ?? false,
        has_screen_share_active: deviceRow?.has_screen_share_active ?? false,
        flagged_apps:           deviceRow ? JSON.parse(deviceRow.flagged_apps) : [],
        login_location_changed: deviceRow?.login_location_changed ?? false,
        new_device:             deviceRow?.new_device ?? false,
        otp_delivery_issue:     deviceRow?.otp_delivery_issue ?? false,
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

  // 7. 开具电子发票
  server.tool(
    "issue_invoice",
    "为指定用户的指定月份账单开具电子发票并发送到邮箱",
    {
      phone: z.string().describe("用户手机号"),
      month: z.string().describe('账单月份，格式 YYYY-MM，如 "2026-02"'),
      email: z.string().describe("发票接收邮箱地址"),
    },
    async ({ phone, month, email }) => {
      const t0 = performance.now();

      // 验证用户存在
      const sub = await db.select().from(subscribers).where(eq(subscribers.phone, phone)).get();
      if (!sub) {
        mcpLog("issue_invoice", { phone, month, success: false, reason: "no_subscriber", ms: Math.round(performance.now() - t0) });
        return {
          content: [{ type: "text", text: JSON.stringify({ success: false, message: `未找到手机号 ${phone} 的用户信息` }) }],
        };
      }

      // 查询对应月份账单
      const bill = await db.select().from(bills).where(and(eq(bills.phone, phone), eq(bills.month, month))).get();
      if (!bill) {
        mcpLog("issue_invoice", { phone, month, success: false, reason: "no_bill", ms: Math.round(performance.now() - t0) });
        return {
          content: [{ type: "text", text: JSON.stringify({ success: false, message: `未找到 ${phone} 用户 ${month} 的账单记录，无法开具发票` }) }],
        };
      }

      // 生成发票号（模拟）
      const invoiceNo = `INV-${month.replace('-', '')}-${phone.slice(-4)}-${Date.now().toString(36).toUpperCase().slice(-4)}`;
      const maskedEmail = email.replace(/^(.{2})(.*)(@.*)$/, (_, a, b, c) => a + '*'.repeat(Math.min(b.length, 4)) + c);

      mcpLog("issue_invoice", { phone, month, email: maskedEmail, invoiceNo, total: bill.total, success: true, ms: Math.round(performance.now() - t0) });

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            invoice_no: invoiceNo,
            phone,
            month,
            total: bill.total,
            email: maskedEmail,
            status: "已发送",
            message: `${month} 账单电子发票（金额 ¥${bill.total}）已发送至 ${maskedEmail}，发票号：${invoiceNo}，预计 3-5 个工作日内送达。`,
          }),
        }],
      };
    }
  );

  // ── 外呼工具 ─────────────────────────────────────────────────────────────────

  // 8. 记录通话结果
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
        content: [{ type: "text", text: JSON.stringify({ success: true, message: `通话结果已记录：${result}${extra}${remarkStr}` }) }],
      };
    },
  );

  // 9. 发送跟进短信
  server.tool(
    "send_followup_sms",
    "向客户发送跟进短信（还款链接、套餐详情、回访提醒等）",
    {
      phone: z.string().describe("客户手机号"),
      sms_type: z.enum(["payment_link", "plan_detail", "callback_reminder", "product_detail"]).describe("短信类型"),
    },
    async ({ phone, sms_type }) => {
      mcpLog("send_followup_sms", { phone, sms_type });
      const labels: Record<string, string> = { payment_link: "还款链接", plan_detail: "套餐详情", callback_reminder: "回访提醒", product_detail: "产品详情" };
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, message: `${labels[sms_type] ?? sms_type}短信已发送至 ${phone}` }) }],
      };
    },
  );

  // 10. 创建回访任务
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
        task_id: taskId, original_task_id, customer_name: customer_name ?? "",
        callback_phone, preferred_time, product_name: product_name ?? "",
        created_at: new Date().toISOString(), status: "pending",
      });
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, callback_task_id: taskId, message: `回访任务已创建，将于 ${preferred_time} 回访 ${callback_phone}` }) }],
      };
    },
  );

  // 11. 记录营销结果
  server.tool(
    "record_marketing_result",
    "记录营销外呼的通话结果。通话结束前必须调用。",
    {
      campaign_id: z.string().describe("营销活动 ID"),
      phone: z.string().describe("客户手机号"),
      result: z.enum(["converted", "callback", "not_interested", "no_answer", "busy", "wrong_number", "dnd"]).describe("营销结果"),
      callback_time: z.string().optional().describe("约定回访时间"),
    },
    async ({ campaign_id, phone, result, callback_time }) => {
      mcpLog("record_marketing_result", { campaign_id, phone, result, callback_time });
      const extra = callback_time ? `，约定回访时间：${callback_time}` : "";
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, message: `营销结果已记录：${result}${extra}` }) }],
      };
    },
  );

  // ── 账户操作工具 ─────────────────────────────────────────────────────────────

  // 12. 身份验证
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
      if (!sub) return { content: [{ type: "text", text: JSON.stringify({ success: false, message: `未找到手机号 ${phone}` }) }] };
      const valid = otp === "1234" || otp === "0000" || otp.length === 6;
      return {
        content: [{ type: "text", text: JSON.stringify({ success: valid, verified: valid, customer_name: sub.name, message: valid ? `身份验证通过，用户：${sub.name}` : "验证码错误，请重新输入" }) }],
      };
    },
  );

  // 13. 查询账户余额
  server.tool(
    "check_account_balance",
    "查询用户账户余额和欠费状态",
    { phone: z.string().describe("用户手机号") },
    async ({ phone }) => {
      mcpLog("check_account_balance", { phone });
      const sub = await db.select().from(subscribers).where(eq(subscribers.phone, phone)).get();
      if (!sub) return { content: [{ type: "text", text: JSON.stringify({ success: false, message: `未找到手机号 ${phone}` }) }] };
      const hasArrears = sub.balance < 0;
      return {
        content: [{ type: "text", text: JSON.stringify({
          success: true, phone, balance: sub.balance, has_arrears: hasArrears,
          arrears_amount: hasArrears ? Math.abs(sub.balance) : 0, status: sub.status,
          message: hasArrears ? `账户存在欠费 ¥${Math.abs(sub.balance).toFixed(2)}，需先缴清欠费才能办理停机` : `账户余额 ¥${sub.balance.toFixed(2)}，无欠费`,
        }) }],
      };
    },
  );

  // 14. 查询合约
  server.tool(
    "check_contracts",
    "查询用户当前有效合约列表，判断是否有高风险合约阻止停机",
    { phone: z.string().describe("用户手机号") },
    async ({ phone }) => {
      mcpLog("check_contracts", { phone });
      const contracts = MOCK_CONTRACTS[phone] ?? [];
      const hasHighRisk = contracts.some(c => c.risk_level === "high");
      return {
        content: [{ type: "text", text: JSON.stringify({
          success: true, phone, contracts, has_active_contracts: contracts.length > 0, has_high_risk: hasHighRisk,
          message: hasHighRisk
            ? `用户存在 ${contracts.length} 个有效合约，其中包含高风险合约，停机需支付违约金`
            : contracts.length > 0 ? `用户存在 ${contracts.length} 个有效合约，但不影响停机操作` : "用户无有效合约，可直接办理停机",
        }) }],
      };
    },
  );

  // 15. 申请停机
  server.tool(
    "apply_service_suspension",
    "执行停机操作。需在身份验证、余额检查、合约检查全部通过后调用。",
    {
      phone: z.string().describe("用户手机号"),
      suspension_type: z.enum(["temporary", "permanent"]).optional().describe("停机类型：temporary=临时停机，permanent=永久停机"),
    },
    async ({ phone, suspension_type = "temporary" }) => {
      mcpLog("apply_service_suspension", { phone, suspension_type });
      const sub = await db.select().from(subscribers).where(eq(subscribers.phone, phone)).get();
      if (!sub) return { content: [{ type: "text", text: JSON.stringify({ success: false, message: `未找到手机号 ${phone}` }) }] };
      if (sub.status === "suspended") return { content: [{ type: "text", text: JSON.stringify({ success: false, message: "该号码已处于停机状态" }) }] };
      const suspendDate = new Date().toISOString().slice(0, 10);
      const resumeDeadline = suspension_type === "temporary" ? new Date(Date.now() + 90 * 86400_000).toISOString().slice(0, 10) : null;
      return {
        content: [{ type: "text", text: JSON.stringify({
          success: true, phone, suspension_type, effective_date: suspendDate, resume_deadline: resumeDeadline,
          message: suspension_type === "temporary"
            ? `临时停机已生效，请在 ${resumeDeadline} 前办理复机，逾期将自动销号`
            : "永久停机已生效，号码将在 90 天后释放",
        }) }],
      };
    },
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
