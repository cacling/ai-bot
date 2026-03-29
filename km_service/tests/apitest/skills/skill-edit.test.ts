/**
 * API tests for: src/agent/km/skills/skill-edit.ts
 * Routes: POST /api/skill-edit/clarify, POST /api/skill-edit, POST /api/skill-edit/apply
 * Mock: LLM (generateText), fs, db, auth
 */
import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { postJSON } from '../helpers';
import { pathsStubs } from '../mock-db-stubs';

// ── Mutable mock state ──────────────────────────────────────────────────────

let mockGenerateTextResult = { text: '' };
let mockGenerateTextQueue: Array<{ text: string }> = [];
let mockFileContent = '---\nname: bill-inquiry\n---\n# Bill Inquiry\n\nSome content here.';
let mockFileExists = true;
let writtenContent: string | null = null;
let mockToolsOverview: Array<{ name: string; description: string; status: string; skills: string[] }> = [];

// ── Mock AI SDK ─────────────────────────────────────────────────────────────

mock.module('ai', () => ({
  generateText: async () => mockGenerateTextQueue.shift() ?? mockGenerateTextResult,
}));

mock.module('../../../src/llm', () => ({
  chatModel: 'mock-chat-model',
}));

mock.module('../../../src/mcp/tools-overview', () => ({
  getToolsOverview: () => mockToolsOverview,
}));

// ── Mock fs ─────────────────────────────────────────────────────────────────

mock.module('node:fs/promises', () => ({
  readFile: async (path: string, _enc?: string) => {
    if (!mockFileExists) throw new Error(`ENOENT: ${path}`);
    return mockFileContent;
  },
  writeFile: async (_path: string, content: string, _enc?: string) => {
    writtenContent = content;
  },
}));

mock.module('node:fs', () => ({
  readdirSync: (_path: string, _opts?: unknown) => {
    return [
      { name: 'bill-inquiry', isDirectory: () => true },
    ].filter(d => d.isDirectory());
  },
  existsSync: (_path: string) => mockFileExists,
  readFileSync: (_path: string, _enc?: string) => mockFileContent,
}));

// ── Mock auth ───────────────────────────────────────────────────────────────

mock.module('../../../src/auth', () => ({
  requireRole: () => async (_c: unknown, next: () => Promise<void>) => { await next(); },
}));

// ── Mock paths ──────────────────────────────────────────────────────────────

mock.module('../../../src/paths', () => ({ ...pathsStubs,
  REPO_ROOT: '/fake/repo',
  BIZ_SKILLS_DIR: '/fake/repo/backend/skills/biz-skills',
}));

// ── Mock logger ─────────────────────────────────────────────────────────────

mock.module('../../../src/logger', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {} },
}));

// ── Setup ───────────────────────────────────────────────────────────────────

let app: Hono;

async function setupApp() {
  const mod = await import('../../../src/skills/skill-edit');
  app = new Hono();
  app.route('/api/skill-edit', mod.default);
}

// ── Tests: POST /api/skill-edit/clarify ─────────────────────────────────────

