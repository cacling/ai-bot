/**
 * POST /api/identity/verify — 身份验证（OTP）
 *
 * 模拟真实认证中心：校验验证码，返回用户姓名。
 * Mock 规则：1234 / 0000 / 任意6位数字 = 通过
 */
import { Hono } from "hono";
import { db, subscribers, eq } from "../db.js";

const app = new Hono();

app.post("/verify", async (c) => {
  const { phone, otp } = await c.req.json<{ phone: string; otp: string }>();
  if (!phone || !otp) return c.json({ success: false, message: "phone 和 otp 不能为空" }, 400);

  const sub = db.select().from(subscribers).where(eq(subscribers.phone, phone)).get();
  if (!sub) return c.json({ success: false, verified: false, message: `未找到手机号 ${phone}` });

  const valid = otp === "1234" || otp === "0000" || (otp.length === 6 && /^\d+$/.test(otp));
  return c.json({
    success: valid,
    verified: valid,
    customer_name: sub.name,
    message: valid ? `身份验证通过，用户：${sub.name}` : "验证码错误，请重新输入",
  });
});

export default app;
