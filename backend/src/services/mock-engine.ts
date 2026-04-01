/**
 * mock-engine.ts — Mock 规则匹配引擎
 *
 * 优先从 mcp_tools 表读取 mock 数据，回退读 mcp_servers（过渡期）。
 */

import { getMcpToolsSync, getMcpServersSync } from './km-client';
import { logger } from './logger';

export interface MockRule {
  tool_name: string;
  match: string;
  response: string;
}

/** Load all mock rules — 优先从 mcp_tools，回退 mcp_servers */
function loadAllMockRules(): MockRule[] {
  const allRules: MockRule[] = [];

  // 优先从 mcp_tools 读
  try {
    const tools = getMcpToolsSync();
    for (const tool of tools) {
      if (!tool.mock_rules) continue;
      try {
        const rules = JSON.parse(tool.mock_rules) as MockRule[];
        allRules.push(...rules);
      } catch { /* ignore */ }
    }
  } catch { /* mcp_tools 表可能不存在（过渡期） */ }

  // 如果 mcp_tools 没数据，回退到 mcp_servers
  if (allRules.length === 0) {
    const servers = getMcpServersSync();
    for (const server of servers) {
      if (!server.mock_rules) continue;
      try {
        allRules.push(...(JSON.parse(server.mock_rules) as MockRule[]));
      } catch { /* ignore */ }
    }
  }

  return allRules;
}

/**
 * Try to match a mock rule for the given tool and args.
 * Returns the mock response text if matched, or null if no match.
 */
/**
 * 尝试为给定工具和参数匹配一条 mock 规则。
 *
 * 匹配优先级：
 *   1. 具体表达式匹配（match 字段为 JS 表达式，如 `phone === '138...'`）
 *   2. 通配符匹配（match 为空或 '*'，作为默认 fallback）
 *
 * @returns mock 响应文本（JSON string），无匹配时返回 null
 */
export function matchMockRule(
  toolName: string,
  args: Record<string, unknown>,
): string | null {
  const allRules = loadAllMockRules();
  const toolRules = allRules.filter(r => r.tool_name === toolName);
  if (toolRules.length === 0) return null;

  let matched: MockRule | undefined;

  for (const rule of toolRules) {
    // 通配符规则（空 match 或 '*'）作为 fallback，不覆盖更具体的匹配
    if (!rule.match || rule.match.trim() === '' || rule.match.trim() === '*') {
      if (!matched) matched = rule;
      continue;
    }
    // 具体表达式匹配：将 args 的 key 作为函数参数，match 作为函数体
    try {
      const fn = new Function(...Object.keys(args), `return (${rule.match})`);
      if (fn(...Object.values(args))) {
        matched = rule;
        break; // 具体匹配优先，立即返回
      }
    } catch { /* invalid expression, skip */ }
  }

  if (!matched) return null;

  logger.info('mock', 'rule_matched', { tool: toolName, match: matched.match || '(default)' });

  let response: unknown;
  try { response = JSON.parse(matched.response); }
  catch { response = matched.response; }

  return typeof response === 'string' ? response : JSON.stringify(response);
}

/**
 * 获取所有标记为 mock 模式的工具名称集合。
 * 优先从 mcp_tools 表读取（tool.mocked=true），回退到 mcp_servers.mocked_tools。
 */
export function getMockedToolNames(): Set<string> {
  const names = new Set<string>();

  // 优先从 mcp_tools 读
  try {
    const tools = getMcpToolsSync();
    for (const tool of tools) {
      if (tool.mocked) names.add(tool.name);
    }
  } catch { /* ignore */ }

  // 回退 mcp_servers
  if (names.size === 0) {
    const servers = getMcpServersSync();
    for (const server of servers) {
      if (server.mocked_tools) {
        try {
          for (const name of JSON.parse(server.mocked_tools) as string[]) {
            names.add(name);
          }
        } catch { /* ignore */ }
      }
    }
  }

  return names;
}

/**
 * 获取所有标记为 Mock 模式的工具定义（含 inputSchema）。
 * 用于 runner 注入 DB-only 的 mock 工具。
 */
export function getMockedToolDefinitions(): Array<{ name: string; description: string; inputSchema?: Record<string, unknown> }> {
  const result: Array<{ name: string; description: string; inputSchema?: Record<string, unknown> }> = [];

  // 优先从 mcp_tools 读
  try {
    const tools = getMcpToolsSync();
    for (const tool of tools) {
      if (!tool.mocked) continue;
      const schema = tool.input_schema ? JSON.parse(tool.input_schema) : undefined;
      result.push({ name: tool.name, description: tool.description, inputSchema: schema });
    }
  } catch { /* ignore */ }

  // 回退 mcp_servers
  if (result.length === 0) {
    const servers = getMcpServersSync();
    for (const server of servers) {
      const mockedNames: string[] = server.mocked_tools ? JSON.parse(server.mocked_tools) : [];
      if (mockedNames.length === 0) continue;
      const tools: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }> = server.tools_json ? JSON.parse(server.tools_json) : [];
      const mockedSet = new Set(mockedNames);
      for (const t of tools) {
        if (mockedSet.has(t.name)) {
          result.push({ name: t.name, description: t.description ?? '', inputSchema: t.inputSchema });
        }
      }
    }
  }

  return result;
}

/**
 * 获取所有已注册的工具名称（mcp_tools 表 + 内建工具）。
 * 内建工具：get_skill_instructions, get_skill_reference, transfer_to_human
 */
export function getRegisteredToolNames(): Set<string> {
  const names = new Set<string>();

  // 从 mcp_tools 读
  try {
    for (const t of getMcpToolsSync()) {
      names.add(t.name);
    }
  } catch { /* ignore */ }

  // 回退 mcp_servers
  if (names.size === 0) {
    for (const server of getMcpServersSync()) {
      if (server.tools_json) {
        try {
          for (const t of JSON.parse(server.tools_json) as Array<{ name: string }>) {
            names.add(t.name);
          }
        } catch { /* ignore */ }
      }
    }
  }

  // Built-in tools
  names.add('get_skill_instructions');
  names.add('get_skill_reference');
  names.add('transfer_to_human');
  return names;
}
