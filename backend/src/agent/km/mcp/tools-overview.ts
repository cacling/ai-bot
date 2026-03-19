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
import { mcpServers } from '../../../db/schema';
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
  const servers = db.select().from(mcpServers).all();
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

  // 1. MCP Server tools
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

  // 2. Built-in tools
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

  // 3. Missing tools: referenced by skills but not registered anywhere
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

  return items;
}

// ── 共享函数：获取单个工具的详细信息（含 inputSchema / responseExample）──────

export function getToolDetail(toolName: string): ToolDetailItem | null {
  const skillRefs = getSkillToolRefs();
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