describe('POST /api/skill-edit/clarify', () => {
  beforeEach(async () => {
    mockGenerateTextQueue = [];
    mockFileExists = true;
    mockFileContent = '---\nname: bill-inquiry\n---\n# Bill Inquiry\n\nSome content here.';
    mockToolsOverview = [];
    await setupApp();
  });

  test('returns clarification questions for ambiguous edit request', async () => {
    mockGenerateTextResult = {
      text: JSON.stringify({
        is_complete: false,
        missing_items: ['target skill name', 'specific content to change'],
        clarify_question: 'Which skill do you want to modify? What specific change do you need?',
        parsed_intent: {
          target_skill: null,
          change_type: 'wording',
          details: 'unclear',
          risk_level: 'low',
        },
      }),
    };
    const { status, body } = await postJSON(app, '/api/skill-edit/clarify', {
      instruction: 'Change something',
    });
    expect(status).toBe(200);
    expect(body.status).toBe('need_clarify');
    expect(body.question).toBeDefined();
    expect(typeof body.question).toBe('string');
    expect(body.missing).toBeDefined();
    expect(Array.isArray(body.missing)).toBe(true);
    expect(body.missing.length).toBeGreaterThan(0);
  });

  test('returns phased schema while preserving legacy clarify fields', async () => {
    mockGenerateTextResult = {
      text: JSON.stringify({
        status: 'need_clarify',
        phase: 'target_confirm',
        question: '你要改的是 bill-inquiry 还是其他技能？',
        options: [{ id: 'bill-inquiry', label: 'bill-inquiry', description: '账单查询技能' }],
        missing: ['target skill'],
        summary: {
          target_skill: null,
          change_type: 'wording',
          change_summary: '用户想改账单查询相关话术，但目标技能未锁定',
          affected_area: [],
          unchanged_area: [],
          related_docs: [],
          acceptance_signal: '',
          risk_level: 'low',
        },
        evidence: {
          explicit: ['用户说要改账单查询话术'],
          inferred: ['可能是 bill-inquiry'],
          repo_observations: [],
        },
        impact: {
          needs_reference_update: false,
          needs_workflow_change: false,
          needs_channel_review: false,
          needs_human_escalation_review: false,
          out_of_scope_reason: '',
        },
        handoff: {
          ready_for_edit: false,
          target_files: [],
          edit_invariants: [],
        },
      }),
    };
    const { status, body } = await postJSON(app, '/api/skill-edit/clarify', {
      message: '把账单查询的话术改一下',
    });
    expect(status).toBe(200);
    expect(body.session_id).toBeDefined();
    expect(body.phase).toBe('target_confirm');
    expect(body.missing_items).toEqual(body.missing);
    expect(body.parsed_intent.target_skill).toBe(null);
    expect(body.summary.change_type).toBe('wording');
  });

  test('downgrades premature ready to impact_confirm when hard gates are unmet', async () => {
    mockGenerateTextResult = {
      text: JSON.stringify({
        status: 'ready',
        phase: 'ready',
        question: '',
        options: [],
        missing: [],
        summary: {
          target_skill: 'bill-inquiry',
          change_type: 'wording',
          change_summary: '把账单查询答复改短一点',
          affected_area: ['SKILL.md: 账单结果回复'],
          unchanged_area: [],
          related_docs: [],
          acceptance_signal: '',
          risk_level: 'medium',
        },
        evidence: {
          explicit: ['用户要改账单查询答复'],
          inferred: [],
          repo_observations: [],
        },
        impact: {
          needs_reference_update: true,
          needs_workflow_change: false,
          needs_channel_review: false,
          needs_human_escalation_review: false,
          out_of_scope_reason: '',
        },
        handoff: {
          ready_for_edit: true,
          target_files: [],
          edit_invariants: [],
        },
      }),
    };
    const { status, body } = await postJSON(app, '/api/skill-edit/clarify', {
      instruction: '把账单查询答复改短一点',
    });
    expect(status).toBe(200);
    expect(body.status).toBe('need_clarify');
    expect(body.phase).toBe('impact_confirm');
    expect(body.question).toContain('哪些部分明确不要动');
    expect(body.handoff.ready_for_edit).toBe(false);
    expect(body.missing).toContain('保持不变的范围');
    expect(body.missing).toContain('验收信号');
  });

  test('blocks capability-boundary requests instead of marking ready', async () => {
    mockGenerateTextResult = {
      text: JSON.stringify({
        status: 'ready',
        phase: 'ready',
        question: '',
        options: [],
        missing: [],
        summary: {
          target_skill: 'bill-inquiry',
          change_type: 'capability_boundary',
          change_summary: '新增自动退款办理能力',
          affected_area: ['SKILL.md: 新增自动办理分支'],
          unchanged_area: ['现有查询流程'],
          related_docs: [],
          acceptance_signal: '用户能直接退款成功',
          risk_level: 'high',
        },
        evidence: {
          explicit: ['用户要自动退款'],
          inferred: [],
          repo_observations: [],
        },
        impact: {
          needs_reference_update: false,
          needs_workflow_change: true,
          needs_channel_review: true,
          needs_human_escalation_review: true,
          out_of_scope_reason: '新增自动办理能力不属于普通技能文本编辑',
        },
        handoff: {
          ready_for_edit: true,
          target_files: [],
          edit_invariants: [],
        },
      }),
    };
    const { status, body } = await postJSON(app, '/api/skill-edit/clarify', {
      instruction: '给账单查询技能增加自动退款能力',
    });
    expect(status).toBe(200);
    expect(body.status).toBe('blocked');
    expect(body.phase).toBe('blocked');
    expect(body.message).toContain('普通技能文本编辑');
    expect(body.handoff.ready_for_edit).toBe(false);
  });

  test('adds repo observations after auto-reading the likely target skill', async () => {
    mockFileContent = `---
name: bill-inquiry
---
# Bill Inquiry

账单查询流程。

## 状态图

账单查询 --> 获取账单: query_bill(phone, month) %% tool:query_bill %% step:bill-query-bill %% kind:tool
`;
    mockGenerateTextResult = {
      text: JSON.stringify({
        status: 'ready',
        phase: 'ready',
        question: '',
        options: [],
        missing: [],
        summary: {
          target_skill: 'bill-inquiry',
          change_type: 'wording',
          change_summary: '把账单查询答复改得更简洁',
          affected_area: ['SKILL.md: 账单查询答复'],
          unchanged_area: ['流程节点不变'],
          related_docs: [],
          acceptance_signal: '回复更短但保留核心信息',
          risk_level: 'low',
        },
        evidence: {
          explicit: ['用户要改账单查询答复'],
          inferred: [],
          repo_observations: [],
        },
        impact: {
          needs_reference_update: false,
          needs_workflow_change: false,
          needs_channel_review: false,
          needs_human_escalation_review: false,
          out_of_scope_reason: '',
        },
        handoff: {
          ready_for_edit: true,
          target_files: [],
          edit_invariants: [],
        },
      }),
    };

    const { status, body } = await postJSON(app, '/api/skill-edit/clarify', {
      instruction: '把 bill-inquiry 的账单查询答复改得更简洁',
    });

    expect(status).toBe(200);
    expect(body.status).toBe('ready');
    expect(body.evidence.repo_observations.some((item: string) => item.includes('现有工具：query_bill'))).toBe(true);
  });

  test('blocks new capability requests when no matching registered tool exists', async () => {
    mockGenerateTextResult = {
      text: JSON.stringify({
        status: 'ready',
        phase: 'ready',
        question: '',
        options: [],
        missing: [],
        summary: {
          target_skill: 'bill-inquiry',
          change_type: 'new_step',
          change_summary: '新增自动退款办理分支',
          affected_area: ['SKILL.md: 新增退款分支'],
          unchanged_area: ['现有查询流程不变'],
          related_docs: [],
          acceptance_signal: '用户可以直接退款成功',
          risk_level: 'medium',
        },
        evidence: {
          explicit: ['用户想新增自动退款办理'],
          inferred: [],
          repo_observations: [],
        },
        impact: {
          needs_reference_update: false,
          needs_workflow_change: true,
          needs_channel_review: true,
          needs_human_escalation_review: true,
          out_of_scope_reason: '',
        },
        handoff: {
          ready_for_edit: true,
          target_files: [],
          edit_invariants: [],
        },
      }),
    };

    const { status, body } = await postJSON(app, '/api/skill-edit/clarify', {
      instruction: '给账单查询技能新增自动退款能力',
    });

    expect(status).toBe(200);
    expect(body.status).toBe('blocked');
    expect(body.phase).toBe('blocked');
    expect(body.message).toContain('没有找到支持退款/退费的已注册工具');
  });

  test('requires capability confirmation when matching registered tools exist', async () => {
    mockToolsOverview = [
      {
        name: 'refund_order',
        description: '处理退款申请和退费流程',
        status: 'available',
        skills: [],
      },
    ];
    mockGenerateTextResult = {
      text: JSON.stringify({
        status: 'ready',
        phase: 'ready',
        question: '',
        options: [],
        missing: [],
        summary: {
          target_skill: 'bill-inquiry',
          change_type: 'new_step',
          change_summary: '新增自动退款办理分支',
          affected_area: ['SKILL.md: 新增退款分支'],
          unchanged_area: ['现有查询流程不变'],
          related_docs: [],
          acceptance_signal: '用户可以直接退款成功',
          risk_level: 'medium',
        },
        evidence: {
          explicit: ['用户想新增自动退款办理'],
          inferred: [],
          repo_observations: [],
        },
        impact: {
          needs_reference_update: false,
          needs_workflow_change: true,
          needs_channel_review: true,
          needs_human_escalation_review: true,
          out_of_scope_reason: '',
        },
        handoff: {
          ready_for_edit: true,
          target_files: [],
          edit_invariants: [],
        },
      }),
    };

    const { status, body } = await postJSON(app, '/api/skill-edit/clarify', {
      instruction: '给账单查询技能新增自动退款能力',
    });

    expect(status).toBe(200);
    expect(body.status).toBe('need_clarify');
    expect(body.phase).toBe('impact_confirm');
    expect(body.missing).toContain('能力边界确认');
    expect(body.question).toContain('复用现有 refund_order 工具');
  });

  test('forces candidate choice after repeated unresolved turns', async () => {
    mockGenerateTextQueue = [
      {
        text: JSON.stringify({
          is_complete: false,
          missing_items: ['target skill'],
          clarify_question: '你想改哪个技能？还有具体改什么？',
          parsed_intent: {
            target_skill: null,
            change_type: 'wording',
            details: 'unclear',
            risk_level: 'low',
          },
        }),
      },
      {
        text: JSON.stringify({
          is_complete: false,
          missing_items: ['target skill'],
          clarify_question: '请再描述一下你想改哪个技能？',
          parsed_intent: {
            target_skill: null,
            change_type: 'wording',
            details: 'still unclear',
            risk_level: 'low',
          },
        }),
      },
      {
        text: JSON.stringify({
          is_complete: false,
          missing_items: ['target skill'],
          clarify_question: '我还不确定目标技能。',
          parsed_intent: {
            target_skill: null,
            change_type: 'wording',
            details: 'still unclear',
            risk_level: 'low',
          },
        }),
      },
    ];

    const first = await postJSON(app, '/api/skill-edit/clarify', {
      instruction: '改一下',
    });
    const second = await postJSON(app, '/api/skill-edit/clarify', {
      session_id: first.body.session_id,
      instruction: '就是那个查询的',
    });
    const third = await postJSON(app, '/api/skill-edit/clarify', {
      session_id: second.body.session_id,
      instruction: '账单那个吧',
    });

    expect(third.status).toBe(200);
    expect(third.body.status).toBe('need_clarify');
    expect(third.body.phase).toBe('target_confirm');
    expect(third.body.question).toContain('先从下面候选技能里选一个');
    expect(Array.isArray(third.body.options)).toBe(true);
    expect(third.body.options.length).toBeGreaterThan(0);
    expect(third.body.options[0].id).toBe('bill-inquiry');
  });

  test('returns 400 when instruction is missing', async () => {
    const { status, body } = await postJSON(app, '/api/skill-edit/clarify', {
      instruction: '',
    });
    expect(status).toBe(400);
    expect(body.error).toContain('instruction');
  });
});

