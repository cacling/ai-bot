/**
 * mcp/tools-overview.ts — 全局工具概览聚合 API
 *
 * 聚合所有来源的工具（MCP Server / 内建 / 外呼本地），
 * 扫描 SKILL.md 中的 %% tool:xxx 注解，建立工具 → 技能映射。
 */
import { Hono } from 'hono';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { db } from '../../../db';
import { mcpServers } from '../../../db/schema';
import { BIZ_SKILLS_DIR } from '../../../services/paths';

const app = new Hono();

interface ToolOverviewItem {
  name: string;
  description: string;
  source: string;       // MCP server name, 'builtin', or 'outbound-local'
  source_type: 'mcp' | 'builtin' | 'local';
  status: 'available' | 'disabled' | 'planned';
  skills: string[];     // skill names that reference this tool
}

/** Scan all SKILL.md files for %% tool:xxx annotations and tool_name(...) references */
function scanSkillToolRefs(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  try {
    const dirs = readdirSync(BIZ_SKILLS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('_'));
    for (const dir of dirs) {
      const mdPath = join(BIZ_SKILLS_DIR, dir.name, 'SKILL.md');
      if (!existsSync(mdPath)) continue;
      const content = readFileSync(mdPath, 'utf-8');
      // Match %% tool:tool_name annotations
      const toolAnnotations = content.matchAll(/%% tool:(\w+)/g);
      for (const m of toolAnnotations) {
        const toolName = m[1];
        const skills = map.get(toolName) ?? [];
        if (!skills.includes(dir.name)) skills.push(dir.name);
        map.set(toolName, skills);
      }
      // Also match tool_name(...) in prose (e.g., "调用 diagnose_network(phone, issue_type)")
      const toolCalls = content.matchAll(/调用\s*`?(\w+)\s*\(/g);
      for (const m of toolCalls) {
        const toolName = m[1];
        if (toolName === 'get_skill_instructions' || toolName === 'get_skill_reference') continue;
        const skills = map.get(toolName) ?? [];
        if (!skills.includes(dir.name)) skills.push(dir.name);
        map.set(toolName, skills);
      }
    }
  } catch { /* ignore */ }
  return map;
}

app.get('/', async (c) => {
  const skillRefs = scanSkillToolRefs();
  const items: ToolOverviewItem[] = [];

  // 1. MCP Server tools
  const servers = db.select().from(mcpServers).all();
  for (const server of servers) {
    if (server.status === 'planned') {
      // Planned servers: show tools from cache or empty
      const cached = server.tools_cache ? JSON.parse(server.tools_cache) as Array<{ name: string; description: string }> : [];
      for (const tool of cached) {
        items.push({
          name: tool.name,
          description: tool.description,
          source: server.name,
          source_type: 'mcp',
          status: 'planned',
          skills: skillRefs.get(tool.name) ?? [],
        });
      }
      continue;
    }
    const cached = server.tools_cache ? JSON.parse(server.tools_cache) as Array<{ name: string; description: string }> : [];
    const disabledTools: string[] = server.disabled_tools ? JSON.parse(server.disabled_tools) : [];
    for (const tool of cached) {
      items.push({
        name: tool.name,
        description: tool.description,
        source: server.name,
        source_type: 'mcp',
        status: !server.enabled || disabledTools.includes(tool.name) ? 'disabled' : 'available',
        skills: skillRefs.get(tool.name) ?? [],
      });
    }
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
      skills: skillRefs.get(tool.name) ?? [],
    });
  }

  return c.json({ items });
});

export default app;
