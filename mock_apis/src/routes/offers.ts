/**
 * offers.ts — 模拟营销活动 / Offer 系统
 */
import { Hono } from "hono";
import { db, subscribers, plans, customerPreferences, offersCampaigns, eq } from "../db.js";

const app = new Hono();

app.get("/eligible", async (c) => {
  const msisdn = c.req.query("msisdn");
  if (!msisdn) return c.json({ success: false, message: "msisdn 不能为空" }, 400);

  const sub = await db.select().from(subscribers).where(eq(subscribers.phone, msisdn)).get();
  if (!sub) return c.json({ success: false, message: `未找到手机号 ${msisdn}` }, 404);

  const prefs = await db.select().from(customerPreferences).where(eq(customerPreferences.phone, msisdn)).get();
  if (prefs?.dnd || prefs?.marketing_opt_in === false) {
    return c.json({
      success: true,
      msisdn,
      eligible: false,
      reason: "customer_in_dnd",
      offers: [],
    });
  }

  if (sub.status !== "active" || sub.overdue_days > 0 || sub.balance < 0) {
    return c.json({
      success: true,
      msisdn,
      eligible: false,
      reason: "subscriber_not_marketable",
      offers: [],
    });
  }

  const plan = await db.select().from(plans).where(eq(plans.plan_id, sub.plan_id)).get();
  const candidates = (await db.select().from(offersCampaigns).all()).filter((campaign) => campaign.status === "active");
  const eligibleOffers = candidates.filter((campaign) => {
    if (campaign.campaign_id === "CMP-UP-100G") {
      return sub.plan_id === "plan_50g" && plan?.data_gb ? sub.data_used_gb / plan.data_gb >= 0.6 : false;
    }
    if (campaign.campaign_id === "CMP-ROAM-001") {
      return sub.region === "深圳" || sub.region === "广州";
    }
    if (campaign.campaign_id === "CMP-FAMILY-001") {
      return sub.plan_id === "plan_unlimited";
    }
    return false;
  });

  return c.json({
    success: true,
    msisdn,
    eligible: eligibleOffers.length > 0,
    offers: eligibleOffers,
  });
});

app.get("/campaigns/:campaignId", async (c) => {
  const campaign = await db.select().from(offersCampaigns).where(eq(offersCampaigns.campaign_id, c.req.param("campaignId"))).get();
  if (!campaign) return c.json({ success: false, message: `未找到活动 ${c.req.param("campaignId")}` }, 404);

  return c.json({
    success: true,
    campaign,
  });
});

export default app;