// ── Tests: POST /api/skill-edit ─────────────────────────────────────────────

describe('POST /api/skill-edit', () => {
  beforeEach(async () => {
    mockGenerateTextQueue = [];
    mockFileExists = true;
    mockFileContent = '---\nname: bill-inquiry\n---\n# Bill Inquiry\n\nSome content here.\n\nOld wording that needs change.';
    mockToolsOverview = [];
    await setupApp();
  });

  test('returns diff (old_fragment -> new_fragment) for edit request', async () => {
    mockGenerateTextResult = {
      text: JSON.stringify({
        skill_path: 'skills/biz-skills/bill-inquiry/SKILL.md',
        old_fragment: 'Old wording that needs change.',
        new_fragment: 'New improved wording.',
        explanation: 'Updated the wording to be clearer.',
      }),
    };
    const { status, body } = await postJSON(app, '/api/skill-edit', {
      instruction: 'Change the wording in bill-inquiry to be clearer',
    });
    expect(status).toBe(200);
    expect(body.skill_path).toBeDefined();
    expect(body.diff).toBeDefined();
    expect(body.diff.old).toBe('Old wording that needs change.');
    expect(body.diff.new).toBe('New improved wording.');
    expect(body.explanation).toBeDefined();
  });

  test('generates correct diff for adding a new state', async () => {
    mockGenerateTextResult = {
      text: JSON.stringify({
        skill_path: 'skills/biz-skills/bill-inquiry/SKILL.md',
        old_fragment: 'Some content here.',
        new_fragment: 'Some content here.\n\n## New State\nAdditional flow step.',
        explanation: 'Added a new state to the flow.',
      }),
    };
    const { status, body } = await postJSON(app, '/api/skill-edit', {
      instruction: 'Add a new state to bill inquiry flow',
    });
    expect(status).toBe(200);
    expect(body.diff.new).toContain('New State');
    expect(body.diff.new).toContain('Additional flow step');
    expect(body.diff.old).toBe('Some content here.');
  });

  test('supports session-driven edit generation after ready clarify', async () => {
    mockGenerateTextResult = {
      text: JSON.stringify({
        status: 'ready',
        phase: 'ready',
        question: '',
        options: [],
        missing: [],
        summary: {
          target_skill: 'bill-inquiry',
          change_type: 'wording',
          change_summary: '把账单查询成功后的答复改得更简洁',
          affected_area: ['SKILL.md: 账单结果回复'],
          unchanged_area: ['流程和转人工条件不变'],
          related_docs: [],
          acceptance_signal: '回复更简洁但保留金额和账期信息',
          risk_level: 'low',
        },
        evidence: {
          explicit: ['用户要改账单查询成功后的答复'],
          inferred: [],
          repo_observations: [],
        },
        impact: {
          needs_reference_update: false,
          needs_workflow_change: false,
          needs_channel_review: false,
          needs_human_escalation_review: false,
          out_of_scope_reason: '',
        },
        handoff: {
          ready_for_edit: true,
          target_files: ['skills/biz-skills/bill-inquiry/SKILL.md'],
          edit_invariants: ['不要改流程节点'],
        },
      }),
    };
    const clarify = await postJSON(app, '/api/skill-edit/clarify', {
      message: '把账单查询成功后的答复改得更简洁',
    });
    expect(clarify.status).toBe(200);
    expect(clarify.body.status).toBe('ready');

    mockGenerateTextResult = {
      text: JSON.stringify({
        skill_path: 'skills/biz-skills/bill-inquiry/SKILL.md',
        old_fragment: 'Old wording that needs change.',
        new_fragment: 'Here is your bill summary in a shorter format.',
        explanation: 'Shortened the bill response wording.',
      }),
    };
    const { status, body } = await postJSON(app, '/api/skill-edit', {
      session_id: clarify.body.session_id,
    });
    expect(status).toBe(200);
    expect(body.file_path).toBe('skills/biz-skills/bill-inquiry/SKILL.md');
    expect(body.old_fragment).toBe('Old wording that needs change.');
    expect(body.new_fragment).toContain('shorter format');
  });
});

