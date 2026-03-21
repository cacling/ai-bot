/**
 * Mock APIs Server — 模拟外部业务系统 REST API
 *
 * 提供：身份验证、发票开具、回访任务创建
 * Port: 18008（可通过 PORT env 覆盖）
 */
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import identity from "./routes/identity.js";
import invoice from "./routes/invoice.js";
import callback from "./routes/callback.js";

const app = new Hono();

// 健康检查
app.get("/health", (c) => c.json({ status: "ok", service: "mock-apis" }));

// 路由挂载
app.route("/api/identity", identity);
app.route("/api/invoice", invoice);
app.route("/api/callback", callback);

const port = Number(process.env.PORT ?? 18008);
console.log(`[mock-apis] Starting on port ${port}...`);
serve({ fetch: app.fetch, port }, () => {
  console.log(`[mock-apis] http://0.0.0.0:${port}`);
});
