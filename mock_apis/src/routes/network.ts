/**
 * network.ts — 模拟网络运营系统
 */
import { Hono } from "hono";
import { db, subscribers, networkIncidents, eq } from "../db.js";

const app = new Hono();

app.get("/incidents", async (c) => {
  const region = c.req.query("region") ?? undefined;
  const status = c.req.query("status") ?? undefined;
  const rows = await db.select().from(networkIncidents).all();
  const incidents = rows.filter((incident) => {
    if (region && incident.region !== region && incident.region !== "全国") return false;
    if (status && incident.status !== status) return false;
    return true;
  }).map((incident) => ({
    ...incident,
    affected_services: JSON.parse(incident.affected_services),
  }));
  return c.json({ success: true, count: incidents.length, incidents });
});

app.get("/subscribers/:msisdn/diagnostics", async (c) => {
  const msisdn = c.req.param("msisdn");
  const issueType = c.req.query("issue_type") ?? null;
  const sub = await db.select().from(subscribers).where(eq(subscribers.phone, msisdn)).get();
  if (!sub) return c.json({ success: false, message: `未找到手机号 ${msisdn}` }, 404);

  const rows = await db.select().from(networkIncidents).all();
  const incidents = rows.filter((incident) => {
    if (sub.region && incident.region !== sub.region && incident.region !== "全国") return false;
    if (!issueType) return true;
    if (issueType === "slow_data") return incident.incident_type === "congestion";
    if (issueType === "no_network") return incident.incident_type === "outage";
    return true;
  }).map((incident) => ({
    ...incident,
    affected_services: JSON.parse(incident.affected_services),
  }));

  return c.json({
    success: true,
    msisdn,
    region: sub.region,
    issue_type: issueType,
    network_status: incidents.some((incident) => incident.status === "open") ? "degraded" : "normal",
    open_incidents: incidents,
    recommended_action: incidents.length > 0
      ? "当前区域存在网络侧异常，建议向客户说明并持续观察。"
      : "未发现区域级异常，可继续做终端排查。",
  });
});

export default app;
