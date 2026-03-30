/**
 * mcp/tools-overview.ts — 全局工具概览聚合 API + 共享查询函数
 *
 * 聚合所有来源的工具（MCP Server / 内建 / 外呼本地），
 * 扫描 SKILL.md 中的 %% tool:xxx 注解，建立工具 → 技能映射。
 *
 * 导出 getToolsOverview() 和 getToolDetail() 供 skill-creator 等模块直接调用，
 * 避免通过 HTTP 自调用。
 */
import { Hono } from 'hono';
import { db } from '../../../db';
import { mcpServers, mcpTools } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { getToolToSkillsMap } from '../../../engine/skills';

const app = new Hono();

export interface ToolOverviewItem {
  name: string;
  description: string;
  source: string;       // MCP server name, 'builtin', or 'outbound-local'
  source_type: 'mcp' | 'builtin' | 'local';
  status: 'available' | 'disabled' | 'planned';
  mocked: boolean;      // true = 调用时走 mock_rules 而非真实 MCP
  skills: string[];     // skill names that reference this tool
  annotations?: string | null; // MCP annotations JSON (readOnlyHint 等)
}

export interface ToolDetailItem extends ToolOverviewItem {
  inputSchema: Record<string, unknown> | null;
  responseExample: unknown | null;
  // mocked is inherited from ToolOverviewItem
}

/** 获取 tool → skill[] 映射（从 skills.ts 统一入口获取，不直接读文件） */
function getSkillToolRefs(): Map<string, string[]> {
  return getToolToSkillsMap();
}

// ── 从 DB 加载完整的工具元数据（含 inputSchema / responseExample）────────────

interface RawToolRecord {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  responseExample?: unknown;
  [key: string]: unknown;
}

function loadRawToolMap(): Map<string, { raw: RawToolRecord; serverName: string; serverStatus: string; enabled: boolean; disabled: boolean; mocked: boolean }> {
  const map = new Map<string, { raw: RawToolRecord; serverName: string; serverStatus: string; enabled: boolean; disabled: boolean; mocked: boolean }>();
  let servers: (typeof mcpServers.$inferSelect)[];
  try {
    servers = db.select().from(mcpServers).all();
  } catch {
    return map;
  }
  for (const server of servers) {
    const tools: RawToolRecord[] = server.tools_json ? JSON.parse(server.tools_json) : [];
    const disabledTools: string[] = server.disabled_tools ? JSON.parse(server.disabled_tools) : [];
    const mockedTools: string[] = server.mocked_tools ? JSON.parse(server.mocked_tools) : [];
    for (const t of tools) {
      map.set(t.name, {
        raw: t,
        serverName: server.name,
        serverStatus: server.status ?? 'active',
        enabled: server.enabled ?? true,
        disabled: disabledTools.includes(t.name),
        mocked: mockedTools.includes(t.name),
      });
    }
  }
  return map;
}

// ── 共享函数：获取工具概览列表 ────────────────────────────────────────────────

export function getToolsOverview(): ToolOverviewItem[] {
  const skillRefs = getSkillToolRefs();
  const items: ToolOverviewItem[] = [];

  // 优先从 mcp_tools 表读取
  try {
    const toolRows = db.select().from(mcpTools).all();
    if (toolRows.length > 0) {
      // 预加载 server 名称映射
      const serverMap = new Map(db.select().from(mcpServers).all().map(s => [s.id, s]));

      for (const tool of toolRows) {
        const server = tool.server_id ? serverMap.get(tool.server_id) : null;
        items.push({
          name: tool.name,
          description: tool.description || '',
          source: server?.name ?? '(未分配)',
          source_type: 'mcp',
          status: tool.disabled ? 'disabled' : 'available',
          mocked: tool.mocked ?? false,
          skills: skillRefs.get(tool.name) ?? [],
          annotations: tool.annotations ?? null,
        });
      }

      // 加 built-in + missing，然后直接返回
      addBuiltinAndMissing(items, skillRefs);
      return items;
    }
  } catch { /* mcp_tools 表可能不存在（过渡期），回退旧逻辑 */ }

  // 回退：从 mcp_servers.tools_json 读取
  const rawMap = loadRawToolMap();
  for (const [name, info] of rawMap) {
    const toolStatus = info.serverStatus === 'planned' ? 'planned'
      : (!info.enabled || info.disabled) ? 'disabled' : 'available';
    items.push({
      name,
      description: info.raw.description || '',
      source: info.serverName,
      source_type: 'mcp',
      status: toolStatus,
      mocked: info.mocked,
      skills: skillRefs.get(name) ?? [],
    });
  }

  addBuiltinAndMissing(items, skillRefs);
  return items;
}

