/**
 * customer.ts — 模拟客户中心 / Customer 360
 */
import { Hono } from "hono";
import {
  db,
  subscribers,
  plans,
  subscriberSubscriptions,
  valueAddedServices,
  contracts,
  customerPreferences,
  customerHouseholds,
  eq,
} from "../db.js";

const app = new Hono();

function parseFeatures(raw: string) {
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

app.get("/subscribers/:msisdn", async (c) => {
  const msisdn = c.req.param("msisdn");
  const sub = await db.select().from(subscribers).where(eq(subscribers.phone, msisdn)).get();
  if (!sub) return c.json({ success: false, message: `未找到手机号 ${msisdn}` }, 404);

  const plan = await db.select().from(plans).where(eq(plans.plan_id, sub.plan_id)).get();
  const prefs = await db.select().from(customerPreferences).where(eq(customerPreferences.phone, msisdn)).get();
  const household = sub.household_id
    ? await db.select().from(customerHouseholds).where(eq(customerHouseholds.household_id, sub.household_id)).get()
    : null;

  return c.json({
    success: true,
    subscriber: {
      msisdn: sub.phone,
      name: sub.name,
      customer_tier: sub.customer_tier,
      preferred_language: sub.preferred_language,
      status: sub.status,
      region: sub.region,
      email: sub.email,
      balance: sub.balance,
      overdue_days: sub.overdue_days,
      activated_at: sub.activated_at,
      household,
      plan: plan ? {
        plan_id: plan.plan_id,
        name: plan.name,
        plan_type: plan.plan_type,
        speed_tier: plan.speed_tier,
        is_shareable: plan.is_shareable,
        monthly_fee: plan.monthly_fee,
        data_gb: plan.data_gb,
        voice_min: plan.voice_min,
        sms: plan.sms,
        features: parseFeatures(plan.features),
      } : null,
      preferences: prefs,
    },
  });
});

// A2: 账户余额摘要（MCP Server check_account_balance 使用）
app.get("/subscribers/:msisdn/account-summary", async (c) => {
  const msisdn = c.req.param("msisdn");
  const sub = await db.select().from(subscribers).where(eq(subscribers.phone, msisdn)).get();
  if (!sub) return c.json({ success: false, message: `未找到手机号 ${msisdn}` }, 404);

  const plan = await db.select().from(plans).where(eq(plans.plan_id, sub.plan_id)).get();
  return c.json({
    success: true,
    msisdn,
    balance: sub.balance,
    status: sub.status,
    has_arrears: sub.balance < 0,
    arrears_amount: sub.balance < 0 ? Math.abs(sub.balance) : 0,
    overdue_days: sub.overdue_days,
    plan_name: plan?.name ?? null,
    plan_fee: plan?.monthly_fee ?? 0,
    data_used_gb: sub.data_used_gb,
    data_total_gb: plan?.data_gb ?? 0,
    voice_used_min: sub.voice_used_min,
    voice_total_min: plan?.voice_min ?? 0,
  });
});

app.get("/subscribers/:msisdn/preferences", async (c) => {
  const msisdn = c.req.param("msisdn");
  const sub = await db.select().from(subscribers).where(eq(subscribers.phone, msisdn)).get();
  if (!sub) return c.json({ success: false, message: `未找到手机号 ${msisdn}` }, 404);

  const prefs = await db.select().from(customerPreferences).where(eq(customerPreferences.phone, msisdn)).get();
  return c.json({
    success: true,
    msisdn,
    preferences: prefs,
  });
});

app.get("/subscribers/:msisdn/contracts", async (c) => {
  const msisdn = c.req.param("msisdn");
  const sub = await db.select().from(subscribers).where(eq(subscribers.phone, msisdn)).get();
  if (!sub) return c.json({ success: false, message: `未找到手机号 ${msisdn}` }, 404);

  const rows = await db.select().from(contracts).where(eq(contracts.phone, msisdn)).all();
  return c.json({
    success: true,
    msisdn,
    count: rows.length,
    contracts: rows,
  });
});

app.get("/subscribers/:msisdn/services", async (c) => {
  const msisdn = c.req.param("msisdn");
  const sub = await db.select().from(subscribers).where(eq(subscribers.phone, msisdn)).get();
  if (!sub) return c.json({ success: false, message: `未找到手机号 ${msisdn}` }, 404);

  const links = await db.select().from(subscriberSubscriptions).where(eq(subscriberSubscriptions.phone, msisdn)).all();
  const services = await db.select().from(valueAddedServices).all();
  const serviceMap = new Map(services.map((service) => [service.service_id, service]));
  const serviceRows = links.flatMap((link) => {
    const service = serviceMap.get(link.service_id);
    if (!service) return [];
    return [{
      ...service,
      status: link.status,
      channel: link.channel,
      subscribed_at: link.subscribed_at,
      effective_start: link.effective_start,
      effective_end: link.effective_end ?? service.effective_end,
      auto_renew: link.auto_renew,
      order_id: link.order_id,
    }];
  });

  return c.json({
    success: true,
    msisdn,
    count: links.length,
    services: serviceRows,
  });
});

app.get("/subscribers/:msisdn/household", async (c) => {
  const msisdn = c.req.param("msisdn");
  const sub = await db.select().from(subscribers).where(eq(subscribers.phone, msisdn)).get();
  if (!sub) return c.json({ success: false, message: `未找到手机号 ${msisdn}` }, 404);

  if (!sub.household_id) {
    return c.json({
      success: true,
      msisdn,
      household: null,
      members: [],
    });
  }

  const household = await db.select().from(customerHouseholds).where(eq(customerHouseholds.household_id, sub.household_id)).get();
  const members = await db.select().from(subscribers).where(eq(subscribers.household_id, sub.household_id)).all();
  return c.json({
    success: true,
    msisdn,
    household,
    members: members.map((member) => ({
      msisdn: member.phone,
      name: member.name,
      customer_tier: member.customer_tier,
      status: member.status,
      plan_id: member.plan_id,
    })),
  });
});

app.get("/subscribers/:msisdn/subscription-history", async (c) => {
  const msisdn = c.req.param("msisdn");
  const sub = await db.select().from(subscribers).where(eq(subscribers.phone, msisdn)).get();
  if (!sub) return c.json({ success: false, message: `未找到手机号 ${msisdn}` }, 404);

  const rows = await db.select().from(subscriberSubscriptions).where(eq(subscriberSubscriptions.phone, msisdn)).all();
  return c.json({
    success: true,
    msisdn,
    count: rows.length,
    subscription_history: rows,
  });
});

export default app;
