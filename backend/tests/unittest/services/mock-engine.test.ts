/**
 * mock-engine.test.ts — Mock rule matching engine tests using REAL SQLite DB.
 *
 * Strategy: insert test data into mcpTools/mcpServers tables with a unique
 * prefix (__test_mock_) before each test, clean up after each test.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { db } from '../../../src/db';
import { mcpTools, mcpServers } from '../../../src/db/schema';
import { eq, like } from 'drizzle-orm';
import {
  matchMockRule,
  getMockedToolNames,
  getMockedToolDefinitions,
  getRegisteredToolNames,
} from '../../../src/services/mock-engine';

// Use a unique prefix to avoid collision with seed data
const P = '__test_mock_';

// Track inserted IDs for cleanup
let insertedToolIds: string[] = [];
let insertedServerIds: string[] = [];

function toolId(suffix: string) { return `${P}tool_${suffix}`; }
function serverId(suffix: string) { return `${P}srv_${suffix}`; }

function insertTool(suffix: string, data: Record<string, unknown>) {
  const id = toolId(suffix);
  insertedToolIds.push(id);
  db.insert(mcpTools).values({ id, name: `${P}${data.name ?? suffix}`, description: '', ...data, name: `${P}${data.name ?? suffix}` } as any).run();
  return id;
}

function insertServer(suffix: string, data: Record<string, unknown>) {
  const id = serverId(suffix);
  insertedServerIds.push(id);
  db.insert(mcpServers).values({ id, name: `${P}srv_${data.name ?? suffix}`, description: '', ...data, name: `${P}srv_${data.name ?? suffix}` } as any).run();
  return id;
}

function cleanup() {
  for (const id of insertedToolIds) {
    try { db.delete(mcpTools).where(eq(mcpTools.id, id)).run(); } catch {}
  }
  for (const id of insertedServerIds) {
    try { db.delete(mcpServers).where(eq(mcpServers.id, id)).run(); } catch {}
  }
  insertedToolIds = [];
  insertedServerIds = [];
}

beforeEach(() => { cleanup(); });
afterEach(() => { cleanup(); });

// ---- matchMockRule --------------------------------------------------------

describe('matchMockRule', () => {
  test('returns null when no rules match the given tool name', () => {
    // The real DB may have seed data, but '__test_mock_nonexistent' won't match
    expect(matchMockRule(`${P}nonexistent`, {})).toBeNull();
  });

  test('matches wildcard rule (match="*")', () => {
    insertTool('qb1', {
      name: 'qb1',
      mock_rules: JSON.stringify([
        { tool_name: `${P}qb1`, match: '*', response: '{"amount":100}' },
      ]),
    });
    const result = matchMockRule(`${P}qb1`, { phone: '13800001111' });
    expect(result).toBe('{"amount":100}');
  });

  test('matches empty-string match as wildcard', () => {
    insertTool('qb2', {
      name: 'qb2',
      mock_rules: JSON.stringify([
        { tool_name: `${P}qb2`, match: '', response: '"default"' },
      ]),
    });
    expect(matchMockRule(`${P}qb2`, {})).toBe('default');
  });

  test('matches null/undefined match as wildcard', () => {
    insertTool('qb3', {
      name: 'qb3',
      mock_rules: JSON.stringify([
        { tool_name: `${P}qb3`, match: null, response: '"fallback"' },
      ]),
    });
    expect(matchMockRule(`${P}qb3`, {})).toBe('fallback');
  });

  test('matches specific JS expression', () => {
    insertTool('qb4', {
      name: 'qb4',
      mock_rules: JSON.stringify([
        { tool_name: `${P}qb4`, match: 'phone === "13800001111"', response: '{"amount":200}' },
        { tool_name: `${P}qb4`, match: '*', response: '{"amount":0}' },
      ]),
    });
    const result = matchMockRule(`${P}qb4`, { phone: '13800001111' });
    expect(result).toBe('{"amount":200}');
  });

  test('expression match takes priority over wildcard', () => {
    insertTool('qb5', {
      name: 'qb5',
      mock_rules: JSON.stringify([
        { tool_name: `${P}qb5`, match: '*', response: '"wildcard"' },
        { tool_name: `${P}qb5`, match: 'phone === "A"', response: '"specific"' },
      ]),
    });
    const result = matchMockRule(`${P}qb5`, { phone: 'A' });
    expect(result).toBe('specific');
  });

  test('falls back to wildcard when expression does not match', () => {
    insertTool('qb6', {
      name: 'qb6',
      mock_rules: JSON.stringify([
        { tool_name: `${P}qb6`, match: '*', response: '"wildcard"' },
        { tool_name: `${P}qb6`, match: 'phone === "X"', response: '"specific"' },
      ]),
    });
    const result = matchMockRule(`${P}qb6`, { phone: 'Y' });
    expect(result).toBe('wildcard');
  });

  test('skips invalid JS expression without throwing', () => {
    insertTool('qb7', {
      name: 'qb7',
      mock_rules: JSON.stringify([
        { tool_name: `${P}qb7`, match: '!!!invalid syntax', response: '"bad"' },
        { tool_name: `${P}qb7`, match: '*', response: '"good"' },
      ]),
    });
    expect(matchMockRule(`${P}qb7`, {})).toBe('good');
  });

  test('response is returned as string when it is plain text', () => {
    insertTool('qb8', {
      name: 'qb8',
      mock_rules: JSON.stringify([
        { tool_name: `${P}qb8`, match: '*', response: 'just plain text' },
      ]),
    });
    expect(matchMockRule(`${P}qb8`, {})).toBe('just plain text');
  });

  test('response JSON object is stringified back', () => {
    insertTool('qb9', {
      name: 'qb9',
      mock_rules: JSON.stringify([
        { tool_name: `${P}qb9`, match: '*', response: '{"a":1}' },
      ]),
    });
    expect(matchMockRule(`${P}qb9`, {})).toBe('{"a":1}');
  });

  test('skips tools with null mock_rules', () => {
    insertTool('qb10a', { name: 'qb10a', mock_rules: null });
    insertTool('qb10b', {
      name: 'qb10b',
      mock_rules: JSON.stringify([{ tool_name: `${P}qb10b`, match: '*', response: '"ok"' }]),
    });
    expect(matchMockRule(`${P}qb10b`, {})).toBe('ok');
  });

  test('skips tools with invalid JSON in mock_rules', () => {
    insertTool('qb11a', { name: 'qb11a', mock_rules: 'not-json{' });
    insertTool('qb11b', {
      name: 'qb11b',
      mock_rules: JSON.stringify([{ tool_name: `${P}qb11b`, match: '*', response: '"ok"' }]),
    });
    expect(matchMockRule(`${P}qb11b`, {})).toBe('ok');
  });
});

// ---- getMockedToolNames ---------------------------------------------------

describe('getMockedToolNames', () => {
  test('returns mocked tool names from mcpTools', () => {
    insertTool('mn1', { name: 'mn1', mocked: true });
    insertTool('mn2', { name: 'mn2', mocked: false });
    insertTool('mn3', { name: 'mn3', mocked: true });
    const names = getMockedToolNames();
    expect(names.has(`${P}mn1`)).toBe(true);
    expect(names.has(`${P}mn3`)).toBe(true);
    expect(names.has(`${P}mn2`)).toBe(false);
  });
});

// ---- getMockedToolDefinitions ---------------------------------------------

describe('getMockedToolDefinitions', () => {
  test('returns definitions from mcpTools', () => {
    insertTool('md1', {
      name: 'md1',
      description: 'Query bill',
      mocked: true,
      input_schema: '{"type":"object","properties":{"phone":{"type":"string"}}}',
    });
    insertTool('md2', {
      name: 'md2',
      description: 'Query plan',
      mocked: false,
      input_schema: null,
    });
    const defs = getMockedToolDefinitions();
    const testDef = defs.find(d => d.name === `${P}md1`);
    expect(testDef).toBeDefined();
    expect(testDef!.description).toBe('Query bill');
    expect(testDef!.inputSchema).toEqual({ type: 'object', properties: { phone: { type: 'string' } } });
    // md2 should not be included (mocked=false)
    expect(defs.find(d => d.name === `${P}md2`)).toBeUndefined();
  });

  test('returns definition with undefined inputSchema when input_schema is null', () => {
    insertTool('md3', {
      name: 'md3',
      description: 'Simple',
      mocked: true,
      input_schema: null,
    });
    const defs = getMockedToolDefinitions();
    const testDef = defs.find(d => d.name === `${P}md3`);
    expect(testDef).toBeDefined();
    expect(testDef!.inputSchema).toBeUndefined();
  });
});

// ---- getRegisteredToolNames -----------------------------------------------

describe('getRegisteredToolNames', () => {
  test('returns tool names from mcpTools plus built-ins', () => {
    insertTool('rn1', { name: 'rn1' });
    insertTool('rn2', { name: 'rn2' });
    const names = getRegisteredToolNames();
    expect(names.has(`${P}rn1`)).toBe(true);
    expect(names.has(`${P}rn2`)).toBe(true);
    // built-ins
    expect(names.has('get_skill_instructions')).toBe(true);
    expect(names.has('get_skill_reference')).toBe(true);
    expect(names.has('transfer_to_human')).toBe(true);
  });

  test('always includes built-in tools', () => {
    const names = getRegisteredToolNames();
    expect(names.has('get_skill_instructions')).toBe(true);
    expect(names.has('get_skill_reference')).toBe(true);
    expect(names.has('transfer_to_human')).toBe(true);
  });
});

// ---- mcpServers fallback paths ----------------------------------------------

describe('mcpServers fallback — matchMockRule', () => {
  // Strategy: temporarily stash mcpTools rows, test with mcpServers only, restore
  let stashedTools: any[] = [];

  function stashMcpTools() {
    stashedTools = db.select().from(mcpTools).all();
    db.delete(mcpTools).run();
  }

  function restoreMcpTools() {
    for (const t of stashedTools) {
      try { db.insert(mcpTools).values(t).run(); } catch { /* ignore dupes */ }
    }
    stashedTools = [];
  }

  afterEach(() => {
    cleanup();
    if (stashedTools.length > 0) restoreMcpTools();
  });

  test('falls back to mcpServers mock_rules when mcpTools is empty', () => {
    stashMcpTools();
    const srvToolName = `${P}srv_fb_tool`;
    insertServer('fb1', {
      name: 'fb1',
      mock_rules: JSON.stringify([
        { tool_name: srvToolName, match: '*', response: '{"source":"server"}' },
      ]),
    });
    const result = matchMockRule(srvToolName, {});
    expect(result).toBe('{"source":"server"}');
    restoreMcpTools();
  });

  test('does NOT use mcpServers fallback when mcpTools has rules', () => {
    // mcpTools has seed data already, so mcpServers fallback should not kick in
    const srvToolName = `${P}srv_no_fb`;
    insertServer('nofb', {
      name: 'nofb',
      mock_rules: JSON.stringify([
        { tool_name: srvToolName, match: '*', response: '"from_server"' },
      ]),
    });
    // Since mcpTools has seed data, this server rule should not be reached
    const result = matchMockRule(srvToolName, {});
    expect(result).toBeNull();
  });
});

