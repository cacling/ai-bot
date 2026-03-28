/**
 * appointments.ts — 预约路由（§7.4）
 */
import { Hono } from "hono";
import {
  confirmAppointment,
  rescheduleAppointment,
  checkInAppointment,
  startAppointment,
  completeAppointment,
  noShowAppointment,
  cancelAppointment,
} from "../services/appointment-service.js";

const app = new Hono();

/** POST /:id/confirm */
app.post("/:id/confirm", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ resource_id?: string; actor?: string }>().catch(() => ({}));
  const result = await confirmAppointment(id, body);
  if (!result.success) return c.json({ error: result.error }, 400);
  return c.json({ ok: true });
});

/** POST /:id/reschedule */
app.post("/:id/reschedule", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{
    scheduled_start_at: string;
    scheduled_end_at?: string;
    reason?: string;
    actor?: string;
  }>();

  if (!body.scheduled_start_at) return c.json({ error: "scheduled_start_at 不能为空" }, 400);

  const result = await rescheduleAppointment(id, body);
  if (!result.success) return c.json({ error: result.error }, 400);
  return c.json({ ok: true });
});

/** POST /:id/check-in */
app.post("/:id/check-in", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ actor?: string }>().catch(() => ({}));
  const result = await checkInAppointment(id, body.actor);
  if (!result.success) return c.json({ error: result.error }, 400);
  return c.json({ ok: true });
});

/** POST /:id/start — checked_in → in_service */
app.post("/:id/start", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ actor?: string }>().catch(() => ({}));
  const result = await startAppointment(id, body.actor);
  if (!result.success) return c.json({ error: result.error }, 400);
  return c.json({ ok: true });
});

/** POST /:id/complete */
app.post("/:id/complete", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ actor?: string }>().catch(() => ({}));
  const result = await completeAppointment(id, body.actor);
  if (!result.success) return c.json({ error: result.error }, 400);
  return c.json({ ok: true });
});

/** POST /:id/no-show */
app.post("/:id/no-show", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ reason?: string; actor?: string }>().catch(() => ({}));
  const result = await noShowAppointment(id, body);
  if (!result.success) return c.json({ error: result.error }, 400);
  return c.json({ ok: true });
});

/** POST /:id/cancel */
app.post("/:id/cancel", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ actor?: string }>().catch(() => ({}));
  const result = await cancelAppointment(id, body.actor);
  if (!result.success) return c.json({ error: result.error }, 400);
  return c.json({ ok: true });
});

export default app;
