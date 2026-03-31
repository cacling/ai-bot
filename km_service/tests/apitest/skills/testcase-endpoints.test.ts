/**
 * API tests for: version-bound test case endpoints
 * Routes: POST /:skillId/:vno/generate-testcases, GET /:skillId/:vno/testcases,
 *         POST /:skillId/:vno/run-testcase, POST /:skillId/:vno/run-all-testcases
 * Mock: db, fs, version-manager, engine-stubs, testcase-generator, testcase-runner
 */
import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { getJSON, postJSON } from '../helpers';
import { tableStubs, pathsStubs, engineStubs, versionManagerStubs } from '../mock-db-stubs';

// ── Mock data ───────────────────────────────────────────────────────────────

const MOCK_VERSION_DETAIL = {
  version_no: 5,
  skill_id: 'bill-inquiry',
  status: 'saved',
  snapshot_path: '.versions/bill-inquiry/v5',
  description: 'Test version',
};

const MOCK_MANIFEST = {
  meta: {
    skill_id: 'bill-inquiry',
    version_no: 5,
    generated_at: '2026-03-31T10:00:00.000Z',
    source_checksum: 'abc123',
    generator_version: '1.0',
  },
  requirements: [
    { id: 'REQ-001', source: 'frontmatter', description: '用户查询账单时触发' },
    { id: 'REQ-002', source: 'tool', description: '必须调用 query_bill 查询账单' },
    { id: 'REQ-003', source: 'workflow', description: '查询后应向用户确认' },
  ],
  cases: [
    {
      id: 'TC-001',
      title: '查询当月账单 — 正常流程',
      category: 'functional' as const,
      priority: 1,
      requirement_refs: ['REQ-001', 'REQ-002'],
      turns: ['我想查一下这个月的话费'],
      assertions: [
        { type: 'tool_called', value: 'query_bill' },
        { type: 'contains', value: '账单' },
      ],
      notes: '主路径测试',
    },
    {
      id: 'TC-002',
      title: '无账单数据 — 空结果',
      category: 'edge' as const,
      priority: 2,
      requirement_refs: ['REQ-001'],
      turns: ['查一下我的账单'],
      assertions: [
        { type: 'tool_called', value: 'query_bill' },
        { type: 'response_mentions_any', value: '暂无,没有' },
      ],
    },
    {
      id: 'TC-003',
      title: '工具调用失败 — 转人工',
      category: 'error' as const,
      priority: 2,
      requirement_refs: ['REQ-002'],
      turns: ['查询我的账单'],
      assertions: [
        { type: 'response_mentions_any', value: '抱歉,人工' },
      ],
    },
    {
      id: 'TC-004',
      title: '确认后结束 — 状态迁移',
      category: 'state' as const,
      priority: 2,
      requirement_refs: ['REQ-003'],
      turns: ['查一下话费', '好的，谢谢'],
      assertions: [
        { type: 'response_has_next_step', value: '' },
      ],
    },
  ],
};

const MOCK_CASE_RESULT = {
  case_id: 'TC-001',
  title: '查询当月账单 — 正常流程',
  category: 'functional',
  status: 'passed' as const,
  assertions: [
    { type: 'tool_called', value: 'query_bill', passed: true, detail: '调用了工具 query_bill' },
    { type: 'contains', value: '账单', passed: true, detail: '回复包含 "账单"' },
  ],
  transcript: [
    { role: 'user' as const, text: '我想查一下这个月的话费' },
    { role: 'assistant' as const, text: '您本月的账单金额为 68.50 元。' },
  ],
  tools_called: ['query_bill'],
  skills_loaded: ['bill-inquiry'],
  duration_ms: 3500,
};

const MOCK_BATCH_RESULT = {
  total: 4,
  passed: 3,
  failed: 1,
  infra_error: 0,
  results: [
    { ...MOCK_CASE_RESULT },
    { ...MOCK_CASE_RESULT, case_id: 'TC-002', title: '无账单数据', status: 'passed' as const },
    { ...MOCK_CASE_RESULT, case_id: 'TC-003', title: '工具调用失败', status: 'failed' as const,
      assertions: [{ type: 'response_mentions_any', value: '抱歉,人工', passed: false, detail: '回复未包含任一关键词' }],
    },
    { ...MOCK_CASE_RESULT, case_id: 'TC-004', title: '确认后结束', status: 'passed' as const },
  ],
};