describe('mcpServers fallback — getMockedToolNames', () => {
  let stashedTools: any[] = [];

  function stashMcpTools() {
    stashedTools = db.select().from(mcpTools).all();
    db.delete(mcpTools).run();
  }

  function restoreMcpTools() {
    for (const t of stashedTools) {
      try { db.insert(mcpTools).values(t).run(); } catch { /* ignore dupes */ }
    }
    stashedTools = [];
  }

  afterEach(() => {
    cleanup();
    if (stashedTools.length > 0) restoreMcpTools();
  });

  test('falls back to mcpServers mocked_tools when mcpTools is empty', () => {
    stashMcpTools();
    insertServer('mn_fb', {
      name: 'mn_fb',
      mocked_tools: JSON.stringify([`${P}tool_from_server`]),
    });
    const names = getMockedToolNames();
    expect(names.has(`${P}tool_from_server`)).toBe(true);
    restoreMcpTools();
  });
});

describe('mcpServers fallback — getMockedToolDefinitions', () => {
  let stashedTools: any[] = [];

  function stashMcpTools() {
    stashedTools = db.select().from(mcpTools).all();
    db.delete(mcpTools).run();
  }

  function restoreMcpTools() {
    for (const t of stashedTools) {
      try { db.insert(mcpTools).values(t).run(); } catch { /* ignore dupes */ }
    }
    stashedTools = [];
  }

  afterEach(() => {
    cleanup();
    if (stashedTools.length > 0) restoreMcpTools();
  });

  test('falls back to mcpServers tools_json + mocked_tools when mcpTools is empty', () => {
    stashMcpTools();
    const toolName = `${P}def_from_server`;
    insertServer('md_fb', {
      name: 'md_fb',
      mocked_tools: JSON.stringify([toolName]),
      tools_json: JSON.stringify([
        { name: toolName, description: 'Server tool', inputSchema: { type: 'object' } },
        { name: `${P}other`, description: 'Not mocked' },
      ]),
    });
    const defs = getMockedToolDefinitions();
    const found = defs.find(d => d.name === toolName);
    expect(found).toBeDefined();
    expect(found!.description).toBe('Server tool');
    expect(found!.inputSchema).toEqual({ type: 'object' });
    // Non-mocked tool should not appear
    expect(defs.find(d => d.name === `${P}other`)).toBeUndefined();
    restoreMcpTools();
  });
});

