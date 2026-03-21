/**
 * 故障诊断服务 — diagnose_network, diagnose_app
 * Port: 18005
 */
import { db, subscribers, subscriberSubscriptions, deviceContexts, mcpLog, startMcpHttpServer, eq, z, McpServer, performance } from "../shared/server.js";
import { runDiagnosis } from "../diagnosis/run_diagnosis.js";
import type { IssueType } from "../diagnosis/fd_types.js";
import { runSecurityDiagnosis } from "../diagnosis/run_security_diagnosis.js";
import type { SecurityIssueType, AppUserContext } from "../diagnosis/app_types.js";

function createServer(): McpServer {
  const server = new McpServer({ name: "diagnosis-service", version: "1.0.0" });

  server.tool("diagnose_network", "对指定手机号进行网络故障诊断，检查信号、基站、DNS、路由等状态", {
    phone: z.string().describe("用户手机号"),
    issue_type: z.enum(["no_signal", "slow_data", "call_drop", "no_network"]).describe("故障类型"),
    lang: z.enum(["zh", "en"]).optional().describe("返回语言"),
  }, async ({ phone, issue_type, lang = "zh" }) => {
    const t0 = performance.now();
    const sub = await db.select().from(subscribers).where(eq(subscribers.phone, phone)).get();
    if (!sub) { return { content: [{ type: "text", text: JSON.stringify({ phone, issue_type, diagnostic_steps: [], conclusion: null, severity: null, should_escalate: false, next_action: null }) }] }; }
    const subs = await db.select({ service_id: subscriberSubscriptions.service_id }).from(subscriberSubscriptions).where(eq(subscriberSubscriptions.phone, phone)).all();
    const result = runDiagnosis({ ...sub, subscriptions: subs.map(s => s.service_id) } as any, issue_type as IssueType, lang as 'zh' | 'en');
    const steps = result.diagnostic_steps;
    const hasError = steps.some(s => s.status === "error");
    const hasWarning = steps.some(s => s.status === "warning");
    const severity = hasError ? "critical" : hasWarning ? "warning" : "normal";
    const shouldEscalate = hasError && steps.filter(s => s.status === "error").length >= 2;
    const suggestions: Record<string, Record<string, string>> = {
      no_signal: { zh: "请检查 SIM 卡是否松动，或尝试切换飞行模式后重新搜网。", en: "Please check if the SIM card is loose, or try toggling airplane mode." },
      slow_data: { zh: "建议关闭后台高流量应用，或切换至 WiFi 网络。", en: "Try closing background apps or switching to WiFi." },
      call_drop: { zh: "建议避免在信号弱的室内通话，或移至开阔区域。", en: "Try moving to an open area with better signal." },
      no_network: { zh: "请检查 APN 设置是否正确，或重置网络设置。", en: "Please check your APN settings or reset network settings." },
    };
    const nextAction = severity === "normal"
      ? (lang === "en" ? "All checks passed. If the issue persists, please try restarting your device." : "各项检测正常。如问题持续，建议重启设备后观察。")
      : shouldEscalate
      ? (lang === "en" ? "Multiple critical issues detected. Recommend transferring to a human agent." : "检测到多项严重问题，建议转接人工客服处理。")
      : (suggestions[issue_type]?.[lang] ?? (lang === "en" ? "Please follow the diagnostic suggestions." : "请按照诊断建议操作。"));
    mcpLog("diagnosis", "diagnose_network", { phone, issue_type, severity, success: true, ms: Math.round(performance.now() - t0) });
    return { content: [{ type: "text", text: JSON.stringify({ phone, issue_type: result.issue_type, diagnostic_steps: result.diagnostic_steps, conclusion: result.conclusion, severity, should_escalate: shouldEscalate, next_action: nextAction }) }] };
  });

  server.tool("diagnose_app", "对指定手机号的营业厅 App 进行问题诊断", {
    phone: z.string().describe("用户手机号"),
    issue_type: z.enum(["app_locked", "login_failed", "device_incompatible", "suspicious_activity"]).describe("故障类型"),
  }, async ({ phone, issue_type }) => {
    const t0 = performance.now();
    const sub = await db.select().from(subscribers).where(eq(subscribers.phone, phone)).get();
    if (!sub) { return { content: [{ type: "text", text: JSON.stringify({ phone, issue_type, diagnostic_steps: [], conclusion: null, escalation_path: null, customer_actions: [], risk_level: "none", next_step: null, action_count: 0, lock_reason: null }) }] }; }
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
    // 增强：risk_level、next_step
    const appSteps = result.diagnostic_steps;
    const appHasError = appSteps.some(s => s.status === "error");
    const appHasEscalate = appSteps.some(s => s.escalate);
    const riskLevel = appHasEscalate && appHasError ? "high" : appHasEscalate ? "medium" : appHasError ? "low" : "none";
    const nextStep = result.escalation_path === "security_team"
      ? "检测到高风险问题，请立即转接安全团队处理，请勿让客户继续尝试登录。"
      : result.escalation_path === "frontline"
      ? "自助排查已完成但问题未解决，需转一线客服获取截图进行人工审查。"
      : appHasError
      ? "发现可修复问题，请引导客户按建议操作后重新尝试。"
      : "所有检查项通过，请引导客户重新尝试登录。";
    mcpLog("diagnosis", "diagnose_app", { phone, issue_type, risk_level: riskLevel, success: true, ms: Math.round(performance.now() - t0) });
    return { content: [{ type: "text", text: JSON.stringify({ phone, issue_type: result.issue_type, diagnostic_steps: result.diagnostic_steps, conclusion: result.conclusion, escalation_path: result.escalation_path, customer_actions: result.customer_actions, risk_level: riskLevel, next_step: nextStep, action_count: result.customer_actions.length, lock_reason: ctx.lock_reason !== "unknown" ? ctx.lock_reason : null }) }] };
  });

  return server;
}

startMcpHttpServer("diagnosis-service", Number(process.env.PORT ?? 18005), createServer);