// ── Mutable mock state ──────────────────────────────────────────────────────

let mockVersionDetail: typeof MOCK_VERSION_DETAIL | null = null;
let mockManifest: typeof MOCK_MANIFEST | null = null;
let generateResult: typeof MOCK_MANIFEST | Error = MOCK_MANIFEST;
let singleCaseResult: typeof MOCK_CASE_RESULT | Error = MOCK_CASE_RESULT;
let batchResult: typeof MOCK_BATCH_RESULT | Error = MOCK_BATCH_RESULT;
let mockReadFileSync: string = '---\nname: bill-inquiry\n---\n# Bill Inquiry';
let mockExistsSync: boolean = true;
let mockRunAgentResult = { text: 'Hello from agent', card: null, skill_diagram: null, toolRecords: [], transferData: null };

// ── Mock modules ────────────────────────────────────────────────────────────

mock.module('../../../src/skills/version-manager', () => ({ ...versionManagerStubs,
  getVersionDetail: (_skillId: string, _versionNo: number) => mockVersionDetail,
  writeVersionFile: async () => {},
}));

mock.module('../../../src/skills/testcase-generator', () => ({
  generateTestCases: async (_skillId: string, _versionNo: number) => {
    if (generateResult instanceof Error) throw generateResult;
    return generateResult;
  },
  readTestManifest: async (_skillId: string, _versionNo: number) => mockManifest,
}));

mock.module('../../../src/skills/testcase-runner', () => ({
  runSingleTestCase: async (_skillId: string, _vno: number, _caseEntry: unknown, _persona?: unknown) => {
    if (singleCaseResult instanceof Error) throw singleCaseResult;
    return singleCaseResult;
  },
  runAllTestCases: async (_skillId: string, _vno: number, _persona?: unknown) => {
    if (batchResult instanceof Error) throw batchResult;
    return batchResult;
  },
}));

// ── Mock fs / engine / db ───────────────────────────────────────────────────

mock.module('node:fs/promises', () => ({
  readdir: async () => [],
  stat: async () => ({ mtime: new Date(), isDirectory: () => true }),
  readFile: async () => mockReadFileSync,
}));

mock.module('node:fs', () => ({
  readFileSync: () => mockReadFileSync,
  mkdtempSync: () => '/tmp/skill-test-abc123',
  cpSync: () => {},
  rmSync: () => {},
  existsSync: () => mockExistsSync,
}));

mock.module('node:os', () => ({
  tmpdir: () => '/tmp',
}));

mock.module('../../../src/engine-stubs', () => ({ ...engineStubs,
  runAgent: async () => mockRunAgentResult,
  SOP_ENFORCEMENT_SUFFIX: '\n---SOP---',
  compileWorkflow: () => ({ spec: { states: [] }, errors: [], warnings: [] }),
}));

mock.module('../../../src/skill-markdown', () => ({
  extractPrimaryMermaidBlock: () => null,
  findCustomerGuidanceDiagramSection: () => ({ hasSection: false, hasMermaidBlock: false }),
}));

mock.module('../../../src/mermaid', () => ({
  stripMermaidMarkers: (m: string) => m,
  buildNodeTypeMap: () => ({}),
}));

mock.module('../../../src/skill-workflow-compiler', () => ({
  compileWorkflow: () => ({ spec: null, errors: [], warnings: [] }),
}));

mock.module('../../../../backend/skills/tech-skills/skill-creator-spec/scripts/run_validation', () => ({
  runValidation: () => ({ valid: true, errors: [], warnings: [], infos: [] }),
}));

mock.module('../../../../backend/skills/tech-skills/skill-creator-spec/scripts/validate_statediagram', () => ({
  parseStateDiagram: () => ({ states: [], transitions: [], annotations: [], hasStart: true, hasEnd: true }),
  extractMermaidBlock: () => null,
  validateStatediagram: () => [],
}));

mock.module('../../../src/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ get: () => null, then: (r: (v: unknown[]) => void) => r([]) }), then: (r: (v: unknown[]) => void) => r([]) }) }),
    insert: () => ({ values: () => ({ returning: () => ({ then: (r: (v: unknown[]) => void) => r([]) }), run: () => {}, then: (r: (v: void) => void) => r() }) }),
    delete: () => ({ where: () => ({ run: () => {}, then: (r: (v: void) => void) => r() }) }),
    update: () => ({ set: () => ({ where: () => ({ run: () => {}, then: (r: (v: void) => void) => r() }) }) }),
  },
  ...tableStubs,
}));

