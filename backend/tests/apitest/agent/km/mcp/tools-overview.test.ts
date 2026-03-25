/**
 * API tests for: src/agent/km/mcp/tools-overview.ts
 * Routes: GET /api/mcp/tools
 * Mock: db(mcpServers, mcpTools), skills(getToolToSkillsMap)
 */
import { describe, test, expect, mock } from 'bun:test';

describe('GET /api/mcp/tools', () => {
  test.skip('returns tool overview list with server and skill mapping', async () => {});
  test.skip('each tool has name, description, server_name, skill_names', async () => {});
  test.skip('includes disabled tools with enabled:false flag', async () => {});
});
