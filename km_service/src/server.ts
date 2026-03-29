/**
 * KM Service — 知识管理独立服务
 *
 * 提供知识文档、候选、审批、资产、MCP 管理、Skills 管理的 REST API
 */
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import kmRoutes from "./routes/index";
import mcpRoutes from "./mcp/index";
import filesRoutes from "./skills/files";
import skillsRoutes from "./skills/skills";
import skillVersionsRoute from "./skills/skill-versions";
import sandboxRoutes from "./skills/sandbox";
import skillEditRoutes from "./skills/skill-edit";
import canaryRoutes from "./skills/canary";
import changeRequestRoutes from "./skills/change-requests";
import testCaseRoutes from "./skills/test-cases";
import skillCreatorRoutes from "./skills/skill-creator";
import toolBindingsRoutes from "./skills/tool-bindings";

export function createApp() {
  const app = new Hono();

  app.get("/health", (c) => c.json({
    status: "ok",
    service: "km-service",
    modules: [
      "documents",
      "candidates",
      "evidence",
      "conflicts",
      "review-packages",
      "action-drafts",
      "assets",
      "audit",
      "reply-copilot",
      "agent-copilot",
      "retrieval-eval",
      "feedback-dashboard",
      "mcp",
      "skills",
    ],
  }));

  // KM 核心路由
  app.route('/api/km', kmRoutes);

  // MCP 管理路由
  app.route('/api/mcp', mcpRoutes);

  // Skills 管理路由
  app.route('/api/files', filesRoutes);
  app.route('/api/skills', skillsRoutes);
  app.route('/api/skills', toolBindingsRoutes);
  app.route('/api/skill-versions', skillVersionsRoute);
  app.route('/api/sandbox', sandboxRoutes);
  app.route('/api/skill-edit', skillEditRoutes);
  app.route('/api/canary', canaryRoutes);
  app.route('/api/change-requests', changeRequestRoutes);
  app.route('/api/test-cases', testCaseRoutes);
  app.route('/api/skill-creator', skillCreatorRoutes);

  return app;
}

export function startServer(port = Number(process.env.KM_SERVICE_PORT ?? 18010)) {
  const app = createApp();
  console.log(`[km-service] Starting on port ${port}...`);
  return serve({ fetch: app.fetch, port }, () => {
    console.log(`[km-service] http://0.0.0.0:${port}`);
  });
}

const entryFile = process.argv[1]?.replaceAll("\\", "/");
if (entryFile && import.meta.url.endsWith(entryFile)) {
  startServer();
}
