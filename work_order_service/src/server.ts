/**
 * Work Order Service — 工单系统独立服务
 *
 * 提供工单、预约、模板、队列的 REST API
 */
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import workItemRoutes from "./routes/work-items.js";
import workOrderRoutes from "./routes/work-orders.js";
import appointmentRoutes from "./routes/appointments.js";
import templateRoutes from "./routes/templates.js";
import ticketRoutes from "./routes/tickets.js";
import taskRoutes from "./routes/tasks.js";
import workflowRoutes from "./routes/workflows.js";
import categoryRoutes from "./routes/categories.js";

export function createApp() {
  const app = new Hono();

  app.get("/health", (c) => c.json({
    status: "ok",
    service: "work-order-service",
    modules: [
      "work-items",
      "work-orders",
      "appointments",
      "templates",
      "tickets",
      "tasks",
      "workflows",
      "categories",
    ],
  }));

  app.route("/api/work-items", workItemRoutes);
  app.route("/api/work-orders", workOrderRoutes);
  app.route("/api/appointments", appointmentRoutes);
  app.route("/api/templates", templateRoutes);
  app.route("/api/tickets", ticketRoutes);
  app.route("/api/tasks", taskRoutes);
  app.route("/api/workflows", workflowRoutes);
  app.route("/api/categories", categoryRoutes);

  return app;
}

export function startServer(port = Number(process.env.PORT ?? 18009)) {
  const app = createApp();
  console.log(`[work-order] Starting on port ${port}...`);
  return serve({ fetch: app.fetch, port }, () => {
    console.log(`[work-order] http://0.0.0.0:${port}`);
  });
}

const entryFile = process.argv[1]?.replaceAll("\\", "/");
if (entryFile && import.meta.url.endsWith(entryFile)) {
  startServer();
}