mock.module('../../../src/logger', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {} },
}));

mock.module('../../../src/paths', () => ({ ...pathsStubs,
  REPO_ROOT: '/fake/repo',
  SKILLS_ROOT: '/fake/repo/backend/skills',
}));

// ── Setup ───────────────────────────────────────────────────────────────────

let app: Hono;

async function setupApp() {
  const mod = await import('../../../src/skills/skill-versions');
  app = new Hono();
  app.route('/api/skill-versions', mod.default);
}

// ── Tests: POST generate-testcases ──────────────────────────────────────────

describe('POST /api/skill-versions/:skillId/:vno/generate-testcases', () => {
  beforeEach(async () => {
    mockVersionDetail = { ...MOCK_VERSION_DETAIL };
    generateResult = { ...MOCK_MANIFEST };
    await setupApp();
  });

  test('TC-GEN-01: generates testcases and returns manifest', async () => {
    const { status, body } = await postJSON(app, '/api/skill-versions/bill-inquiry/5/generate-testcases', {});
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.manifest).toBeDefined();
    expect(body.manifest.meta.skill_id).toBe('bill-inquiry');
    expect(body.manifest.meta.version_no).toBe(5);
    expect(Array.isArray(body.manifest.requirements)).toBe(true);
    expect(body.manifest.requirements.length).toBe(3);
    expect(Array.isArray(body.manifest.cases)).toBe(true);
    expect(body.manifest.cases.length).toBe(4);
  });

  test('TC-GEN-02: returns manifest with all 4 categories', async () => {
    const { status, body } = await postJSON(app, '/api/skill-versions/bill-inquiry/5/generate-testcases', {});
    expect(status).toBe(200);
    const categories = new Set(body.manifest.cases.map((c: { category: string }) => c.category));
    expect(categories.has('functional')).toBe(true);
    expect(categories.has('edge')).toBe(true);
    expect(categories.has('error')).toBe(true);
    expect(categories.has('state')).toBe(true);
  });

  test('TC-GEN-03: each case has required fields', async () => {
    const { status, body } = await postJSON(app, '/api/skill-versions/bill-inquiry/5/generate-testcases', {});
    expect(status).toBe(200);
    for (const c of body.manifest.cases) {
      expect(c.id).toBeDefined();
      expect(c.title).toBeDefined();
      expect(c.category).toBeDefined();
      expect(c.priority).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(c.requirement_refs)).toBe(true);
      expect(c.requirement_refs.length).toBeGreaterThan(0);
      expect(Array.isArray(c.turns)).toBe(true);
      expect(c.turns.length).toBeGreaterThan(0);
      expect(Array.isArray(c.assertions)).toBe(true);
      expect(c.assertions.length).toBeGreaterThan(0);
    }
  });

  test('TC-GEN-04: multi-turn case has multiple turns', async () => {
    const { body } = await postJSON(app, '/api/skill-versions/bill-inquiry/5/generate-testcases', {});
    const stateCase = body.manifest.cases.find((c: { id: string }) => c.id === 'TC-004');
    expect(stateCase).toBeDefined();
    expect(stateCase.turns.length).toBe(2);
  });

  test('TC-GEN-05: returns 500 when generator throws', async () => {
    generateResult = new Error('LLM 调用失败: 429 Too Many Requests');
    const { status, body } = await postJSON(app, '/api/skill-versions/bill-inquiry/5/generate-testcases', {});
    expect(status).toBe(500);
    expect(body.error).toContain('生成测试用例失败');
    expect(body.error).toContain('LLM');
  });

  test('TC-GEN-06: returns 500 for invalid vno', async () => {
    const { status, body } = await postJSON(app, '/api/skill-versions/bill-inquiry/abc/generate-testcases', {});
    expect(status).toBe(400);
    expect(body.error).toBeDefined();
  });
});

// ── Tests: GET testcases ────────────────────────────────────────────────────

