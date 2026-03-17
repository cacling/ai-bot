import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mcpApi } from '@/km/mcp/api';

describe('km/mcp/api', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function mockFetchOk(data: unknown) {
    return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(data),
    } as Response);
  }

  describe('listServers', () => {
    it('calls GET /api/mcp/servers', async () => {
      const data = { items: [] };
      const spy = mockFetchOk(data);

      const result = await mcpApi.listServers();
      expect(result).toEqual(data);
      expect(spy.mock.calls[0][0]).toContain('/api/mcp/servers');
    });
  });

  describe('getServer', () => {
    it('calls GET /api/mcp/servers/:id', async () => {
      const spy = mockFetchOk({ id: 's1', name: 'Test Server' });
      await mcpApi.getServer('s1');
      expect(spy.mock.calls[0][0]).toContain('/api/mcp/servers/s1');
    });
  });

  describe('createServer', () => {
    it('sends POST to /api/mcp/servers', async () => {
      const spy = mockFetchOk({ id: 's2' });
      await mcpApi.createServer({ name: 'New Server', transport: 'http' });
      const [url, opts] = spy.mock.calls[0];
      expect(url).toContain('/api/mcp/servers');
      expect((opts as RequestInit).method).toBe('POST');
      const body = JSON.parse((opts as RequestInit).body as string);
      expect(body.name).toBe('New Server');
    });
  });

  describe('updateServer', () => {
    it('sends PUT to /api/mcp/servers/:id', async () => {
      const spy = mockFetchOk({ ok: true });
      await mcpApi.updateServer('s1', { name: 'Updated' });
      const [url, opts] = spy.mock.calls[0];
      expect(url).toContain('/api/mcp/servers/s1');
      expect((opts as RequestInit).method).toBe('PUT');
    });
  });

  describe('deleteServer', () => {
    it('sends DELETE to /api/mcp/servers/:id', async () => {
      const spy = mockFetchOk({ ok: true });
      await mcpApi.deleteServer('s1');
      const [url, opts] = spy.mock.calls[0];
      expect(url).toContain('/api/mcp/servers/s1');
      expect((opts as RequestInit).method).toBe('DELETE');
    });
  });

  describe('discoverTools', () => {
    it('sends POST to /api/mcp/servers/:id/discover', async () => {
      const spy = mockFetchOk({ tools: [] });
      await mcpApi.discoverTools('s1');
      const [url, opts] = spy.mock.calls[0];
      expect(url).toContain('/api/mcp/servers/s1/discover');
      expect((opts as RequestInit).method).toBe('POST');
    });
  });

  describe('invokeTool', () => {
    it('sends POST with tool_name and arguments', async () => {
      const spy = mockFetchOk({ result: 'ok', elapsed_ms: 42 });
      await mcpApi.invokeTool('s1', 'my-tool', { param1: 'value' });
      const [url, opts] = spy.mock.calls[0];
      expect(url).toContain('/api/mcp/servers/s1/invoke');
      const body = JSON.parse((opts as RequestInit).body as string);
      expect(body.tool_name).toBe('my-tool');
      expect(body.arguments).toEqual({ param1: 'value' });
    });
  });

  describe('mockInvokeTool', () => {
    it('sends POST to mock-invoke endpoint', async () => {
      const spy = mockFetchOk({ result: 'mocked', elapsed_ms: 1, mock: true, matched_rule: 'default' });
      await mcpApi.mockInvokeTool('s1', 'my-tool', { param1: 'value' });
      const [url, opts] = spy.mock.calls[0];
      expect(url).toContain('/api/mcp/servers/s1/mock-invoke');
      expect((opts as RequestInit).method).toBe('POST');
    });
  });

  describe('getToolsOverview', () => {
    it('calls GET /api/mcp/tools', async () => {
      const data = { items: [{ name: 'tool1', description: 'A tool', source: 'mcp', source_type: 'mcp', status: 'available', skills: [] }] };
      const spy = mockFetchOk(data);

      const result = await mcpApi.getToolsOverview();
      expect(result.items).toHaveLength(1);
      expect(spy.mock.calls[0][0]).toContain('/api/mcp/tools');
    });
  });

  describe('error handling', () => {
    it('throws error from response body', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'Bad request' }),
      } as Response);
      await expect(mcpApi.listServers()).rejects.toThrow('Bad request');
    });

    it('throws HTTP status fallback', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 503,
        json: () => Promise.resolve({}),
      } as Response);
      await expect(mcpApi.listServers()).rejects.toThrow('HTTP 503');
    });
  });
});
