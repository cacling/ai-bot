/**
 * mock-engine.test.ts — Mock rule matching engine tests
 *
 * Strategy: mock km-client's getMcpToolsSync/getMcpServersSync to inject
 * test data, then verify mock-engine's matching logic.
 */
import { describe, test, expect, beforeEach, mock } from 'bun:test';

// ── Mock km-client before importing mock-engine ──────────────────────────

let _mockTools: any[] = [];
let _mockServers: any[] = [];

mock.module('../../../src/services/km-client', () => ({
  getMcpToolsSync: () => _mockTools,
  getMcpServersSync: () => _mockServers,
}));

// Import AFTER mocking
const { matchMockRule, getMockedToolNames, getMockedToolDefinitions, getRegisteredToolNames } =
  await import('../../../src/services/mock-engine');

beforeEach(() => {
  _mockTools = [];
  _mockServers = [];
});

// ── matchMockRule ────────────────────────────────────────────────────────

describe('matchMockRule', () => {
  test('returns null when no rules match the given tool name', () => {
    expect(matchMockRule('nonexistent', {})).toBeNull();
  });

  test('matches wildcard rule (match="*")', () => {
    _mockTools = [{ id: 't1', name: 'qb1', mock_rules: JSON.stringify([
      { tool_name: 'qb1', match: '*', response: '{"amount":100}' },
    ]) }];
    expect(matchMockRule('qb1', { phone: '138' })).toBe('{"amount":100}');
  });

  test('matches empty-string match as wildcard', () => {
    _mockTools = [{ id: 't2', name: 'qb2', mock_rules: JSON.stringify([
      { tool_name: 'qb2', match: '', response: '"default"' },
    ]) }];
    expect(matchMockRule('qb2', {})).toBe('default');
  });

  test('matches null/undefined match as wildcard', () => {
    _mockTools = [{ id: 't3', name: 'qb3', mock_rules: JSON.stringify([
      { tool_name: 'qb3', match: null, response: '"fallback"' },
    ]) }];
    expect(matchMockRule('qb3', {})).toBe('fallback');
  });

  test('matches specific JS expression', () => {
    _mockTools = [{ id: 't4', name: 'qb4', mock_rules: JSON.stringify([
      { tool_name: 'qb4', match: 'phone === "13800001111"', response: '{"amount":200}' },
      { tool_name: 'qb4', match: '*', response: '{"amount":0}' },
    ]) }];
    expect(matchMockRule('qb4', { phone: '13800001111' })).toBe('{"amount":200}');
  });

  test('expression match takes priority over wildcard', () => {
    _mockTools = [{ id: 't5', name: 'qb5', mock_rules: JSON.stringify([
      { tool_name: 'qb5', match: '*', response: '"wildcard"' },
      { tool_name: 'qb5', match: 'phone === "A"', response: '"specific"' },
    ]) }];
    expect(matchMockRule('qb5', { phone: 'A' })).toBe('specific');
  });

  test('falls back to wildcard when expression does not match', () => {
    _mockTools = [{ id: 't6', name: 'qb6', mock_rules: JSON.stringify([
      { tool_name: 'qb6', match: '*', response: '"wildcard"' },
      { tool_name: 'qb6', match: 'phone === "X"', response: '"specific"' },
    ]) }];
    expect(matchMockRule('qb6', { phone: 'Y' })).toBe('wildcard');
  });

  test('skips invalid JS expression without throwing', () => {
    _mockTools = [{ id: 't7', name: 'qb7', mock_rules: JSON.stringify([
      { tool_name: 'qb7', match: '!!!invalid syntax', response: '"bad"' },
      { tool_name: 'qb7', match: '*', response: '"good"' },
    ]) }];
    expect(matchMockRule('qb7', {})).toBe('good');
  });

  test('response is returned as string when it is plain text', () => {
    _mockTools = [{ id: 't8', name: 'qb8', mock_rules: JSON.stringify([
      { tool_name: 'qb8', match: '*', response: 'just plain text' },
    ]) }];
    expect(matchMockRule('qb8', {})).toBe('just plain text');
  });

  test('response JSON object is stringified back', () => {
    _mockTools = [{ id: 't9', name: 'qb9', mock_rules: JSON.stringify([
      { tool_name: 'qb9', match: '*', response: '{"a":1}' },
    ]) }];
    expect(matchMockRule('qb9', {})).toBe('{"a":1}');
  });

  test('skips tools with null mock_rules', () => {
    _mockTools = [
      { id: 't10a', name: 'qb10a', mock_rules: null },
      { id: 't10b', name: 'qb10b', mock_rules: JSON.stringify([{ tool_name: 'qb10b', match: '*', response: '"ok"' }]) },
    ];
    expect(matchMockRule('qb10b', {})).toBe('ok');
  });

  test('skips tools with invalid JSON in mock_rules', () => {
    _mockTools = [
      { id: 't11a', name: 'qb11a', mock_rules: 'not-json{' },
      { id: 't11b', name: 'qb11b', mock_rules: JSON.stringify([{ tool_name: 'qb11b', match: '*', response: '"ok"' }]) },
    ];
    expect(matchMockRule('qb11b', {})).toBe('ok');
  });
});

