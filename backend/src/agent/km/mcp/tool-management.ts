/**
 * mcp/tool-management.ts — MCP 工具独立管理 CRUD
 *
 * GET    /                     — 列出所有工具（支持 server_id 过滤）
 * POST   /                     — 新建工具
 * GET    /:id                  — 获取工具详情
 * PUT    /:id                  — 更新工具
 * DELETE /:id                  — 删除工具
 * PUT    /:id/execution-config — 更新执行配置
 * PUT    /:id/mock-rules       — 更新 Mock 规则
 * PUT    /:id/toggle-mock      — 切换 Mock/Real 模式
 */
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../../../db';
import { mcpTools, mcpResources, mcpServers, toolImplementations, connectors } from '../../../db/schema';
import { nanoid } from '../../../db/nanoid';
import { logger } from '../../../services/logger';
import { REPO_ROOT } from '../../../services/paths';
import { getToolToSkillsMap } from '../../../engine/skills';

const app = new Hono();
const now = () => new Date().toISOString();

// ── List ─────────────────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const serverId = c.req.query('server_id');
  const rows = serverId
    ? db.select().from(mcpTools).where(eq(mcpTools.server_id, serverId)).all()
    : db.select().from(mcpTools).all();

  // 附加 skill 引用 + 资源信息
  const toolSkillsMap = getToolToSkillsMap();
  const allResources = db.select().from(mcpResources).all();
  const resourceMap = new Map(allResources.map(r => [r.id, { id: r.id, name: r.name, type: r.type }]));

  // 预加载所有 schema 文件内容用于对齐检查
  const schemaCache = new Map<string, Record<string, unknown>>();
  const loadSchema = async (schemaPath: string | null): Promise<Record<string, unknown> | null> => {
    if (!schemaPath) return null;
    if (schemaCache.has(schemaPath)) return schemaCache.get(schemaPath)!;
    try {
      if (schemaPath.endsWith('.json')) {
        const { readFileSync, existsSync } = await import('node:fs');
        const { resolve } = await import('node:path');
        const fullPath = resolve(REPO_ROOT,schemaPath);
        if (existsSync(fullPath)) {
          const schema = JSON.parse(readFileSync(fullPath, 'utf-8'));
          schemaCache.set(schemaPath, schema);
          return schema;
        }
      } else {
        const schema = JSON.parse(schemaPath);
        schemaCache.set(schemaPath, schema);
        return schema;
      }
    } catch { /* ignore */ }
    return null;
  };

  const items = await Promise.all(rows.map(async (t) => {
    const cfg = t.execution_config ? JSON.parse(t.execution_config) as { resource_id?: string } : null;
    const resource = cfg?.resource_id ? resourceMap.get(cfg.resource_id) ?? null : null;

    // 轻量对齐检查：第一条 mock vs output_schema
    const risks: string[] = [];
    let mockAligned = true;
    const schema = await loadSchema(t.output_schema);
    const schemaFields = schema ? new Set(Object.keys((schema as any).properties ?? {})) : null;

    if (t.impl_type && !t.output_schema) risks.push('有实现但无契约');
    if (t.impl_type && !t.mock_rules) risks.push('无 Mock 场景');

    if (schemaFields && t.mock_rules) {
      try {
        const rules = JSON.parse(t.mock_rules) as Array<{ response: string }>;
        if (rules.length > 0) {
          const firstData = JSON.parse(rules[0].response);
          if (typeof firstData === 'object' && firstData !== null) {
            const mockFields = new Set(Object.keys(firstData));
            const missing = [...schemaFields].filter(f => !mockFields.has(f));
            const extra = [...mockFields].filter(f => !schemaFields.has(f));
            if (missing.length > 0 || extra.length > 0) {
              mockAligned = false;
              risks.push(`Mock 漂移 (${missing.length > 0 ? `-${missing.length}` : ''}${extra.length > 0 ? `+${extra.length}` : ''})`);
            }
          }
        }
      } catch { /* ignore */ }
    }

    // DB 工具检查列覆盖
    if (t.impl_type === 'db' && schemaFields && cfg) {
      const dbCfg = (cfg as any).db;
      if (dbCfg?.columns && Array.isArray(dbCfg.columns)) {
        const dbCols = new Set(dbCfg.columns as string[]);
        const missing = [...schemaFields].filter(f => !dbCols.has(f));
        if (missing.length > 0) risks.push(`DB 覆盖缺口 -${missing.length}`);
      }
    }

    return {
      ...t,
      skills: toolSkillsMap.get(t.name) ?? [],
      resource,
      mock_aligned: mockAligned,
      risk_flags: risks,
    };
  }));

  return c.json({ items });
});

