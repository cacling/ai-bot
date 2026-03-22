/**
 * catalog.ts — 模拟产品目录系统
 */
import { Hono } from "hono";
import { db, plans, valueAddedServices, eq } from "../db.js";

const app = new Hono();

function parseFeatures(raw: string) {
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

app.get("/plans", async (c) => {
  const rows = await db.select().from(plans).all();
  return c.json({
    success: true,
    count: rows.length,
    plans: rows.map((plan) => ({
      ...plan,
      features: parseFeatures(plan.features),
    })),
  });
});

app.get("/plans/:planId", async (c) => {
  const planId = c.req.param("planId");
  const plan = await db.select().from(plans).where(eq(plans.plan_id, planId)).get();
  if (!plan) return c.json({ success: false, message: `未找到套餐 ${planId}` }, 404);

  return c.json({
    success: true,
    plan: {
      ...plan,
      features: parseFeatures(plan.features),
    },
  });
});

app.get("/value-added-services", async (c) => {
  const rows = await db.select().from(valueAddedServices).all();
  return c.json({
    success: true,
    count: rows.length,
    services: rows,
  });
});

export default app;