// ── getMockedToolNames ───────────────────────────────────────────────────

describe('getMockedToolNames', () => {
  test('returns mocked tool names from mcpTools', () => {
    _mockTools = [
      { id: 't1', name: 'mn1', mocked: true },
      { id: 't2', name: 'mn2', mocked: false },
      { id: 't3', name: 'mn3', mocked: true },
    ];
    const names = getMockedToolNames();
    expect(names.has('mn1')).toBe(true);
    expect(names.has('mn3')).toBe(true);
    expect(names.has('mn2')).toBe(false);
  });

  test('falls back to mcpServers mocked_tools when mcpTools is empty', () => {
    _mockTools = [];
    _mockServers = [{ id: 's1', name: 'srv', mocked_tools: JSON.stringify(['tool_from_server']) }];
    const names = getMockedToolNames();
    expect(names.has('tool_from_server')).toBe(true);
  });
});

// ── getMockedToolDefinitions ─────────────────────────────────────────────

describe('getMockedToolDefinitions', () => {
  test('returns definitions from mcpTools', () => {
    _mockTools = [
      { id: 't1', name: 'md1', description: 'Query bill', mocked: true, input_schema: '{"type":"object"}' },
      { id: 't2', name: 'md2', description: 'Query plan', mocked: false, input_schema: null },
    ];
    const defs = getMockedToolDefinitions();
    expect(defs.find(d => d.name === 'md1')).toBeDefined();
    expect(defs.find(d => d.name === 'md2')).toBeUndefined();
  });

  test('falls back to mcpServers tools_json + mocked_tools when mcpTools is empty', () => {
    _mockTools = [];
    _mockServers = [{
      id: 's1', name: 'srv',
      mocked_tools: JSON.stringify(['tool1']),
      tools_json: JSON.stringify([
        { name: 'tool1', description: 'Server tool', inputSchema: { type: 'object' } },
        { name: 'other', description: 'Not mocked' },
      ]),
    }];
    const defs = getMockedToolDefinitions();
    expect(defs.find(d => d.name === 'tool1')).toBeDefined();
    expect(defs.find(d => d.name === 'other')).toBeUndefined();
  });
});

// ── getRegisteredToolNames ───────────────────────────────────────────────

describe('getRegisteredToolNames', () => {
  test('returns tool names from mcpTools plus built-ins', () => {
    _mockTools = [{ id: 't1', name: 'rn1' }, { id: 't2', name: 'rn2' }];
    const names = getRegisteredToolNames();
    expect(names.has('rn1')).toBe(true);
    expect(names.has('rn2')).toBe(true);
    expect(names.has('get_skill_instructions')).toBe(true);
    expect(names.has('transfer_to_human')).toBe(true);
  });

  test('falls back to mcpServers tools_json when mcpTools is empty', () => {
    _mockTools = [];
    _mockServers = [{ id: 's1', name: 'srv', tools_json: JSON.stringify([{ name: 'from_server' }]) }];
    const names = getRegisteredToolNames();
    expect(names.has('from_server')).toBe(true);
    expect(names.has('get_skill_instructions')).toBe(true);
  });

  test('built-in tools are always included', () => {
    _mockTools = [];
    _mockServers = [];
    const names = getRegisteredToolNames();
    expect(names.has('get_skill_instructions')).toBe(true);
    expect(names.has('get_skill_reference')).toBe(true);
    expect(names.has('transfer_to_human')).toBe(true);
  });
});
