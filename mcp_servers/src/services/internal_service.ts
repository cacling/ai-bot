/**
 * internal-service — 统一 MCP Server（:18003）
 *
 * 合并 5 个业务域 MCP Server 为单进程，所有 tool name 不变。
 * 各域的领域规则和工具注册逻辑仍保留在各自文件中。
 */
import { McpServer, startMcpHttpServer } from "../shared/server.js";
import { registerUserInfoTools } from "../tools/user_info_tools.js";
import { registerBusinessTools } from "../tools/business_tools.js";
import { registerDiagnosisTools } from "../tools/diagnosis_tools.js";
import { registerOutboundTools } from "../tools/outbound_tools.js";
import { registerAccountTools } from "../tools/account_tools.js";

function createServer(): McpServer {
  const server = new McpServer({ name: "internal-service", version: "2.0.0" });
  registerUserInfoTools(server);
  registerBusinessTools(server);
  registerDiagnosisTools(server);
  registerOutboundTools(server);
  registerAccountTools(server);
  return server;
}

startMcpHttpServer("internal-service", Number(process.env.MCP_INTERNAL_PORT ?? 18003), createServer);
