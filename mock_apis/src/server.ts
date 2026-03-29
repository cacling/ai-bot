/**
 * Mock APIs Server — 模拟外部业务系统 REST API
 *
 * 当前扮演的 demo backend systems：
 * - identity / risk
 * - billing
 * - invoice
 * - callback / outreach
 * - network ops
 */
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import identity from "./routes/identity.js";
import risk from "./routes/risk.js";
import customer from "./routes/customer.js";
import catalog from "./routes/catalog.js";
import offers from "./routes/offers.js";
import orders from "./routes/orders.js";
import payments from "./routes/payments.js";
import invoice from "./routes/invoice.js";
import callback from "./routes/callback.js";
import billing from "./routes/billing.js";
import network from "./routes/network.js";
import outreach from "./routes/outreach.js";
import diagnosis from "./routes/diagnosis.js";

export function createApp() {
  const app = new Hono();

  app.get("/health", (c) => c.json({
    status: "ok",
    service: "mock-apis",
    systems: [
      "identity",
      "risk",
      "customer",
      "catalog",
      "offers",
      "orders",
      "payments",
      "billing",
      "invoice",
      "callback",
      "outreach",
      "network",
      "diagnosis",
    ],
  }));

  app.route("/api/identity", identity);
  app.route("/api/risk", risk);
  app.route("/api/customer", customer);
  app.route("/api/catalog", catalog);
  app.route("/api/offers", offers);
  app.route("/api/orders", orders);
  app.route("/api/payments", payments);
  app.route("/api/invoice", invoice);
  app.route("/api/callback", callback);
  app.route("/api/billing", billing);
  app.route("/api/network", network);
  app.route("/api/outreach", outreach);
  app.route("/api/diagnosis", diagnosis);

  return app;
}

export function startServer(port = Number(process.env.MOCK_APIS_PORT ?? 18008)) {
  const app = createApp();
  console.log(`[mock-apis] Starting on port ${port}...`);
  return serve({ fetch: app.fetch, port }, () => {
    console.log(`[mock-apis] http://0.0.0.0:${port}`);
  });
}

const entryFile = process.argv[1]?.replaceAll("\\", "/");
if (entryFile && import.meta.url.endsWith(entryFile)) {
  startServer();
}