describe('GET /api/skill-versions/:skillId/:vno/testcases', () => {
  beforeEach(async () => {
    mockVersionDetail = { ...MOCK_VERSION_DETAIL };
    mockManifest = { ...MOCK_MANIFEST };
    await setupApp();
  });

  test('TC-READ-01: returns manifest when testcases exist', async () => {
    const { status, body } = await getJSON(app, '/api/skill-versions/bill-inquiry/5/testcases');
    expect(status).toBe(200);
    expect(body.meta).toBeDefined();
    expect(body.meta.skill_id).toBe('bill-inquiry');
    expect(body.requirements.length).toBe(3);
    expect(body.cases.length).toBe(4);
  });

  test('TC-READ-02: returns empty cases when no testcases generated', async () => {
    mockManifest = null;
    const { status, body } = await getJSON(app, '/api/skill-versions/bill-inquiry/5/testcases');
    expect(status).toBe(200);
    expect(body.cases).toEqual([]);
    expect(body.meta).toBeNull();
  });

  test('TC-READ-03: cases have requirement_refs for coverage matrix', async () => {
    const { body } = await getJSON(app, '/api/skill-versions/bill-inquiry/5/testcases');
    for (const c of body.cases) {
      expect(Array.isArray(c.requirement_refs)).toBe(true);
    }
    // 验证所有 REQ 都被至少一个 case 覆盖
    const allRefs = body.cases.flatMap((c: { requirement_refs: string[] }) => c.requirement_refs);
    for (const req of body.requirements) {
      expect(allRefs).toContain(req.id);
    }
  });

  test('TC-READ-04: returns 400 for invalid vno', async () => {
    const { status, body } = await getJSON(app, '/api/skill-versions/bill-inquiry/NaN/testcases');
    expect(status).toBe(400);
    expect(body.error).toBeDefined();
  });
});

// ── Tests: POST run-testcase ────────────────────────────────────────────────

describe('POST /api/skill-versions/:skillId/:vno/run-testcase', () => {
  beforeEach(async () => {
    mockVersionDetail = { ...MOCK_VERSION_DETAIL };
    mockManifest = { ...MOCK_MANIFEST };
    singleCaseResult = { ...MOCK_CASE_RESULT };
    await setupApp();
  });

  test('TC-RUN-01: runs single case and returns result', async () => {
    const { status, body } = await postJSON(app, '/api/skill-versions/bill-inquiry/5/run-testcase', {
      case_id: 'TC-001',
    });
    expect(status).toBe(200);
    expect(body.case_id).toBe('TC-001');
    expect(body.status).toBe('passed');
    expect(body.title).toBeDefined();
    expect(body.category).toBe('functional');
  });

  test('TC-RUN-02: result contains assertions with pass/fail detail', async () => {
    const { body } = await postJSON(app, '/api/skill-versions/bill-inquiry/5/run-testcase', {
      case_id: 'TC-001',
    });
    expect(Array.isArray(body.assertions)).toBe(true);
    expect(body.assertions.length).toBe(2);
    for (const a of body.assertions) {
      expect(a.type).toBeDefined();
      expect(a.value).toBeDefined();
      expect(typeof a.passed).toBe('boolean');
      expect(a.detail).toBeDefined();
    }
  });

  test('TC-RUN-03: result contains transcript', async () => {
    const { body } = await postJSON(app, '/api/skill-versions/bill-inquiry/5/run-testcase', {
      case_id: 'TC-001',
    });
    expect(Array.isArray(body.transcript)).toBe(true);
    expect(body.transcript.length).toBeGreaterThan(0);
    expect(body.transcript[0].role).toBe('user');
    expect(body.transcript[1].role).toBe('assistant');
  });

  test('TC-RUN-04: result contains tools_called and skills_loaded', async () => {
    const { body } = await postJSON(app, '/api/skill-versions/bill-inquiry/5/run-testcase', {
      case_id: 'TC-001',
    });
    expect(Array.isArray(body.tools_called)).toBe(true);
    expect(body.tools_called).toContain('query_bill');
    expect(Array.isArray(body.skills_loaded)).toBe(true);
  });

  test('TC-RUN-05: result contains duration_ms', async () => {
    const { body } = await postJSON(app, '/api/skill-versions/bill-inquiry/5/run-testcase', {
      case_id: 'TC-001',
    });
    expect(typeof body.duration_ms).toBe('number');
    expect(body.duration_ms).toBeGreaterThanOrEqual(0);
  });

  test('TC-RUN-06: returns 404 when testcases not generated', async () => {
    mockManifest = null;
    const { status, body } = await postJSON(app, '/api/skill-versions/bill-inquiry/5/run-testcase', {
      case_id: 'TC-001',
    });
    expect(status).toBe(404);
    expect(body.error).toContain('尚未生成');
  });

  test('TC-RUN-07: returns 404 for non-existent case_id', async () => {
    const { status, body } = await postJSON(app, '/api/skill-versions/bill-inquiry/5/run-testcase', {
      case_id: 'TC-999',
    });
    expect(status).toBe(404);
    expect(body.error).toContain('TC-999');
  });

  test('TC-RUN-08: returns 400 when case_id is missing', async () => {
    const { status, body } = await postJSON(app, '/api/skill-versions/bill-inquiry/5/run-testcase', {});
    expect(status).toBe(400);
    expect(body.error).toContain('case_id');
  });

  test('TC-RUN-09: returns 500 when runner throws', async () => {
    singleCaseResult = new Error('Agent 超时');
    const { status, body } = await postJSON(app, '/api/skill-versions/bill-inquiry/5/run-testcase', {
      case_id: 'TC-001',
    });
    expect(status).toBe(500);
    expect(body.error).toContain('执行测试用例失败');
  });

  test('TC-RUN-10: accepts optional persona in request body', async () => {
    const { status, body } = await postJSON(app, '/api/skill-versions/bill-inquiry/5/run-testcase', {
      case_id: 'TC-001',
      persona: { phone: '13900000001', name: '测试用户' },
    });
    expect(status).toBe(200);
    expect(body.case_id).toBe('TC-001');
  });
});

