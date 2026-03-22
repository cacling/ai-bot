/**
 * identity.ts — 模拟身份中心 / OTP 服务
 */
import { Hono } from "hono";
import { db, subscribers, identityOtpRequests, identityLoginEvents, eq } from "../db.js";

const app = new Hono();

function buildOtpForPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.slice(-6).padStart(6, "0");
}

app.post("/otp/send", async (c) => {
  const { phone, traceId } = await c.req.json<{ phone?: string; traceId?: string }>();
  if (!phone) return c.json({ success: false, message: "phone 不能为空" }, 400);

  const sub = await db.select().from(subscribers).where(eq(subscribers.phone, phone)).get();
  if (!sub) return c.json({ success: false, message: `未找到手机号 ${phone}` }, 404);

  const otp = {
    request_id: `OTP-${Date.now().toString(36)}`,
    phone,
    otp: buildOtpForPhone(phone),
    channel: "sms",
    delivery_status: phone === "13800000003" ? "delayed" : "sent",
    status: "pending",
    requested_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    trace_id: traceId ?? null,
  } as const;

  await db.insert(identityOtpRequests).values(otp).run();
  return c.json({
    success: true,
    request_id: otp.request_id,
    phone,
    channel: otp.channel,
    delivery_status: otp.delivery_status,
    expires_at: otp.expires_at,
    mock_otp: otp.otp,
    message: otp.delivery_status === "delayed"
      ? "验证码已发送，但当前短信链路有延迟"
      : "验证码已发送",
  });
});

app.post("/verify", async (c) => {
  const { phone, otp } = await c.req.json<{ phone?: string; otp?: string }>();
  if (!phone || !otp) return c.json({ success: false, message: "phone 和 otp 不能为空" }, 400);

  const sub = await db.select().from(subscribers).where(eq(subscribers.phone, phone)).get();
  if (!sub) return c.json({ success: false, verified: false, message: `未找到手机号 ${phone}` }, 404);

  const records = await db.select().from(identityOtpRequests).where(eq(identityOtpRequests.phone, phone)).all();
  const latest = records
    .sort((a, b) => b.requested_at.localeCompare(a.requested_at))[0] ?? null;
  const matchesLatest = latest?.status === "pending" && latest.otp === otp;
  const matchesLegacyMock = otp === "1234";
  const valid = Boolean(matchesLatest || matchesLegacyMock);

  if (valid && latest) {
    await db.update(identityOtpRequests)
      .set({ status: "verified" })
      .where(eq(identityOtpRequests.request_id, latest.request_id))
      .run();
  }

  return c.json({
    success: valid,
    verified: valid,
    customer_name: valid ? sub.name : null,
    verification_method: "otp",
    message: valid ? `身份验证通过，用户：${sub.name}` : "验证码错误，请重新输入",
  });
});

app.get("/accounts/:msisdn/login-events", async (c) => {
  const msisdn = c.req.param("msisdn");
  const sub = await db.select().from(subscribers).where(eq(subscribers.phone, msisdn)).get();
  if (!sub) return c.json({ success: false, message: `未找到手机号 ${msisdn}` }, 404);

  const events = await db.select().from(identityLoginEvents).where(eq(identityLoginEvents.phone, msisdn)).all();
  const sorted = events.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  const latest = sorted[0] ?? null;

  return c.json({
    success: true,
    msisdn,
    count: sorted.length,
    latest_state: latest
      ? {
          result: latest.result,
          event_type: latest.event_type,
          failure_reason: latest.failure_reason,
          occurred_at: latest.occurred_at,
        }
      : null,
    events: sorted,
  });
});

export default app;
