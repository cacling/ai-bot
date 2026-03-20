/**
 * mcp/index.ts — MCP 管理路由汇总
 */
import { Hono } from 'hono';
import servers from './servers';
import toolsOverview from './tools-overview';
import resources from './resources';
import toolManagement from './tool-management';

const mcp = new Hono();

mcp.route('/servers', servers);
mcp.route('/resources', resources);
mcp.route('/tool-management', toolManagement);
mcp.route('/tools', toolsOverview); // 旧接口保留（tools-overview 聚合视图）

export default mcp;