// ── Tests: POST run-all-testcases ───────────────────────────────────────────

describe('POST /api/skill-versions/:skillId/:vno/run-all-testcases', () => {
  beforeEach(async () => {
    mockVersionDetail = { ...MOCK_VERSION_DETAIL };
    mockManifest = { ...MOCK_MANIFEST };
    batchResult = { ...MOCK_BATCH_RESULT };
    await setupApp();
  });

  test('TC-BATCH-01: runs all cases and returns aggregated result', async () => {
    const { status, body } = await postJSON(app, '/api/skill-versions/bill-inquiry/5/run-all-testcases', {});
    expect(status).toBe(200);
    expect(body.total).toBe(4);
    expect(body.passed).toBe(3);
    expect(body.failed).toBe(1);
    expect(body.infra_error).toBe(0);
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.results.length).toBe(4);
  });

  test('TC-BATCH-02: total = passed + failed + infra_error', async () => {
    const { body } = await postJSON(app, '/api/skill-versions/bill-inquiry/5/run-all-testcases', {});
    expect(body.total).toBe(body.passed + body.failed + body.infra_error);
  });

  test('TC-BATCH-03: each result has complete structure', async () => {
    const { body } = await postJSON(app, '/api/skill-versions/bill-inquiry/5/run-all-testcases', {});
    for (const r of body.results) {
      expect(r.case_id).toBeDefined();
      expect(r.title).toBeDefined();
      expect(['passed', 'failed', 'infra_error']).toContain(r.status);
      expect(Array.isArray(r.assertions)).toBe(true);
      expect(Array.isArray(r.transcript)).toBe(true);
      expect(Array.isArray(r.tools_called)).toBe(true);
      expect(Array.isArray(r.skills_loaded)).toBe(true);
      expect(typeof r.duration_ms).toBe('number');
    }
  });

  test('TC-BATCH-04: failed case has failing assertions', async () => {
    const { body } = await postJSON(app, '/api/skill-versions/bill-inquiry/5/run-all-testcases', {});
    const failedCase = body.results.find((r: { status: string }) => r.status === 'failed');
    expect(failedCase).toBeDefined();
    const failingAssertions = failedCase.assertions.filter((a: { passed: boolean }) => !a.passed);
    expect(failingAssertions.length).toBeGreaterThan(0);
  });

  test('TC-BATCH-05: returns 500 when runner throws', async () => {
    batchResult = new Error('批量执行超时');
    const { status, body } = await postJSON(app, '/api/skill-versions/bill-inquiry/5/run-all-testcases', {});
    expect(status).toBe(500);
    expect(body.error).toContain('批量执行测试用例失败');
  });

  test('TC-BATCH-06: accepts optional persona in request body', async () => {
    const { status, body } = await postJSON(app, '/api/skill-versions/bill-inquiry/5/run-all-testcases', {
      persona: { phone: '13900000001', name: '测试用户' },
    });
    expect(status).toBe(200);
    expect(body.total).toBe(4);
  });

  test('TC-BATCH-07: works with empty request body', async () => {
    const res = await app.request('/api/skill-versions/bill-inquiry/5/run-all-testcases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(4);
  });
});

