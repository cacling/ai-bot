/**
 * 故障诊断服务 — diagnose_network, diagnose_app
 * Port: 18005
 */
import { db, subscribers, subscriberSubscriptions, deviceContexts, mcpLog, startMcpHttpServer, eq, z, McpServer, performance } from "./shared.js";
import { runDiagnosis } from "../../skills/biz-skills/fault-diagnosis/scripts/run_diagnosis.ts";
import type { IssueType } from "../../skills/biz-skills/fault-diagnosis/scripts/types.ts";
import { runSecurityDiagnosis } from "../../skills/biz-skills/telecom-app/scripts/run_security_diagnosis.ts";
import type { SecurityIssueType, AppUserContext } from "../../skills/biz-skills/telecom-app/scripts/types.ts";

function createServer(): McpServer {
  const server = new McpServer({ name: "diagnosis-service", version: "1.0.0" });

  server.tool("diagnose_network", "对指定手机号进行网络故障诊断，检查信号、基站、DNS、路由等状态", {
    phone: z.string().describe("用户手机号"),
    issue_type: z.enum(["no_signal", "slow_data", "call_drop", "no_network"]).describe("故障类型"),
    lang: z.enum(["zh", "en"]).optional().describe("返回语言"),
  }, async ({ phone, issue_type, lang = "zh" }) => {
    const t0 = performance.now();
    const sub = await db.select().from(subscribers).where(eq(subscribers.phone, phone)).get();
    if (!sub) { return { content: [{ type: "text", text: JSON.stringify({ success: false, message: `未找到手机号 ${phone}` }) }] }; }
    const subs = await db.select({ service_id: subscriberSubscriptions.service_id }).from(subscriberSubscriptions).where(eq(subscriberSubscriptions.phone, phone)).all();
    const result = runDiagnosis({ ...sub, subscriptions: subs.map(s => s.service_id) } as any, issue_type as IssueType, lang as 'zh' | 'en');
    mcpLog("diagnosis", "diagnose_network", { phone, issue_type, success: true, ms: Math.round(performance.now() - t0) });
    return { content: [{ type: "text", text: JSON.stringify({ success: true, phone, ...result }) }] };
  });

  server.tool("diagnose_app", "对指定手机号的营业厅 App 进行问题诊断", {
    phone: z.string().describe("用户手机号"),
    issue_type: z.enum(["app_locked", "login_failed", "device_incompatible", "suspicious_activity"]).describe("故障类型"),
  }, async ({ phone, issue_type }) => {
    const t0 = performance.now();
    const sub = await db.select().from(subscribers).where(eq(subscribers.phone, phone)).get();
    if (!sub) { return { content: [{ type: "text", text: JSON.stringify({ success: false, message: `未找到手机号 ${phone}` }) }] }; }
    const accountStatus = sub.status === "active" ? "active" : sub.status === "suspended" ? "temp_locked" : "active";
    const deviceRow = await db.select().from(deviceContexts).where(eq(deviceContexts.phone, phone)).get();
    const ctx: AppUserContext = {
      account_status: accountStatus as AppUserContext["account_status"], lock_reason: "unknown", failed_attempts: 0, last_successful_login_days: 1,
      installed_app_version: deviceRow?.installed_app_version ?? "3.2.1", latest_app_version: deviceRow?.latest_app_version ?? "3.5.0",
      device_os: deviceRow?.device_os ?? "android", os_version: deviceRow?.os_version ?? "Android 13",
      device_rooted: deviceRow?.device_rooted ?? false, developer_mode_on: deviceRow?.developer_mode_on ?? false,
      running_on_emulator: deviceRow?.running_on_emulator ?? false, has_vpn_active: deviceRow?.has_vpn_active ?? false,
      has_fake_gps: deviceRow?.has_fake_gps ?? false, has_remote_access_app: deviceRow?.has_remote_access_app ?? false,
      has_screen_share_active: deviceRow?.has_screen_share_active ?? false, flagged_apps: deviceRow ? JSON.parse(deviceRow.flagged_apps) : [],
      login_location_changed: deviceRow?.login_location_changed ?? false, new_device: deviceRow?.new_device ?? false, otp_delivery_issue: deviceRow?.otp_delivery_issue ?? false,
    };
    const result = runSecurityDiagnosis(ctx, issue_type as SecurityIssueType);
    mcpLog("diagnosis", "diagnose_app", { phone, issue_type, success: true, ms: Math.round(performance.now() - t0) });
    return { content: [{ type: "text", text: JSON.stringify({ success: true, phone, ...result }) }] };
  });

  return server;
}

startMcpHttpServer("diagnosis-service", Number(process.env.PORT ?? 18005), createServer);