// ── Create ───────────────────────────────────────────────────────────────────
app.post('/', async (c) => {
  const body = await c.req.json();
  if (!body.name?.trim()) return c.json({ error: 'name 不能为空' }, 400);

  const id = nanoid();
  db.insert(mcpTools).values({
    id,
    name: body.name.trim(),
    description: body.description ?? '',
    server_id: body.server_id ?? null,
    impl_type: body.impl_type ?? null,
    handler_key: body.handler_key ?? null,
    input_schema: body.input_schema ?? null,
    output_schema: body.output_schema ?? null,
    execution_config: body.execution_config ?? null,
    mock_rules: body.mock_rules ?? null,
    mocked: body.mocked ?? true,
    disabled: body.disabled ?? false,
    response_example: body.response_example ?? null,
    created_at: now(),
    updated_at: now(),
  }).run();
  logger.info('mcp', 'tool_created', { id, name: body.name });
  return c.json({ id });
});

// ── Handlers list（列出所有可用的脚本 handler）────────────────────────────────
app.get('/handlers', async (c) => {
  const servers = db.select().from(mcpServers).all();
  const handlers: Array<{ key: string; tool_name: string; server_name: string; server_id: string; file: string }> = [];

  const serverFileMap: Record<string, string> = {
    'mcp-user-info': 'mcp_servers/src/services/user_info_service.ts',
    'mcp-business': 'mcp_servers/src/services/business_service.ts',
    'mcp-diagnosis': 'mcp_servers/src/services/diagnosis_service.ts',
    'mcp-outbound': 'mcp_servers/src/services/outbound_service.ts',
    'mcp-account': 'mcp_servers/src/services/account_service.ts',
  };

  for (const s of servers) {
    const tools = s.tools_json ? JSON.parse(s.tools_json) as Array<{ name: string }> : [];
    const prefix = s.name.replace(/-service$/, '').replace(/-/g, '_');
    for (const t of tools) {
      handlers.push({
        key: `${prefix}.${t.name}`,
        tool_name: t.name,
        server_name: s.name,
        server_id: s.id,
        file: serverFileMap[s.id] ?? `mcp_servers/src/services/${s.name}.ts`,
      });
    }
  }

  return c.json({ handlers });
});

// ── Get ──────────────────────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const row = db.select().from(mcpTools).where(eq(mcpTools.id, c.req.param('id'))).get();
  if (!row) return c.json({ error: 'Not found' }, 404);

  // 附加 skill 引用和资源信息
  const toolSkillsMap = getToolToSkillsMap();
  const cfg = row.execution_config ? JSON.parse(row.execution_config) as { resource_id?: string } : null;
  const resource = cfg?.resource_id
    ? db.select().from(mcpResources).where(eq(mcpResources.id, cfg.resource_id)).get()
    : null;

  // 如果 output_schema 是文件路径，读取实际内容
  let outputSchemaContent: unknown = null;
  if (row.output_schema?.endsWith('.json')) {
    try {
      const { readFileSync, existsSync } = await import('node:fs');
      const { resolve } = await import('node:path');
      const schemaPath = resolve(REPO_ROOT,row.output_schema);
      if (existsSync(schemaPath)) outputSchemaContent = JSON.parse(readFileSync(schemaPath, 'utf-8'));
    } catch { /* ignore */ }
  } else if (row.output_schema) {
    try { outputSchemaContent = JSON.parse(row.output_schema); } catch { /* ignore */ }
  }

  return c.json({
    ...row,
    skills: toolSkillsMap.get(row.name) ?? [],
    resource: resource ? { id: resource.id, name: resource.name, type: resource.type } : null,
    output_schema_content: outputSchemaContent,
  });
});