// ── Tests: assertion-evaluator (unit-level, colocated for completeness) ─────

describe('assertion-evaluator: runAssertions', () => {
  test('TC-ASSERT-01: contains assertion passes when text matches', async () => {
    const { runAssertions } = await import('../../../src/skills/assertion-evaluator');
    const results = runAssertions(
      [{ type: 'contains', value: '账单' }],
      '您本月的账单金额为 68.50 元',
      [], [],
    );
    expect(results[0].passed).toBe(true);
    expect(results[0].detail).toContain('账单');
  });

  test('TC-ASSERT-02: contains assertion fails when text does not match', async () => {
    const { runAssertions } = await import('../../../src/skills/assertion-evaluator');
    const results = runAssertions(
      [{ type: 'contains', value: '套餐' }],
      '您本月的账单金额为 68.50 元',
      [], [],
    );
    expect(results[0].passed).toBe(false);
  });

  test('TC-ASSERT-03: tool_called assertion checks tools list', async () => {
    const { runAssertions } = await import('../../../src/skills/assertion-evaluator');
    const results = runAssertions(
      [{ type: 'tool_called', value: 'query_bill' }],
      '回复',
      ['query_subscriber', 'query_bill'], [],
    );
    expect(results[0].passed).toBe(true);
  });

  test('TC-ASSERT-04: tool_called_before checks order', async () => {
    const { runAssertions } = await import('../../../src/skills/assertion-evaluator');
    const results = runAssertions(
      [{ type: 'tool_called_before', value: 'query_subscriber, query_bill' }],
      '',
      ['query_subscriber', 'query_bill'], [],
    );
    expect(results[0].passed).toBe(true);
    expect(results[0].detail).toContain('SOP 顺序正确');
  });

  test('TC-ASSERT-05: tool_called_before fails on wrong order', async () => {
    const { runAssertions } = await import('../../../src/skills/assertion-evaluator');
    const results = runAssertions(
      [{ type: 'tool_called_before', value: 'query_subscriber, query_bill' }],
      '',
      ['query_bill', 'query_subscriber'], [],
    );
    expect(results[0].passed).toBe(false);
    expect(results[0].detail).toContain('SOP 顺序违规');
  });

  test('TC-ASSERT-06: response_mentions_all requires all keywords', async () => {
    const { runAssertions } = await import('../../../src/skills/assertion-evaluator');
    const pass = runAssertions(
      [{ type: 'response_mentions_all', value: '账单, 金额' }],
      '您的账单金额为 68 元',
      [], [],
    );
    expect(pass[0].passed).toBe(true);

    const fail = runAssertions(
      [{ type: 'response_mentions_all', value: '账单, 套餐' }],
      '您的账单金额为 68 元',
      [], [],
    );
    expect(fail[0].passed).toBe(false);
    expect(fail[0].detail).toContain('套餐');
  });

  test('TC-ASSERT-07: skill_loaded checks skills list', async () => {
    const { runAssertions } = await import('../../../src/skills/assertion-evaluator');
    const results = runAssertions(
      [{ type: 'skill_loaded', value: 'bill-inquiry' }],
      '',
      [], ['bill-inquiry'],
    );
    expect(results[0].passed).toBe(true);
  });

  test('TC-ASSERT-08: regex assertion matches patterns', async () => {
    const { runAssertions } = await import('../../../src/skills/assertion-evaluator');
    const results = runAssertions(
      [{ type: 'regex', value: '\\d+\\.\\d{2}\\s*元' }],
      '账单金额为 68.50 元',
      [], [],
    );
    expect(results[0].passed).toBe(true);
  });

  test('TC-ASSERT-09: not_contains assertion works correctly', async () => {
    const { runAssertions } = await import('../../../src/skills/assertion-evaluator');
    const results = runAssertions(
      [{ type: 'not_contains', value: '错误' }],
      '查询成功',
      [], [],
    );
    expect(results[0].passed).toBe(true);
  });

  test('TC-ASSERT-10: response_has_next_step detects guidance patterns', async () => {
    const { runAssertions } = await import('../../../src/skills/assertion-evaluator');
    const results = runAssertions(
      [{ type: 'response_has_next_step', value: '' }],
      '如需进一步了解，您可以拨打客服热线',
      [], [],
    );
    expect(results[0].passed).toBe(true);
  });
});

