/**
 * Shared helpers for MCP tool contract E2E tests
 *
 * Validates tool outputs against JSON Schema files in packages/shared-db/src/schemas/.
 * Uses InMemoryTransport with mocked backends for self-contained testing.
 */
import { mock } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ── Backend mock ─────────────────────────────────────────────────────────────

type MockHandler = (path: string, body?: unknown) => unknown;
let _getMock: MockHandler = () => ({ success: false, message: 'not mocked' });
let _postMock: MockHandler = () => ({ success: false, message: 'not mocked' });

export function mockBackend(handlers: { get?: MockHandler; post?: MockHandler }) {
  if (handlers.get) _getMock = handlers.get;
  if (handlers.post) _postMock = handlers.post;
}

const SHARED_SERVER_PATH = resolve(__dirname, '../../../src/shared/server.ts');
mock.module(SHARED_SERVER_PATH, () => ({
  backendGet: async (path: string) => _getMock(path),
  backendPost: async (path: string, body: unknown) => _postMock(path, body),
  mcpLog: () => {},
  monthLabel: (yyyymm: string) => { const [y, m] = yyyymm.split('-'); return `${y}年${parseInt(m, 10)}月`; },
  startMcpHttpServer: (name: string, _port: number, fn: () => McpServer) => { _captured.set(name, fn); },
  z, McpServer, performance, BACKEND_URL: 'http://mock',
}));

const _captured = new Map<string, () => McpServer>();

export async function loadService(servicePath: string): Promise<() => McpServer> {
  const resolved = resolve(__dirname, '../../../', servicePath);
  await import(resolved);
  const name = servicePath.replace(/.*\//, '').replace(/\.(ts|js)$/, '').replace(/_/g, '-');
  const fn = _captured.get(name);
  if (!fn) throw new Error(`Service ${name} not captured. Have: ${[..._captured.keys()]}`);
  return fn;
}

export async function createTestClient(createServer: () => McpServer): Promise<Client> {
  const server = createServer();
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  const client = new Client({ name: 'contract-test', version: '1.0.0' });
  await client.connect(ct);
  return client;
}

export async function callTool(client: Client, name: string, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as Array<{ type: string; text: string }>)[0]?.text;
  return JSON.parse(text) as Record<string, unknown>;
}

// ── JSON Schema validation ───────────────────────────────────────────────────

const SCHEMA_DIR = resolve(__dirname, '../../../../packages/shared-db/src/schemas');

interface JsonSchema {
  type: string;
  required?: string[];
  properties?: Record<string, { type: string | string[]; enum?: unknown[]; items?: JsonSchema; properties?: Record<string, unknown> }>;
  additionalProperties?: boolean;
}

function loadSchema(toolName: string): JsonSchema {
  const path = resolve(SCHEMA_DIR, `${toolName}.json`);
  return JSON.parse(readFileSync(path, 'utf-8')) as JsonSchema;
}

/**
 * Validate that `data` conforms to the output schema for `toolName`.
 * Returns an array of error messages (empty = valid).
 */
export function validateSchema(toolName: string, data: Record<string, unknown>): string[] {
  const schema = loadSchema(toolName);
  const errors: string[] = [];

  // Check required fields
  for (const field of schema.required ?? []) {
    if (!(field in data) || data[field] === undefined) {
      errors.push(`missing required field: ${field}`);
    }
  }

  // Check property types
  for (const [key, propSchema] of Object.entries(schema.properties ?? {})) {
    if (!(key in data)) continue;
    const val = data[key];

    // Handle nullable types like ["string", "null"]
    const types = Array.isArray(propSchema.type) ? propSchema.type : [propSchema.type];
    if (val === null) {
      if (!types.includes('null')) errors.push(`${key}: null not allowed`);
      continue;
    }

    const jsType = typeof val;
    const valid = types.some(t => {
      if (t === 'string') return jsType === 'string';
      if (t === 'number' || t === 'integer') return jsType === 'number';
      if (t === 'boolean') return jsType === 'boolean';
      if (t === 'array') return Array.isArray(val);
      if (t === 'object') return jsType === 'object' && !Array.isArray(val);
      return false;
    });
    if (!valid) errors.push(`${key}: expected ${types.join('|')}, got ${jsType}`);

    // Check enum values
    if (propSchema.enum && val !== null) {
      if (!propSchema.enum.includes(val)) {
        errors.push(`${key}: value "${val}" not in enum [${propSchema.enum.join(', ')}]`);
      }
    }
  }

  // Check additionalProperties
  if (schema.additionalProperties === false) {
    const allowed = new Set(Object.keys(schema.properties ?? {}));
    for (const key of Object.keys(data)) {
      if (!allowed.has(key)) errors.push(`unexpected field: ${key}`);
    }
  }

  return errors;
}