// ── Update ───────────────────────────────────────────────────────────────────
app.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const existing = db.select().from(mcpTools).where(eq(mcpTools.id, id)).get();
  if (!existing) return c.json({ error: 'Not found' }, 404);

  db.update(mcpTools).set({
    name: body.name ?? existing.name,
    description: body.description ?? existing.description,
    server_id: body.server_id ?? existing.server_id,
    impl_type: body.impl_type ?? existing.impl_type,
    handler_key: body.handler_key ?? existing.handler_key,
    input_schema: body.input_schema ?? existing.input_schema,
    output_schema: body.output_schema ?? existing.output_schema,
    execution_config: body.execution_config ?? existing.execution_config,
    mock_rules: body.mock_rules ?? existing.mock_rules,
    mocked: body.mocked ?? existing.mocked,
    disabled: body.disabled ?? existing.disabled,
    response_example: body.response_example ?? existing.response_example,
    updated_at: now(),
  }).where(eq(mcpTools.id, id)).run();
  logger.info('mcp', 'tool_updated', { id, name: body.name ?? existing.name });
  return c.json({ ok: true });
});

// ── Delete ───────────────────────────────────────────────────────────────────
app.delete('/:id', async (c) => {
  const id = c.req.param('id');
  db.delete(mcpTools).where(eq(mcpTools.id, id)).run();
  logger.info('mcp', 'tool_deleted', { id });
  return c.json({ ok: true });
});

// ── Update execution config ──────────────────────────────────────────────────
app.put('/:id/execution-config', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const existing = db.select().from(mcpTools).where(eq(mcpTools.id, id)).get();
  if (!existing) return c.json({ error: 'Not found' }, 404);

  db.update(mcpTools).set({
    execution_config: JSON.stringify(body),
    updated_at: now(),
  }).where(eq(mcpTools.id, id)).run();
  logger.info('mcp', 'tool_execution_config_updated', { id, impl_type: body.impl_type });
  return c.json({ ok: true });
});

// ── Update mock rules ────────────────────────────────────────────────────────
app.put('/:id/mock-rules', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ rules: Array<{ tool_name: string; match: string; response: string }> }>();
  const existing = db.select().from(mcpTools).where(eq(mcpTools.id, id)).get();
  if (!existing) return c.json({ error: 'Not found' }, 404);

  db.update(mcpTools).set({
    mock_rules: body.rules.length > 0 ? JSON.stringify(body.rules) : null,
    updated_at: now(),
  }).where(eq(mcpTools.id, id)).run();
  logger.info('mcp', 'tool_mock_rules_updated', { id, count: body.rules.length });
  return c.json({ ok: true });
});

// ── Toggle mock/real ─────────────────────────────────────────────────────────
app.put('/:id/toggle-mock', async (c) => {
  const id = c.req.param('id');
  const existing = db.select().from(mcpTools).where(eq(mcpTools.id, id)).get();
  if (!existing) return c.json({ error: 'Not found' }, 404);

  const newMocked = !existing.mocked;
  db.update(mcpTools).set({ mocked: newMocked, updated_at: now() }).where(eq(mcpTools.id, id)).run();
  logger.info('mcp', 'tool_mock_toggled', { id, mocked: newMocked });
  return c.json({ ok: true, mocked: newMocked });
});

