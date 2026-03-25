/**
 * API tests for: src/agent/km/mcp/servers.ts
 * Routes: GET/POST/PUT/DELETE /api/mcp/servers, POST discover/health/invoke/mock-invoke
 * Mock: db(mcpServers, mcpTools), MCP(Client, StreamableHTTPClientTransport), mock-engine
 */
import { describe, test, expect, mock } from 'bun:test';

describe('GET /api/mcp/servers', () => {
  test.skip('returns server list from db', async () => {});
});

describe('POST /api/mcp/servers', () => {
  test.skip('creates server with name, url, port', async () => {});
  test.skip('returns 400 when name is missing', async () => {});
});

describe('GET /api/mcp/servers/:id', () => {
  test.skip('returns server detail', async () => {});
  test.skip('returns 404 for non-existent server', async () => {});
});

describe('PUT /api/mcp/servers/:id', () => {
  test.skip('updates server configuration', async () => {});
});

describe('DELETE /api/mcp/servers/:id', () => {
  test.skip('deletes server and associated tools', async () => {});
});

describe('POST /api/mcp/servers/:id/discover', () => {
  test.skip('connects to MCP server and discovers tools', async () => {});
  test.skip('upserts discovered tools into db', async () => {});
  test.skip('returns error when server is unreachable', async () => {});
});

describe('GET /api/mcp/servers/:id/health', () => {
  test.skip('returns ok when server is healthy', async () => {});
  test.skip('returns error when server is down', async () => {});
});

describe('POST /api/mcp/servers/:id/invoke', () => {
  test.skip('invokes tool on real MCP server and returns result', async () => {});
  test.skip('uses mock-engine when tool has useMock:true', async () => {});
  test.skip('returns error for unknown tool', async () => {});
});

describe('POST /api/mcp/servers/:id/mock-invoke', () => {
  test.skip('always uses mock-engine regardless of useMock setting', async () => {});
  test.skip('returns mock result matching rule', async () => {});
});
