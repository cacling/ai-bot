/**
 * mock-engine.ts — Mock 规则匹配引擎
 *
 * 从 mcpServers 表读取 mock_rules，根据工具名和参数匹配返回 mock 数据。
 * 被 sandbox test、MCP 管理测试面板、以及沙箱环境下的 runner 共用。
 */

import { db } from '../db';
import { mcpServers } from '../db/schema';
import { logger } from './logger';

export interface MockRule {
  tool_name: string;
  match: string;
  response: string;
}

/** Load all mock rules from all MCP servers */
function loadAllMockRules(): MockRule[] {
  const servers = db.select().from(mcpServers).all();
  const allRules: MockRule[] = [];
  for (const server of servers) {
    if (!server.mock_rules) continue;
    try {
      const rules = JSON.parse(server.mock_rules) as MockRule[];
      allRules.push(...rules);
    } catch { /* ignore */ }
  }
  return allRules;
}

/**
 * Try to match a mock rule for the given tool and args.
 * Returns the mock response text if matched, or null if no match.
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
    if (!rule.match || rule.match.trim() === '' || rule.match.trim() === '*') {
      if (!matched) matched = rule;
      continue;
    }
    try {
      const fn = new Function(...Object.keys(args), `return (${rule.match})`);
      if (fn(...Object.values(args))) {
        matched = rule;
        break;
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

/** Get all known tool names from MCP servers (discovered + manually defined) */
export function getRegisteredToolNames(): Set<string> {
  const names = new Set<string>();
  const servers = db.select().from(mcpServers).all();
  for (const server of servers) {
    if (server.tools_json) {
      try {
        for (const t of JSON.parse(server.tools_json) as Array<{ name: string }>) {
          names.add(t.name);
        }
      } catch { /* ignore */ }
    }
  }
  // Built-in tools
  names.add('get_skill_instructions');
  names.add('get_skill_reference');
  names.add('transfer_to_human');
  return names;
}