// ── SQL preview（根据 DB Binding 配置生成 SQL 预览）─────────────────────────
app.post('/:id/sql-preview', async (c) => {
  const body = await c.req.json() as {
    table?: string;
    operation?: string;
    where?: Array<{ param: string; column: string; op?: string }>;
    columns?: string[];
  };
  if (!body.table) return c.json({ error: 'table 不能为空' }, 400);

  const cols = body.columns?.length ? body.columns.join(', ') : '*';
  const conditions = (body.where ?? []).map(w => `${w.column} ${w.op ?? '='} :${w.param}`).join(' AND ');

  let sql = '';
  if (body.operation === 'update_one') {
    sql = `UPDATE ${body.table} SET ... WHERE ${conditions || '1=1'} LIMIT 1`;
  } else if (body.operation === 'select_many') {
    sql = `SELECT ${cols} FROM ${body.table}${conditions ? ' WHERE ' + conditions : ''}`;
  } else {
    sql = `SELECT ${cols} FROM ${body.table}${conditions ? ' WHERE ' + conditions : ''} LIMIT 1`;
  }

  return c.json({ sql, table: body.table, operation: body.operation ?? 'select_one' });
});

// ── Validate output（校验数据是否符合 output_schema）────────────────────────
app.post('/:id/validate-output', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json() as { data: unknown };
  const tool = db.select().from(mcpTools).where(eq(mcpTools.id, id)).get();
  if (!tool) return c.json({ error: 'Not found' }, 404);
  if (!tool.output_schema) return c.json({ valid: true, message: 'No output_schema defined, skipping validation' });

  try {
    // output_schema 可能是文件路径或 JSON 内容
    let schemaStr: string;
    if (tool.output_schema.endsWith('.json')) {
      const { readFileSync, existsSync } = await import('node:fs');
      const { resolve } = await import('node:path');
      const schemaPath = resolve(REPO_ROOT,tool.output_schema);
      if (!existsSync(schemaPath)) return c.json({ valid: false, errors: [`schema file not found: ${tool.output_schema}`] });
      schemaStr = readFileSync(schemaPath, 'utf-8');
    } else {
      schemaStr = tool.output_schema;
    }
    const schema = JSON.parse(schemaStr) as Record<string, unknown>;
    const errors: string[] = [];
    const data = body.data as Record<string, unknown> | null;

    if (!data || typeof data !== 'object') {
      errors.push('data must be an object');
    } else {
      // Check required fields
      const required = (schema.required ?? []) as string[];
      for (const field of required) {
        if (!(field in data)) errors.push(`missing required field: ${field}`);
      }

      // Check property types
      const properties = (schema.properties ?? {}) as Record<string, { type?: string | string[] }>;
      for (const [key, val] of Object.entries(data)) {
        const prop = properties[key];
        if (!prop) {
          if (schema.additionalProperties === false) errors.push(`unexpected field: ${key}`);
          continue;
        }
        if (prop.type) {
          const types = Array.isArray(prop.type) ? prop.type : [prop.type];
          const actualType = val === null ? 'null' : Array.isArray(val) ? 'array' : typeof val;
          const jsToSchema: Record<string, string> = { number: 'number', string: 'string', boolean: 'boolean', object: 'object' };
          const schemaType = jsToSchema[actualType] ?? actualType;
          if (!types.includes(schemaType) && !(schemaType === 'number' && types.includes('integer'))) {
            errors.push(`field "${key}": expected ${types.join('|')}, got ${schemaType}`);
          }
        }
      }
    }

    return c.json({ valid: errors.length === 0, errors });
  } catch (e) {
    return c.json({ valid: false, errors: [`schema parse error: ${String(e)}`] });
  }
});

// ── Infer schema（从示例 JSON 推断 output_schema）────────────────────────────
app.post('/infer-schema', async (c) => {
  const body = await c.req.json() as { example: unknown };
  if (!body.example || typeof body.example !== 'object') {
    return c.json({ error: 'example must be a JSON object' }, 400);
  }

  function inferType(val: unknown): string | string[] {
    if (val === null) return ['string', 'null'];
    if (Array.isArray(val)) return 'array';
    return typeof val;
  }

  function inferSchema(obj: Record<string, unknown>): Record<string, unknown> {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, val] of Object.entries(obj)) {
      if (val !== null && val !== undefined) required.push(key);

      if (val === null) {
        properties[key] = { type: ['string', 'null'] };
      } else if (Array.isArray(val)) {
        if (val.length > 0 && typeof val[0] === 'object' && val[0] !== null) {
          properties[key] = { type: 'array', items: inferSchema(val[0] as Record<string, unknown>) };
        } else {
          properties[key] = { type: 'array', items: { type: val.length > 0 ? typeof val[0] : 'string' } };
        }
      } else if (typeof val === 'object') {
        properties[key] = inferSchema(val as Record<string, unknown>);
      } else {
        properties[key] = { type: typeof val === 'number' ? (Number.isInteger(val) ? 'integer' : 'number') : typeof val };
      }
    }

    return { type: 'object', required, properties, additionalProperties: false };
  }

  const schema = inferSchema(body.example as Record<string, unknown>);
  return c.json({ schema });
});

