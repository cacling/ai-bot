/**
 * mock-engine.ts — Mock 规则匹配引擎（从主后端复制）
 */
import { db, mcpTools, mcpServers } from './db';
import { logger } from './logger';

export interface MockRule {
  tool_name: string;
  match: string;
  response: string;
}

function loadAllMockRules(): MockRule[] {
  const allRules: MockRule[] = [];
  try {
    const tools = db.select().from(mcpTools).all();
    for (const tool of tools) {
      if (!tool.mock_rules) continue;
      try {
        allRules.push(...(JSON.parse(tool.mock_rules) as MockRule[]));
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }

  if (allRules.length === 0) {
    const servers = db.select().from(mcpServers).all();
    for (const server of servers) {
      if (!server.mock_rules) continue;
      try {
        allRules.push(...(JSON.parse(server.mock_rules) as MockRule[]));
      } catch { /* ignore */ }
    }
  }
  return allRules;
}

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

export function getRegisteredToolNames(): Set<string> {
  const names = new Set<string>();
  try {
    for (const t of db.select().from(mcpTools).all()) {
      names.add(t.name);
    }
  } catch { /* ignore */ }

  if (names.size === 0) {
    for (const server of db.select().from(mcpServers).all()) {
      if (server.tools_json) {
        try {
          for (const t of JSON.parse(server.tools_json) as Array<{ name: string }>) {
            names.add(t.name);
          }
        } catch { /* ignore */ }
      }
    }
  }

  names.add('get_skill_instructions');
  names.add('get_skill_reference');
  names.add('transfer_to_human');
  return names;
}
