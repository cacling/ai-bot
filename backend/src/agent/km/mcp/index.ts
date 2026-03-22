/**
 * mcp/index.ts — MCP 管理路由汇总（严格 MCP 对齐）
 *
 * 三层路由：
 * - MCP 协议层：servers, tool-management, mcp-resources, mcp-prompts
 * - 实现层：connectors
 * - 旧接口：tools (overview 聚合视图)
 */
import { Hono } from 'hono';
import servers from './servers';
import toolsOverview from './tools-overview';
import toolManagement from './tool-management';
import connectorRoutes from './connectors';
import mcpResourcesCatalog from './mcp-resources-catalog';
import mcpPromptsCatalog from './mcp-prompts-catalog';

const mcp = new Hono();

mcp.route('/servers', servers);
mcp.route('/connectors', connectorRoutes);
mcp.route('/tool-management', toolManagement);
mcp.route('/tools', toolsOverview);
mcp.route('/mcp-resources', mcpResourcesCatalog);
mcp.route('/mcp-prompts', mcpPromptsCatalog);

// @deprecated — 旧 /resources 路径别名，指向 connectors 路由
// 前端 McpServerConsole、HealthModule 等仍调用 /resources 端点
// 待前端完全切换到 /connectors API 后删除
mcp.route('/resources', connectorRoutes);

export default mcp;