// ── Tests: extractToolsAndSkills ────────────────────────────────────────────

describe('assertion-evaluator: extractToolsAndSkills', () => {
  test('TC-EXTRACT-01: extracts tools from toolRecords', async () => {
    const { extractToolsAndSkills } = await import('../../../src/skills/assertion-evaluator');
    const { toolsCalled, skillsLoaded } = extractToolsAndSkills({
      text: 'reply',
      toolRecords: [
        { tool: 'query_subscriber', args: { phone: '138' } },
        { tool: 'query_bill', args: { phone: '138' } },
      ],
      skill_diagram: { skill_name: 'bill-inquiry' },
    });
    expect(toolsCalled).toEqual(['query_subscriber', 'query_bill']);
    expect(skillsLoaded).toContain('bill-inquiry');
  });

  test('TC-EXTRACT-02: falls back to card type when toolRecords empty', async () => {
    const { extractToolsAndSkills } = await import('../../../src/skills/assertion-evaluator');
    const { toolsCalled } = extractToolsAndSkills({
      text: 'reply',
      toolRecords: [],
      card: { type: 'bill_card' },
    });
    expect(toolsCalled).toContain('query_bill');
  });

  test('TC-EXTRACT-03: detects transfer_to_human from transferData', async () => {
    const { extractToolsAndSkills } = await import('../../../src/skills/assertion-evaluator');
    const { toolsCalled } = extractToolsAndSkills({
      text: 'reply',
      toolRecords: [],
      transferData: { reason: 'user request' },
    });
    expect(toolsCalled).toContain('transfer_to_human');
  });

  test('TC-EXTRACT-04: detects skills from get_skill_instructions tool', async () => {
    const { extractToolsAndSkills } = await import('../../../src/skills/assertion-evaluator');
    const { skillsLoaded } = extractToolsAndSkills({
      text: 'reply',
      toolRecords: [
        { tool: 'get_skill_instructions', args: { skill_name: 'plan-inquiry' } },
      ],
    });
    expect(skillsLoaded).toContain('plan-inquiry');
  });

  test('TC-EXTRACT-05: no duplicates in skillsLoaded', async () => {
    const { extractToolsAndSkills } = await import('../../../src/skills/assertion-evaluator');
    const { skillsLoaded } = extractToolsAndSkills({
      text: 'reply',
      toolRecords: [
        { tool: 'get_skill_instructions', args: { skill_name: 'bill-inquiry' } },
      ],
      skill_diagram: { skill_name: 'bill-inquiry' },
    });
    const unique = [...new Set(skillsLoaded)];
    expect(skillsLoaded.length).toBe(unique.length);
  });
});

// ── Tests: isInfraError ─────────────────────────────────────────────────────

describe('assertion-evaluator: isInfraError', () => {
  test('TC-INFRA-01: detects 429 Too Many Requests', async () => {
    const { isInfraError } = await import('../../../src/skills/assertion-evaluator');
    expect(isInfraError(new Error('Too Many Requests'))).toBe(true);
    expect(isInfraError(new Error('HTTP 429'))).toBe(true);
  });

  test('TC-INFRA-02: detects network errors', async () => {
    const { isInfraError } = await import('../../../src/skills/assertion-evaluator');
    expect(isInfraError(new Error('ECONNRESET'))).toBe(true);
    expect(isInfraError(new Error('fetch failed'))).toBe(true);
    expect(isInfraError(new Error('ETIMEDOUT'))).toBe(true);
  });

  test('TC-INFRA-03: does not flag business errors', async () => {
    const { isInfraError } = await import('../../../src/skills/assertion-evaluator');
    expect(isInfraError(new Error('用户未找到'))).toBe(false);
    expect(isInfraError(new Error('Invalid phone number'))).toBe(false);
  });
});
