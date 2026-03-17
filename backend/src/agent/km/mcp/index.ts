/**
 * mcp/index.ts — MCP 管理路由汇总
 */
import { Hono } from 'hono';
import servers from './servers';
import toolsOverview from './tools-overview';

const mcp = new Hono();

mcp.route('/servers', servers);
mcp.route('/tools', toolsOverview);

export default mcp;
