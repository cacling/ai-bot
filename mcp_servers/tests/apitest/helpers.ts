/**
 * Shared test helpers for MCP Server apitest
 *
 * Strategy: mock shared/server.js to capture createServer callback
 * when the service module is imported, then use InMemoryTransport to test.
 */
import { mock } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { performance } from 'node:perf_hooks';

// ── Backend mock store ───────────────────────────────────────────────────────

type MockHandler = (path: string, body?: unknown) => unknown;

let _getMock: MockHandler = () => { throw new Error('backendGet not mocked'); };
let _postMock: MockHandler = () => { throw new Error('backendPost not mocked'); };

export function mockBackend(handlers: { get?: MockHandler; post?: MockHandler }) {
  if (handlers.get) _getMock = handlers.get;
  if (handlers.post) _postMock = handlers.post;
}

// ── Captured createServer callbacks ──────────────────────────────────────────

const captured = new Map<string, () => McpServer>();

function monthLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split('-');
  return `${y}年${parseInt(m, 10)}月`;
}

// Mock the shared server module — intercepts startMcpHttpServer to capture createServer
// Use resolved absolute path so Bun matches the import from any depth
const SHARED_SERVER_PATH = require('path').resolve(__dirname, '../../src/shared/server.ts');
mock.module(SHARED_SERVER_PATH, () => ({
  backendGet: async (path: string) => _getMock(path),
  backendPost: async (path: string, body: unknown) => _postMock(path, body),
  mcpLog: () => {},
  monthLabel,
  startMcpHttpServer: (name: string, _port: number, createServer: () => McpServer) => {
    captured.set(name, createServer);
  },
  z,
  McpServer,
  performance,
  BACKEND_URL: 'http://mock',
}));

/** Import a service module and return its captured createServer function */
export async function loadService(servicePath: string): Promise<() => McpServer> {
  // Resolve relative to mcp_servers/ root
  const resolved = require('path').resolve(__dirname, '../../', servicePath);
  await import(resolved);
  // Service name is derived from the file name (e.g. user_info_service → user-info-service)
  const name = servicePath.replace(/.*\//, '').replace(/\.(ts|js)$/, '').replace(/_/g, '-');
  const fn = captured.get(name);
  if (!fn) throw new Error(`Service ${name} did not register via startMcpHttpServer. Captured: ${[...captured.keys()].join(', ')}`);
  return fn;
}

// ── Client setup ─────────────────────────────────────────────────────────────

export async function createTestClient(createServer: () => McpServer): Promise<Client> {
  const server = createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(clientTransport);
  return client;
}

// ── Tool call helper ─────────────────────────────────────────────────────────

export async function callTool(client: Client, name: string, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as Array<{ type: string; text: string }>)[0]?.text;
  return JSON.parse(text) as Record<string, unknown>;
}