// ── Tool Implementation CRUD（严格 MCP 对齐：契约与实现分离）──────────────

app.get('/:id/implementation', async (c) => {
  const toolId = c.req.param('id');
  const impl = db.select().from(toolImplementations).where(eq(toolImplementations.tool_id, toolId)).get();
  if (!impl) {
    // 向后兼容：从 mcp_tools.execution_config 回退读取
    const tool = db.select().from(mcpTools).where(eq(mcpTools.id, toolId)).get();
    if (!tool) return c.json({ error: 'Tool not found' }, 404);
    if (tool.impl_type || tool.execution_config || tool.handler_key) {
      return c.json({
        id: null,
        tool_id: toolId,
        adapter_type: tool.impl_type,
        config: tool.execution_config,
        handler_key: tool.handler_key,
        connector_id: null,
        host_server_id: tool.server_id,
        status: 'active',
        _source: 'legacy',
      });
    }
    return c.json({ id: null, tool_id: toolId, _source: 'none' });
  }
  // 附带 connector 信息
  let connector = null;
  if (impl.connector_id) {
    connector = db.select().from(connectors).where(eq(connectors.id, impl.connector_id)).get() ?? null;
  }
  return c.json({ ...impl, connector, _source: 'tool_implementations' });
});

app.put('/:id/implementation', async (c) => {
  const toolId = c.req.param('id');
  const body = await c.req.json();
  const tool = db.select().from(mcpTools).where(eq(mcpTools.id, toolId)).get();
  if (!tool) return c.json({ error: 'Tool not found' }, 404);

  const existing = db.select().from(toolImplementations).where(eq(toolImplementations.tool_id, toolId)).get();
  if (existing) {
    db.update(toolImplementations).set({
      adapter_type: body.adapter_type ?? existing.adapter_type,
      host_server_id: body.host_server_id ?? existing.host_server_id,
      connector_id: body.connector_id ?? existing.connector_id,
      config: body.config !== undefined ? (typeof body.config === 'string' ? body.config : JSON.stringify(body.config)) : existing.config,
      handler_key: body.handler_key ?? existing.handler_key,
      status: body.status ?? existing.status,
      updated_at: now(),
    }).where(eq(toolImplementations.id, existing.id)).run();
    logger.info('mcp', 'tool_impl_updated', { tool_id: toolId, impl_id: existing.id });
  } else {
    const id = nanoid();
    db.insert(toolImplementations).values({
      id,
      tool_id: toolId,
      adapter_type: body.adapter_type ?? 'script',
      host_server_id: body.host_server_id ?? tool.server_id,
      connector_id: body.connector_id ?? null,
      config: body.config ? (typeof body.config === 'string' ? body.config : JSON.stringify(body.config)) : null,
      handler_key: body.handler_key ?? null,
      status: body.status ?? 'active',
      created_at: now(),
      updated_at: now(),
    }).run();
    logger.info('mcp', 'tool_impl_created', { tool_id: toolId, impl_id: id });
  }

  // 同步更新 mcp_tools 旧字段（向后兼容，过渡期）
  db.update(mcpTools).set({
    impl_type: body.adapter_type ?? tool.impl_type,
    execution_config: body.config !== undefined ? (typeof body.config === 'string' ? body.config : JSON.stringify(body.config)) : tool.execution_config,
    handler_key: body.handler_key ?? tool.handler_key,
    updated_at: now(),
  }).where(eq(mcpTools.id, toolId)).run();

  return c.json({ ok: true });
});

export default app;
