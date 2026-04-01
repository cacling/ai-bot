/**
 * Seed 数据完整性集成测试
 *
 * 用临时 SQLite 执行完整 seed 流程，验证种子数据的：
 * - 引用完整性（FK 不断链）
 * - 契约完整性（output_schema 覆盖 + 文件存在 + 格式合法）
 * - 业务规则正确性（adapter-connector 匹配、server kind 一致性等）
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { existsSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { $ } from 'bun';

// ── Setup: 用临时 DB 执行 seed ────────────────────────────────────────────

const TMP_DB = `/tmp/seed-integrity-test-${Date.now()}.db`;
const PROJECT_ROOT = join(import.meta.dir, '../../..');  // workspace/ai-bot/
const BACKEND_DIR = join(PROJECT_ROOT, 'backend');
const KM_SERVICE_DIR = join(PROJECT_ROOT, 'km_service');

let sqliteDb: Database;

beforeAll(async () => {
  // 1. push km_service schema (includes platform + km tables in one DB)
  const push = await $`SQLITE_PATH=${TMP_DB} bunx drizzle-kit push --force`
    .cwd(KM_SERVICE_DIR).quiet().nothrow();
  if (push.exitCode !== 0) throw new Error(`drizzle-kit push failed: ${push.stderr}`);

  // 2. run seed (SQLITE_PATH for km.db tables, PLATFORM_DB_PATH for platform tables)
  const seed = await $`SQLITE_PATH=${TMP_DB} PLATFORM_DB_PATH=${TMP_DB} bun run src/db/seed.ts`
    .cwd(BACKEND_DIR).quiet().nothrow();
  if (seed.exitCode !== 0) throw new Error(`seed failed: ${seed.stderr}`);

  sqliteDb = new Database(TMP_DB, { readonly: true });
}, 30_000);

afterAll(() => {
  sqliteDb?.close();
  try { unlinkSync(TMP_DB); } catch { /* ignore */ }
});

// ── Helpers ────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;
const query = (sql: string): Row[] => sqliteDb.query(sql).all() as Row[];
const queryOne = (sql: string): Row | null => (sqliteDb.query(sql).get() as Row) ?? null;

// ── 第一层：引用完整性 ────────────────────────────────────────────────────

describe('引用完整性', () => {
  test('每个 mcpTools.server_id 在 mcpServers 中存在', () => {
    const orphans = query(`
      SELECT t.id, t.name, t.server_id FROM mcp_tools t
      LEFT JOIN mcp_servers s ON t.server_id = s.id
      WHERE s.id IS NULL
    `);
    expect(orphans).toEqual([]);
  });

  test('每个 toolImplementations.tool_id 在 mcpTools 中存在', () => {
    const orphans = query(`
      SELECT i.id, i.tool_id FROM tool_implementations i
      LEFT JOIN mcp_tools t ON i.tool_id = t.id
      WHERE t.id IS NULL
    `);
    expect(orphans).toEqual([]);
  });

  test('每个 toolImplementations.host_server_id 在 mcpServers 中存在', () => {
    const orphans = query(`
      SELECT i.id, i.host_server_id FROM tool_implementations i
      LEFT JOIN mcp_servers s ON i.host_server_id = s.id
      WHERE s.id IS NULL
    `);
    expect(orphans).toEqual([]);
  });

  test('每个非空 connector_id 在 connectors 中存在', () => {
    const orphans = query(`
      SELECT i.id, i.connector_id FROM tool_implementations i
      LEFT JOIN connectors c ON i.connector_id = c.id
      WHERE i.connector_id IS NOT NULL AND c.id IS NULL
    `);
    expect(orphans).toEqual([]);
  });

  test('每个 skillToolBindings.tool_name 在 mcpTools.name 中存在', () => {
    const orphans = query(`
      SELECT b.skill_id, b.tool_name FROM skill_tool_bindings b
      LEFT JOIN mcp_tools t ON b.tool_name = t.name
      WHERE t.name IS NULL
    `);
    expect(orphans).toEqual([]);
  });
});

// ── 第二层：契约完整性 ────────────────────────────────────────────────────

