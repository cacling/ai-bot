/**
 * skill-creator-parse.test.ts — 纯函数单元测试
 *
 * 覆盖 parseSkillCreatorResponse / extractJsonCandidates / dedupeReferences
 * 这些函数不依赖 LLM、DB 或文件系统，可以完全隔离测试。
 */
import { describe, test, expect } from 'bun:test';
import { _testOnly } from '../../../../../src/agent/km/skills/skill-creator';

const { stripJsonFences, extractJsonCandidates, dedupeReferences, parseSkillCreatorResponse } = _testOnly;

// ── stripJsonFences ─────────────────────────────────────────────────────────

describe('stripJsonFences', () => {
  test('removes ```json ... ``` wrapper', () => {
    const input = '```json\n{"reply":"hello"}\n```';
    expect(stripJsonFences(input)).toBe('{"reply":"hello"}');
  });

  test('removes ``` without language tag', () => {
    const input = '```\n{"reply":"hello"}\n```';
    expect(stripJsonFences(input)).toBe('{"reply":"hello"}');
  });

  test('returns plain JSON unchanged', () => {
    const input = '{"reply":"hello","phase":"interview","draft":null}';
    expect(stripJsonFences(input)).toBe(input);
  });

  test('handles trailing fence with whitespace', () => {
    // stripJsonFences only strips fences at the start/end of the string
    const input = '```json\n{"a":1}\n```  ';
    const result = stripJsonFences(input);
    expect(result).toContain('"a":1');
    expect(result).not.toContain('```');
  });
});

// ── extractJsonCandidates ───────────────────────────────────────────────────

describe('extractJsonCandidates', () => {
  test('returns single candidate for clean JSON', () => {
    const input = '{"reply":"hi","phase":"interview","draft":null}';
    const candidates = extractJsonCandidates(input);
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    expect(JSON.parse(candidates[0])).toEqual({ reply: 'hi', phase: 'interview', draft: null });
  });

  test('extracts JSON from text with leading prose', () => {
    const input = 'Here is my response:\n{"reply":"hi","phase":"interview","draft":null}';
    const candidates = extractJsonCandidates(input);
    const parsed = candidates.map(c => { try { return JSON.parse(c); } catch { return null; } }).filter(Boolean);
    expect(parsed.length).toBeGreaterThanOrEqual(1);
    expect(parsed[0]).toHaveProperty('reply', 'hi');
  });

  test('extracts JSON wrapped in code fences', () => {
    const input = '```json\n{"reply":"ok","phase":"draft","draft":null}\n```';
    const candidates = extractJsonCandidates(input);
    const parsed = candidates.map(c => { try { return JSON.parse(c); } catch { return null; } }).filter(Boolean);
    expect(parsed.length).toBeGreaterThanOrEqual(1);
    expect(parsed[0]).toHaveProperty('phase', 'draft');
  });
});

// ── dedupeReferences ────────────────────────────────────────────────────────

describe('dedupeReferences', () => {
  test('removes duplicate filenames, keeps first occurrence', () => {
    const refs = [
      { filename: 'guide.md', content: 'first' },
      { filename: 'rules.md', content: 'rules content' },
      { filename: 'guide.md', content: 'second (duplicate)' },
    ];
    const result = dedupeReferences(refs);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ filename: 'guide.md', content: 'first' });
    expect(result[1]).toEqual({ filename: 'rules.md', content: 'rules content' });
  });

  test('returns empty array for empty input', () => {
    expect(dedupeReferences([])).toEqual([]);
  });

  test('returns same array when no duplicates', () => {
    const refs = [
      { filename: 'a.md', content: 'aaa' },
      { filename: 'b.md', content: 'bbb' },
    ];
    expect(dedupeReferences(refs)).toEqual(refs);
  });
});

// ── parseSkillCreatorResponse ───────────────────────────────────────────────

function makeSession(overrides?: Partial<{ id: string; phase: string; skill_id: string | null }>) {
  return {
    id: overrides?.id ?? 'test-session',
    skill_id: overrides?.skill_id ?? null,
    history: [] as Array<{ role: 'user' | 'assistant'; content: string }>,
    phase: (overrides?.phase ?? 'interview') as 'interview' | 'draft' | 'confirm' | 'done',
    draft: null,
    created_at: Date.now(),
  };
}

describe('parseSkillCreatorResponse', () => {
  test('parses valid interview response', () => {
    const raw = JSON.stringify({
      reply: '请问这个技能是呼入还是外呼场景？',
      phase: 'interview',
      draft: null,
    });
    const session = makeSession();
    const result = parseSkillCreatorResponse(raw, session);

    expect(result.reply).toBe('请问这个技能是呼入还是外呼场景？');
    expect(result.phase).toBe('interview');
    expect(result.draft).toBeNull();
  });

  test('forces draft to null when phase is interview', () => {
    // LLM 可能在 interview 阶段错误地附带 draft，应被清除
    const raw = JSON.stringify({
      reply: '我先帮你确认一下需求',
      phase: 'interview',
      draft: {
        skill_name: 'test-skill',
        description: 'test',
        skill_md: '# test',
        references: [],
      },
    });
    const session = makeSession();
    const result = parseSkillCreatorResponse(raw, session);

    expect(result.phase).toBe('interview');
    expect(result.draft).toBeNull();
  });

  test('falls back to session phase when draft/confirm has no draft', () => {
    // LLM 说进入 draft 阶段但没给 draft 内容，应回退到当前 phase
    const raw = JSON.stringify({
      reply: '草稿已生成',
      phase: 'draft',
      draft: null,
    });
    const session = makeSession({ phase: 'interview' });
    const result = parseSkillCreatorResponse(raw, session);

    expect(result.phase).toBe('interview'); // 回退
    expect(result.draft).toBeNull();
  });

  test('downgrades confirm to draft when test_cases < 3', () => {
    const raw = JSON.stringify({
      reply: '请确认草稿',
      phase: 'confirm',
      draft: {
        skill_name: 'my-skill',
        description: 'A skill',
        skill_md: '# My Skill',
        references: [],
        test_cases: [
          { input: '查话费', assertions: [{ type: 'contains', value: '话费' }] },
        ],
      },
    });
    const session = makeSession({ phase: 'draft' });
    const result = parseSkillCreatorResponse(raw, session);

    expect(result.phase).toBe('draft'); // 降级，因为 test_cases 不足 3 条
    expect(result.draft).not.toBeNull();
  });

  test('falls back gracefully for non-JSON response', () => {
    const raw = '抱歉，我无法生成有效的 JSON 响应。让我重新尝试。';
    const session = makeSession({ phase: 'interview' });
    const result = parseSkillCreatorResponse(raw, session);

    expect(result.reply).toBe(raw);
    expect(result.phase).toBe('interview'); // 保持当前 phase
    expect(result.draft).toBeNull();
  });

  test('extracts JSON from response with leading text', () => {
    const raw = '好的，以下是我的回复：\n{"reply":"你好","phase":"interview","draft":null}';
    const session = makeSession();
    const result = parseSkillCreatorResponse(raw, session);

    expect(result.reply).toBe('你好');
    expect(result.phase).toBe('interview');
  });
});
