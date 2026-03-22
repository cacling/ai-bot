/**
 * diagnosis.ts — 模拟诊断系统（网络 + App 安全）
 *
 * 诊断逻辑从 mcp_servers/src/diagnosis/ 迁移而来。
 * 未来会被真实 NOC / 安全系统替换。
 */
import { Hono } from "hono";
import { db, subscribers, deviceContexts, subscriberSubscriptions, plans, networkIncidents, identityLoginEvents, eq } from "../db.js";
import { runDiagnosis } from "../diagnosis/run_diagnosis.js";
import { runSecurityDiagnosis } from "../diagnosis/run_security_diagnosis.js";
import type { IssueType, SubscriberContext, DiagnosticStep } from "../diagnosis/fd_types.js";
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
  const steps: DiagnosticStep[] = [...result.diagnostic_steps];

  // 查询区域网络事件
  const incidents = await db.select().from(networkIncidents).all();
  const regionIncidents = incidents.filter(inc => {
    if (sub.region && inc.region !== sub.region && inc.region !== '全国') return false;
    return inc.status === 'open';
  });
  if (regionIncidents.length > 0) {
    const desc = regionIncidents.map(inc => inc.description).join('；');
    steps.push({
      step: 'check_region_incidents',
      status: 'warning',
      detail: `当前区域（${sub.region}）存在网络事件：${desc}`,
    });
  }

  // 漫游用户专属诊断
  const subscriptions = await db.select().from(subscriberSubscriptions).where(eq(subscriberSubscriptions.phone, body.msisdn)).all();
  const hasRoamingPkg = subscriptions.some(s => s.service_id === 'roaming_pkg' && s.status === 'active');
  if (hasRoamingPkg) {
    // 漫游包已订购，检查可能的漫游问题
    steps.push({
      step: 'check_roaming_package',
      status: 'ok',
      detail: '已订购国际漫游安心包，漫游包状态正常。',
    });
    steps.push({
      step: 'check_roaming_coverage',
      status: 'warning',
      detail: '漫游包可能不覆盖当前所在国家/地区的本地网络，建议确认覆盖范围。如超出漫游包范围，将按标准漫游资费计费。',
    });
    steps.push({
      step: 'check_roaming_data_usage',
      status: 'warning',
      detail: '如漫游流量已超出包内额度，超出部分将按包外资费计费，建议在 APP 中查看漫游流量使用情况。',
    });
  } else if (body.issue_type === 'no_network' || body.issue_type === 'slow_data') {
    // 没有漫游包但可能在境外
    steps.push({
      step: 'check_roaming_status',
      status: 'warning',
      detail: '未检测到已订购的漫游套餐。如您当前在境外，需先开通国际漫游服务才能正常使用网络。',
    });
  }

  const hasError = steps.some(s => s.status === 'error');
  const hasWarning = steps.some(s => s.status === 'warning');
  const severity = hasError ? 'critical' : hasWarning ? 'warning' : 'normal';
  const escalate = steps.filter(s => s.status === 'error').length >= 2;

  return c.json({
    success: true,
    msisdn: body.msisdn,
    issue_type: result.issue_type,
    severity,
    escalate,
    diagnostic_steps: steps,
    conclusion: result.conclusion,
    has_roaming: hasRoamingPkg,
    region_incidents: regionIncidents.length,
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

  // 从登录事件表获取真实数据
  const loginEvents = await db.select().from(identityLoginEvents).where(eq(identityLoginEvents.phone, body.msisdn)).all();
  const sortedEvents = loginEvents.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  const failedAttempts = sortedEvents.filter(e => e.result === 'failed').length;
  const lastSuccess = sortedEvents.find(e => e.result === 'success');
  const lastSuccessMs = lastSuccess ? Date.now() - new Date(lastSuccess.occurred_at).getTime() : Infinity;
  const lastSuccessfulLoginDays = lastSuccess ? Math.max(1, Math.ceil(lastSuccessMs / (1000 * 60 * 60 * 24))) : 30;
  const lockedEvent = sortedEvents.find(e => e.event_type === 'account_locked');
  const failedEvent = sortedEvents.find(e => e.result === 'failed');
  const lockReason: AppUserContext['lock_reason'] = lockedEvent
    ? 'security_flag'
    : failedAttempts >= 5
      ? 'too_many_attempts'
      : failedEvent?.failure_reason === 'password_attempts_exceeded'
        ? 'too_many_attempts'
        : 'unknown';

  const ctx: AppUserContext = {
    account_status: sub.status === 'suspended' ? 'temp_locked' : lockedEvent ? 'temp_locked' : 'active',
    lock_reason: lockReason,
    failed_attempts: failedAttempts,
    last_successful_login_days: lastSuccessfulLoginDays,
    installed_app_version: deviceRow?.installed_app_version ?? '3.2.1',
    latest_app_version: deviceRow?.latest_app_version ?? '3.5.0',
    device_os: (deviceRow?.device_os as 'ios' | 'android') ?? 'android',
    os_version: deviceRow?.os_version ?? 'Android 13',
    device_rooted: Boolean(deviceRow?.device_rooted),
    developer_mode_on: Boolean(deviceRow?.developer_mode_on),
    running_on_emulator: Boolean(deviceRow?.running_on_emulator),
    has_vpn_active: Boolean(deviceRow?.has_vpn_active),
    has_fake_gps: Boolean(deviceRow?.has_fake_gps),
    has_remote_access_app: Boolean(deviceRow?.has_remote_access_app),
    has_screen_share_active: Boolean(deviceRow?.has_screen_share_active),
    flagged_apps: deviceRow?.flagged_apps ? JSON.parse(deviceRow.flagged_apps as string) : [],
    login_location_changed: Boolean(deviceRow?.login_location_changed),
    new_device: Boolean(deviceRow?.new_device),
    otp_delivery_issue: Boolean(deviceRow?.otp_delivery_issue),
  };

  const result = runSecurityDiagnosis(ctx, body.issue_type as SecurityIssueType);

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
