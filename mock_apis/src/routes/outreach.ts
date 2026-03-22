/**
 * outreach.ts — 模拟外呼/短信/转人工系统
 */
import { Hono } from "hono";
import {
  db,
  outreachCallResults,
  outreachSmsEvents,
  outreachHandoffCases,
  outreachMarketingResults,
  customerPreferences,
  eq,
} from "../db.js";

const app = new Hono();

function isQuietHours(sendAt: string | undefined): boolean {
  if (!sendAt) return false;
  const date = new Date(sendAt);
  const hour = date.getUTCHours() + 8;
  const localHour = ((hour % 24) + 24) % 24;
  return localHour >= 21 || localHour < 8;
}

app.post("/calls/result", async (c) => {
  const body = await c.req.json<{
    task_id?: string;
    phone?: string;
    result?: string;
    remark?: string;
    callback_time?: string;
    ptp_date?: string;
  }>();

  if (!body.phone || !body.result) {
    return c.json({ success: false, message: "phone 和 result 不能为空" }, 400);
  }

  const record = {
    result_id: `CALL-${Date.now().toString(36)}`,
    task_id: body.task_id ?? null,
    phone: body.phone,
    result: body.result,
    remark: body.remark ?? null,
    callback_time: body.callback_time ?? null,
    ptp_date: body.ptp_date ?? null,
    created_at: new Date().toISOString(),
  };
  await db.insert(outreachCallResults).values(record).run();

  return c.json({
    success: true,
    result_id: record.result_id,
    next_action: body.result === "callback" ? "建议创建回拨任务" : body.result === "ptp" ? "建议发送付款提醒短信" : "已记录结果",
  });
});

app.post("/sms/send", async (c) => {
  const body = await c.req.json<{
    phone?: string;
    sms_type?: string;
    context?: string;
    send_at?: string;
  }>();

  if (!body.phone || !body.sms_type) {
    return c.json({ success: false, message: "phone 和 sms_type 不能为空" }, 400);
  }

  const blockedByQuietHours = isQuietHours(body.send_at);
  const prefs = await db.select().from(customerPreferences).where(eq(customerPreferences.phone, body.phone)).get();
  const blockedByDnd = Boolean(prefs?.dnd) && body.context === "marketing";
  const status = blockedByQuietHours || blockedByDnd ? "blocked" : "sent";
  const reason = blockedByQuietHours
    ? "quiet_hours"
    : blockedByDnd
      ? "dnd_preference"
      : null;

  const event = {
    event_id: `SMS-${Date.now().toString(36)}`,
    phone: body.phone,
    sms_type: body.sms_type,
    context: body.context ?? null,
    status,
    reason,
    sent_at: new Date().toISOString(),
  };
  await db.insert(outreachSmsEvents).values(event).run();

  return c.json({
    success: status === "sent",
    event_id: event.event_id,
    status,
    reason,
  });
});

app.post("/handoff/create", async (c) => {
  const body = await c.req.json<{
    phone?: string;
    source_skill?: string;
    reason?: string;
    priority?: "low" | "medium" | "high";
    queue_name?: string;
  }>();

  if (!body.phone || !body.source_skill || !body.reason) {
    return c.json({ success: false, message: "phone、source_skill、reason 不能为空" }, 400);
  }

  const handoff = {
    case_id: `HOF-${Date.now().toString(36)}`,
    phone: body.phone,
    source_skill: body.source_skill,
    reason: body.reason,
    priority: body.priority ?? "medium",
    queue_name: body.queue_name ?? "general_support",
    status: "open",
    created_at: new Date().toISOString(),
  };
  await db.insert(outreachHandoffCases).values(handoff).run();

  return c.json({ success: true, case_id: handoff.case_id, status: handoff.status, queue_name: handoff.queue_name });
});

app.post("/marketing/result", async (c) => {
  const body = await c.req.json<{
    campaign_id?: string;
    phone?: string;
    result?: string;
    callback_time?: string;
  }>();

  if (!body.campaign_id || !body.phone || !body.result) {
    return c.json({ success: false, message: "campaign_id、phone、result 不能为空" }, 400);
  }

  const prefs = await db.select().from(customerPreferences).where(eq(customerPreferences.phone, body.phone)).get();
  const record = {
    record_id: `MKT-${Date.now().toString(36)}`,
    campaign_id: body.campaign_id,
    phone: body.phone,
    result: body.result,
    callback_time: body.callback_time ?? null,
    is_dnd: body.result === "dnd" || Boolean(prefs?.dnd),
    recorded_at: new Date().toISOString(),
  };
  await db.insert(outreachMarketingResults).values(record).run();

  return c.json({
    success: true,
    record_id: record.record_id,
    is_dnd: record.is_dnd,
    followup: record.result === "callback" ? "建议创建回拨任务" : record.is_dnd ? "客户已加入免打扰" : "已记录营销结果",
  });
});

export default app;