describe('契约完整性', () => {
  test('每个有 implementation 的 tool 都有 output_schema', () => {
    const missing = query(`
      SELECT t.name FROM mcp_tools t
      INNER JOIN tool_implementations i ON i.tool_id = t.id
      WHERE t.output_schema IS NULL AND t.disabled = 0
    `);
    if (missing.length > 0) {
      const names = missing.map(r => r.name).join(', ');
      expect(missing).toEqual([]); // fail with readable message
      throw new Error(`Tools with implementation but no output_schema: ${names}`);
    }
    expect(missing).toEqual([]);
  });

  test('每个 output_schema 路径指向的 JSON 文件真实存在', () => {
    const tools = query(`SELECT name, output_schema FROM mcp_tools WHERE output_schema IS NOT NULL`);
    expect(tools.length).toBeGreaterThan(0);

    const missingFiles: string[] = [];
    for (const t of tools) {
      const fullPath = join(PROJECT_ROOT, t.output_schema as string);
      if (!existsSync(fullPath)) {
        missingFiles.push(`${t.name} → ${t.output_schema}`);
      }
    }
    expect(missingFiles).toEqual([]);
  });

  test('每个 schema JSON 可解析且有 type 和 properties', () => {
    const tools = query(`SELECT name, output_schema FROM mcp_tools WHERE output_schema IS NOT NULL`);

    const invalid: string[] = [];
    for (const t of tools) {
      const fullPath = join(PROJECT_ROOT, t.output_schema as string);
      if (!existsSync(fullPath)) continue; // 上一个 test 已覆盖
      try {
        const schema = JSON.parse(readFileSync(fullPath, 'utf-8'));
        if (!schema.type || !schema.properties) {
          invalid.push(`${t.name}: missing type or properties`);
        }
      } catch (e) {
        invalid.push(`${t.name}: JSON parse error — ${e}`);
      }
    }
    expect(invalid).toEqual([]);
  });

  test('每个非 disabled 的 tool 都有 input_schema', () => {
    const missing = query(`
      SELECT name FROM mcp_tools WHERE disabled = 0 AND input_schema IS NULL
    `);
    expect(missing).toEqual([]);
  });
});

// ── 第三层：业务规则正确性 ────────────────────────────────────────────────

describe('业务规则正确性', () => {
  test('script/api_proxy adapter 必须有 connector_id', () => {
    const violations = query(`
      SELECT i.id, t.name, i.adapter_type FROM tool_implementations i
      JOIN mcp_tools t ON i.tool_id = t.id
      WHERE i.adapter_type IN ('script', 'api_proxy')
        AND i.connector_id IS NULL
    `);
    if (violations.length > 0) {
      const names = violations.map(r => `${r.name}(${r.adapter_type})`).join(', ');
      throw new Error(`adapter needs connector but connector_id is NULL: ${names}`);
    }
    expect(violations).toEqual([]);
  });

  test('remote_mcp adapter 必须无 connector_id', () => {
    const violations = query(`
      SELECT i.id, t.name FROM tool_implementations i
      JOIN mcp_tools t ON i.tool_id = t.id
      WHERE i.adapter_type = 'remote_mcp' AND i.connector_id IS NOT NULL
    `);
    expect(violations).toEqual([]);
  });

  test('external server 的工具 adapter_type 应为 remote_mcp', () => {
    const violations = query(`
      SELECT t.name, i.adapter_type, s.kind FROM tool_implementations i
      JOIN mcp_tools t ON i.tool_id = t.id
      JOIN mcp_servers s ON i.host_server_id = s.id
      WHERE s.kind = 'external' AND i.adapter_type != 'remote_mcp'
    `);
    expect(violations).toEqual([]);
  });

  test('同一 skill 内 call_order 不重复', () => {
    const duplicates = query(`
      SELECT skill_id, call_order, COUNT(*) as cnt
      FROM skill_tool_bindings
      GROUP BY skill_id, call_order
      HAVING cnt > 1
    `);
    expect(duplicates).toEqual([]);
  });

  test('api 类型 connector 的 config 包含 base_url', () => {
    const connectors = query(`SELECT id, name, type, config FROM connectors WHERE type = 'api'`);
    const invalid: string[] = [];
    for (const c of connectors) {
      if (!c.config) {
        invalid.push(`${c.name}: config is null`);
        continue;
      }
      try {
        const cfg = JSON.parse(c.config as string);
        if (!cfg.base_url) invalid.push(`${c.name}: missing base_url`);
      } catch {
        invalid.push(`${c.name}: config is not valid JSON`);
      }
    }
    expect(invalid).toEqual([]);
  });

  test('mcpServers.kind 值合法 (internal/external/planned)', () => {
    const invalid = query(`
      SELECT id, name, kind FROM mcp_servers
      WHERE kind NOT IN ('internal', 'external', 'planned')
    `);
    expect(invalid).toEqual([]);
  });

  test('connectors.type 值合法 (db/api)', () => {
    const invalid = query(`
      SELECT id, name, type FROM connectors
      WHERE type NOT IN ('db', 'api')
    `);
    expect(invalid).toEqual([]);
  });

  test('disabled 工具不应有 skill binding', () => {
    const violations = query(`
      SELECT b.skill_id, b.tool_name FROM skill_tool_bindings b
      JOIN mcp_tools t ON b.tool_name = t.name
      WHERE t.disabled = 1
    `);
    expect(violations).toEqual([]);
  });
});
