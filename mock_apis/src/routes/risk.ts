/**
 * risk.ts — 模拟账户风险中心
 */
import { Hono } from "hono";
import { db, subscribers, deviceContexts, eq } from "../db.js";

const app = new Hono();

app.get("/accounts/:msisdn", async (c) => {
  const msisdn = c.req.param("msisdn");
  const sub = await db.select().from(subscribers).where(eq(subscribers.phone, msisdn)).get();
  if (!sub) return c.json({ success: false, message: `未找到手机号 ${msisdn}` }, 404);

  const ctx = await db.select().from(deviceContexts).where(eq(deviceContexts.phone, msisdn)).get();
  const indicators: string[] = [];
  let score = 0;

  if (ctx?.device_rooted) { indicators.push("device_rooted"); score += 35; }
  if (ctx?.running_on_emulator) { indicators.push("running_on_emulator"); score += 35; }
  if (ctx?.developer_mode_on) { indicators.push("developer_mode_on"); score += 20; }
  if (ctx?.has_vpn_active) { indicators.push("vpn_active"); score += 10; }
  if (ctx?.login_location_changed) { indicators.push("login_location_changed"); score += 25; }
  if (ctx?.new_device) { indicators.push("new_device"); score += 20; }
  if (ctx?.otp_delivery_issue) { indicators.push("otp_delivery_issue"); score += 10; }
  if (ctx?.has_fake_gps) { indicators.push("fake_gps"); score += 20; }
  if (ctx?.has_remote_access_app) { indicators.push("remote_access_app"); score += 25; }

  const risk_level = score >= 60 ? "high" : score >= 25 ? "medium" : "low";
  const recommended_action = risk_level === "high"
    ? "建议转接安全团队并触发二次核验"
    : risk_level === "medium"
      ? "建议追加短信验证并提醒客户检查设备安全"
      : "当前风险较低，可继续自助流程";

  return c.json({
    success: true,
    msisdn,
    customer_name: sub.name,
    risk_level,
    risk_score: score,
    indicators,
    recommended_action,
  });
});

export default app;