// ── Tests: POST /api/skill-edit/apply ───────────────────────────────────────

describe('POST /api/skill-edit/apply', () => {
  beforeEach(async () => {
    mockGenerateTextQueue = [];
    mockFileExists = true;
    mockFileContent = '---\nname: bill-inquiry\n---\n# Bill Inquiry\n\nOriginal fragment to replace.';
    writtenContent = null;
    mockToolsOverview = [];
    await setupApp();
  });

  test('applies diff and writes updated file', async () => {
    const { status, body } = await postJSON(app, '/api/skill-edit/apply', {
      skill_path: 'skills/biz-skills/bill-inquiry/SKILL.md',
      old_fragment: 'Original fragment to replace.',
      new_fragment: 'Replaced with new content.',
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(writtenContent).toBeDefined();
    expect(writtenContent).toContain('Replaced with new content.');
    expect(writtenContent).not.toContain('Original fragment to replace.');
  });

  test('returns 409 when old_fragment does not match (concurrent edit)', async () => {
    const { status, body } = await postJSON(app, '/api/skill-edit/apply', {
      skill_path: 'skills/biz-skills/bill-inquiry/SKILL.md',
      old_fragment: 'This text does not exist in the file.',
      new_fragment: 'Some replacement.',
    });
    expect(status).toBe(409);
    expect(body.error).toContain('不匹配');
  });

  test('returns 404 when file does not exist', async () => {
    mockFileExists = false;
    const { status, body } = await postJSON(app, '/api/skill-edit/apply', {
      skill_path: 'skills/biz-skills/nonexistent/SKILL.md',
      old_fragment: 'anything',
      new_fragment: 'replacement',
    });
    expect(status).toBe(404);
    expect(body.error).toContain('不存在');
  });

  test('accepts file_path alias for frontend compatibility', async () => {
    const { status, body } = await postJSON(app, '/api/skill-edit/apply', {
      file_path: 'skills/biz-skills/bill-inquiry/SKILL.md',
      old_fragment: 'Original fragment to replace.',
      new_fragment: 'Replaced through file_path alias.',
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(writtenContent).toContain('Replaced through file_path alias.');
  });
});