function addBuiltinAndMissing(items: ToolOverviewItem[], skillRefs: Map<string, string[]>): void {
  // Built-in tools
  const builtinTools = [
    { name: 'get_skill_instructions', description: '加载指定 Skill 的操作指南' },
    { name: 'get_skill_reference', description: '加载 Skill 的参考文档' },
    { name: 'transfer_to_human', description: '转接人工客服' },
  ];
  for (const tool of builtinTools) {
    items.push({
      name: tool.name,
      description: tool.description,
      source: '内建 (skillsTools)',
      source_type: 'builtin',
      status: 'available',
      mocked: false,
      skills: skillRefs.get(tool.name) ?? [],
    });
  }

  // Missing tools: referenced by skills but not registered anywhere
  const registeredNames = new Set(items.map(i => i.name));
  for (const [toolName, skills] of skillRefs) {
    if (!registeredNames.has(toolName)) {
      items.push({
        name: toolName,
        description: '',
        source: '(未注册)',
        source_type: 'mcp',
        status: 'planned',
        mocked: false,
        skills,
      });
    }
  }
}

// ── 共享函数：获取单个工具的详细信息（含 inputSchema / responseExample）──────

export function getToolDetail(toolName: string): ToolDetailItem | null {
  const skillRefs = getSkillToolRefs();

  // 优先从 mcp_tools 读
  try {
    const tool = db.select().from(mcpTools).where(eq(mcpTools.name, toolName)).get();
    if (tool) {
      const server = tool.server_id
        ? db.select().from(mcpServers).where(eq(mcpServers.id, tool.server_id)).get()
        : null;
      return {
        name: tool.name,
        description: tool.description || '',
        source: server?.name ?? '(未分配)',
        source_type: 'mcp',
        status: tool.disabled ? 'disabled' : 'available',
        mocked: tool.mocked ?? false,
        skills: skillRefs.get(tool.name) ?? [],
        inputSchema: tool.input_schema ? JSON.parse(tool.input_schema) : null,
        responseExample: tool.response_example ?? null,
      };
    }
  } catch { /* 过渡期回退 */ }

  // 回退：从 mcp_servers.tools_json
  const rawMap = loadRawToolMap();
  const info = rawMap.get(toolName);

  if (info) {
    const toolStatus = info.serverStatus === 'planned' ? 'planned'
      : (!info.enabled || info.disabled) ? 'disabled' : 'available';
    return {
      name: toolName,
      description: info.raw.description || '',
      source: info.serverName,
      source_type: 'mcp',
      status: toolStatus,
      mocked: info.mocked,
      skills: skillRefs.get(toolName) ?? [],
      inputSchema: info.raw.inputSchema ?? null,
      responseExample: info.raw.responseExample ?? null,
    };
  }

  // Check builtins
  const builtinTools: Record<string, string> = {
    get_skill_instructions: '加载指定 Skill 的操作指南',
    get_skill_reference: '加载 Skill 的参考文档',
    transfer_to_human: '转接人工客服',
  };
  if (toolName in builtinTools) {
    return {
      name: toolName,
      description: builtinTools[toolName],
      source: '内建 (skillsTools)',
      source_type: 'builtin',
      status: 'available',
      mocked: false,
      skills: skillRefs.get(toolName) ?? [],
      inputSchema: null,
      responseExample: null,
    };
  }

  // Check if referenced by any skill (missing/planned)
  const skills = skillRefs.get(toolName);
  if (skills) {
    return {
      name: toolName,
      description: '',
      source: '(未注册)',
      source_type: 'mcp',
      status: 'planned',
      mocked: false,
      skills,
      inputSchema: null,
      responseExample: null,
    };
  }

  return null;
}

// ── HTTP 路由（保持向后兼容）─────────────────────────────────────────────────

app.get('/', async (c) => {
  return c.json({ items: getToolsOverview() });
});

export default app;
