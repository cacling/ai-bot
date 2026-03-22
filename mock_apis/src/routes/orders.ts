/**
 * orders.ts — 模拟订单 / 办理系统
 */
import { Hono } from "hono";
import {
  db,
  subscribers,
  subscriberSubscriptions,
  valueAddedServices,
  ordersServiceOrders,
  ordersRefundRequests,
  eq,
} from "../db.js";

const app = new Hono();

app.post("/service-cancel", async (c) => {
  const body = await c.req.json<{
    phone?: string;
    service_id?: string;
    reason?: string;
  }>();

  if (!body.phone || !body.service_id) {
    return c.json({ success: false, message: "phone 和 service_id 不能为空" }, 400);
  }

  const sub = await db.select().from(subscribers).where(eq(subscribers.phone, body.phone)).get();
  if (!sub) return c.json({ success: false, message: `未找到手机号 ${body.phone}` }, 404);

  const subscription = await db.select().from(subscriberSubscriptions)
    .where(eq(subscriberSubscriptions.phone, body.phone))
    .all();
  const subscribedServiceIds = new Set(subscription.map((item) => item.service_id));
  if (!subscribedServiceIds.has(body.service_id)) {
    return c.json({ success: false, message: `${body.phone} 未订阅 ${body.service_id}` }, 404);
  }

  const service = await db.select().from(valueAddedServices).where(eq(valueAddedServices.service_id, body.service_id)).get();
  if (!service) return c.json({ success: false, message: `未找到业务 ${body.service_id}` }, 404);

  const order = {
    order_id: `ORD-${Date.now().toString(36)}`,
    order_type: "service_cancel",
    phone: body.phone,
    service_id: body.service_id,
    service_name: service.name,
    reason: body.reason ?? "customer_requested_cancel",
    status: "pending_effective",
    effective_at: service.effective_end,
    requires_manual_review: sub.status !== "active",
    message: sub.status === "active"
      ? "退订申请已受理，预计次月生效。"
      : "号码当前状态异常，退订申请已提交人工复核。",
    created_at: new Date().toISOString(),
  };
  await db.insert(ordersServiceOrders).values(order).run();

  return c.json({
    success: true,
    order_id: order.order_id,
    phone: body.phone,
    service_id: body.service_id,
    service_name: service.name,
    monthly_fee: service.monthly_fee,
    status: order.status,
    effective_at: order.effective_at,
    refund_eligible: false,
    refund_note: "当月费用不退，次月起不再扣费。",
    requires_manual_review: order.requires_manual_review,
    message: order.message,
  });
});

app.get("/refund-requests", async (c) => {
  const msisdn = c.req.query("msisdn");
  if (!msisdn) return c.json({ success: false, message: "msisdn 不能为空" }, 400);

  const sub = await db.select().from(subscribers).where(eq(subscribers.phone, msisdn)).get();
  if (!sub) return c.json({ success: false, message: `未找到手机号 ${msisdn}` }, 404);

  const requests = await db.select().from(ordersRefundRequests).where(eq(ordersRefundRequests.phone, msisdn)).all();
  const sorted = requests.sort((a, b) => b.requested_at.localeCompare(a.requested_at));

  return c.json({
    success: true,
    msisdn,
    count: sorted.length,
    refund_requests: sorted,
  });
});

app.get("/refund-requests/:refundId", async (c) => {
  const refundId = c.req.param("refundId");
  const request = await db.select().from(ordersRefundRequests).where(eq(ordersRefundRequests.refund_id, refundId)).get();
  if (!request) return c.json({ success: false, message: `未找到退款申请 ${refundId}` }, 404);

  return c.json({
    success: true,
    refund_request: request,
  });
});

app.get("/:orderId", async (c) => {
  const order = await db.select().from(ordersServiceOrders).where(eq(ordersServiceOrders.order_id, c.req.param("orderId"))).get();
  if (!order) return c.json({ success: false, message: `未找到订单 ${c.req.param("orderId")}` }, 404);

  return c.json({
    success: true,
    order,
  });
});

export default app;
