/**
 * diagnosis.ts — 模拟诊断系统（网络 + App 安全）
 *
 * 诊断逻辑从 mcp_servers/src/diagnosis/ 迁移而来。
 * 未来会被真实 NOC / 安全系统替换。
 */
import { Hono } from "hono";
import { db, subscribers, deviceContexts, subscriberSubscriptions, plans, eq } from "../db.js";
import { runDiagnosis } from "../diagnosis/run_diagnosis.js";
import { runSecurityDiagnosis } from "../diagnosis/run_security_diagnosis.js";
import type { IssueType, SubscriberContext } from "../diagnosis/fd_types.js";
import type { SecurityIssueType, AppUserContext } from "../diagnosis/app_types.js";

const app = new Hono();

// A3: 网络多步骤诊断
app.post("/network/analyze", async (c) => {
  const body = await c.req.json<{ msisdn?: string; issue_type?: string; lang?: string }>();
  if (!body.msisdn || !body.issue_type) {
    return c.json({ success: false, message: "msisdn 和 issue_type 不能为空" }, 400);
  }

  const sub = await db.select().from(subscribers).where(eq(subscribers.phone, body.msisdn)).get();
  if (!sub) return c.json({ success: false, message: `未找到手机号 ${body.msisdn}` }, 404);

  const plan = await db.select().from(plans).where(eq(plans.plan_id, sub.plan_id)).get();
  const subCtx: SubscriberContext = {
    status: sub.status as SubscriberContext['status'],
    data_used_gb: sub.data_used_gb,
    data_total_gb: plan?.data_gb ?? -1,
    voice_used_min: sub.voice_used_min,
    voice_total_min: plan?.voice_min ?? -1,
  };

  const lang = (body.lang === 'en' ? 'en' : 'zh') as 'zh' | 'en';
  const result = runDiagnosis(subCtx, body.issue_type as IssueType, lang);

  const hasError = result.diagnostic_steps.some(s => s.status === 'error');
  const hasWarning = result.diagnostic_steps.some(s => s.status === 'warning');
  const severity = hasError ? 'critical' : hasWarning ? 'warning' : 'normal';
  const escalate = result.diagnostic_steps.filter(s => s.status === 'error').length >= 2;

  return c.json({
    success: true,
    msisdn: body.msisdn,
    issue_type: result.issue_type,
    severity,
    escalate,
    diagnostic_steps: result.diagnostic_steps,
    conclusion: result.conclusion,
  });
});

// A4: App 安全诊断
app.post("/app/analyze", async (c) => {
  const body = await c.req.json<{ msisdn?: string; issue_type?: string; lang?: string }>();
  if (!body.msisdn || !body.issue_type) {
    return c.json({ success: false, message: "msisdn 和 issue_type 不能为空" }, 400);
  }

  const sub = await db.select().from(subscribers).where(eq(subscribers.phone, body.msisdn)).get();
  if (!sub) return c.json({ success: false, message: `未找到手机号 ${body.msisdn}` }, 404);

  const deviceRow = await db.select().from(deviceContexts).where(eq(deviceContexts.phone, body.msisdn)).get();

  const ctx: AppUserContext = {
    account_status: sub.status === 'suspended' ? 'temp_locked' : 'active',
    lock_reason: 'unknown',
    failed_attempts: 0,
    last_successful_login_days: 1,
    installed_app_version: deviceRow?.installed_app_version ?? '3.2.1',
    latest_app_version: deviceRow?.latest_app_version ?? '3.5.0',
    device_os: (deviceRow?.device_os as 'ios' | 'android') ?? 'android',
    os_version: deviceRow?.os_version ?? 'Android 13',
    device_rooted: deviceRow?.device_rooted === 1,
    developer_mode_on: deviceRow?.developer_mode_on === 1,
    running_on_emulator: deviceRow?.running_on_emulator === 1,
    has_vpn_active: deviceRow?.has_vpn_active === 1,
    has_fake_gps: deviceRow?.has_fake_gps === 1,
    has_remote_access_app: deviceRow?.has_remote_access_app === 1,
    has_screen_share_active: deviceRow?.has_screen_share_active === 1,
    flagged_apps: deviceRow?.flagged_apps ? JSON.parse(deviceRow.flagged_apps as string) : [],
    login_location_changed: deviceRow?.login_location_changed === 1,
    new_device: deviceRow?.new_device === 1,
    otp_delivery_issue: deviceRow?.otp_delivery_issue === 1,
  };

  const lang = (body.lang === 'en' ? 'en' : 'zh') as 'zh' | 'en';
  const result = runSecurityDiagnosis(ctx, body.issue_type as SecurityIssueType, lang);

  return c.json({
    success: true,
    msisdn: body.msisdn,
    issue_type: result.issue_type,
    lock_reason: result.lock_reason,
    diagnostic_steps: result.diagnostic_steps,
    conclusion: result.conclusion,
    escalation_path: result.escalation_path,
    customer_actions: result.customer_actions,
  });
});

export default app;