describe('mcpServers fallback — getRegisteredToolNames', () => {
  let stashedTools: any[] = [];

  function stashMcpTools() {
    stashedTools = db.select().from(mcpTools).all();
    db.delete(mcpTools).run();
  }

  function restoreMcpTools() {
    for (const t of stashedTools) {
      try { db.insert(mcpTools).values(t).run(); } catch { /* ignore dupes */ }
    }
    stashedTools = [];
  }

  afterEach(() => {
    cleanup();
    if (stashedTools.length > 0) restoreMcpTools();
  });

  test('falls back to mcpServers tools_json when mcpTools is empty', () => {
    stashMcpTools();
    const toolName = `${P}reg_from_server`;
    insertServer('rn_fb', {
      name: 'rn_fb',
      tools_json: JSON.stringify([{ name: toolName }]),
    });
    const names = getRegisteredToolNames();
    expect(names.has(toolName)).toBe(true);
    // Built-ins should still be present
    expect(names.has('get_skill_instructions')).toBe(true);
    expect(names.has('get_skill_reference')).toBe(true);
    expect(names.has('transfer_to_human')).toBe(true);
    restoreMcpTools();
  });

  test('built-in tools are always included even with empty mcpTools and mcpServers', () => {
    stashMcpTools();
    const names = getRegisteredToolNames();
    expect(names.has('get_skill_instructions')).toBe(true);
    expect(names.has('get_skill_reference')).toBe(true);
    expect(names.has('transfer_to_human')).toBe(true);
    restoreMcpTools();
  });
});
