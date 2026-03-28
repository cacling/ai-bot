/**
 * mcp/index.ts — MCP 管理路由汇总（严格 MCP 对齐）
 *
 * - MCP 协议层：servers, tool-management
 * - 实现层：connectors
 * - 聚合视图：tools (overview)
 */
import { Hono } from 'hono';
import servers from './servers';
import toolsOverview from './tools-overview';
import toolManagement from './tool-management';
import connectorRoutes from './connectors';
import executionRecords from './execution-records';

const mcp = new Hono();

mcp.route('/servers', servers);
mcp.route('/connectors', connectorRoutes);
mcp.route('/tool-management', toolManagement);
mcp.route('/tools', toolsOverview);
mcp.route('/execution-records', executionRecords);


export default mcp;
