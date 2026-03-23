/**
 * sandbox.ts — 沙箱验证环境 API
 *
 * POST   /api/sandbox/create      — 创建沙箱（复制 Skill 文件到隔离目录）
 * PUT    /api/sandbox/:id/content  — 编辑沙箱中的文件
 * GET    /api/sandbox/:id/content  — 读取沙箱中的文件
 * POST   /api/sandbox/:id/test     — 在沙箱环境中运行 Agent 对话
 * POST   /api/sandbox/:id/validate — 静态检查（Mermaid 语法、工具引用等）
 * POST   /api/sandbox/:id/publish  — 发布到生产环境
 * DELETE /api/sandbox/:id          — 删除沙箱
 */

import { Hono } from 'hono';
import { resolve, join, dirname, basename } from 'node:path';
import { readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { type CoreMessage } from 'ai';
import { eq } from 'drizzle-orm';
import { runAgent } from '../../../engine/runner';
// Sandbox publish now handled by frontend via /api/skill-versions/publish
import { logger } from '../../../services/logger';
import { requireRole } from '../../../services/auth';
import { getRegisteredToolNames } from '../../../services/mock-engine';
import { getToolsOverview } from '../mcp/tools-overview';
import { db } from '../../../db';
import { testCases, testPersonas } from '../../../db/schema';

import { REPO_ROOT } from '../../../services/paths';
const PROJECT_ROOT = REPO_ROOT;
const SANDBOX_ROOT = resolve(PROJECT_ROOT, 'backend/skills', '.sandbox');

// In-memory sandbox registry
interface SandboxInfo {
  id: string;
  skillPath: string;       // 原始文件相对路径（如 "skills/biz-skills/bill-inquiry/SKILL.md"）
  sandboxDir: string;      // 沙箱目录绝对路径
  createdAt: string;
}
const sandboxes = new Map<string, SandboxInfo>();

const sandbox = new Hono();

// POST /api/sandbox/create
sandbox.post('/create', async (c) => {
  const body = await c.req.json<{ skill_path?: string }>();
  const skillPath = body.skill_path;
  if (!skillPath) {
    return c.json({ error: 'skill_path 不能为空' }, 400);
  }

  const absSource = resolve(PROJECT_ROOT, skillPath);
  if (!existsSync(absSource)) {
    return c.json({ error: `文件不存在: ${skillPath}` }, 404);
  }

  const id = crypto.randomUUID().slice(0, 8);
  const sandboxDir = resolve(SANDBOX_ROOT, id);

  // 复制整个 Skill 目录到沙箱（如 bill-inquiry/ 包含 SKILL.md + references/）
  const skillDir = dirname(absSource);
  const sandboxSkillDir = resolve(sandboxDir, 'biz-skills', basename(dirname(skillPath)));

  await mkdir(dirname(sandboxSkillDir), { recursive: true });
  await cp(skillDir, sandboxSkillDir, { recursive: true });

  const info: SandboxInfo = {
    id,
    skillPath,
    sandboxDir,
    createdAt: new Date().toISOString(),
  };
  sandboxes.set(id, info);

  logger.info('sandbox', 'created', { id, skillPath });
  return c.json({ ok: true, sandbox_id: id, sandbox_dir: sandboxDir });
});

// GET /api/sandbox/:id/content
sandbox.get('/:id/content', async (c) => {
  const id = c.req.param('id');
  const info = sandboxes.get(id);
  if (!info) return c.json({ error: '沙箱不存在' }, 404);

  const fileName = c.req.query('file') ?? 'SKILL.md';
  const skillDirName = basename(dirname(info.skillPath));
  const absPath = resolve(info.sandboxDir, 'biz-skills', skillDirName, fileName);

  try {
    const content = await readFile(absPath, 'utf-8');
    return c.json({ content, path: absPath });
  } catch {
    return c.json({ error: '文件不存在' }, 404);
  }
});

// PUT /api/sandbox/:id/content
sandbox.put('/:id/content', async (c) => {
  const id = c.req.param('id');
  const info = sandboxes.get(id);
  if (!info) return c.json({ error: '沙箱不存在' }, 404);

  const body = await c.req.json<{ content?: string; file?: string }>();
  if (body.content === undefined) return c.json({ error: 'content 不能为空' }, 400);

  const fileName = body.file ?? 'SKILL.md';
  const skillDirName = basename(dirname(info.skillPath));
  const absPath = resolve(info.sandboxDir, 'biz-skills', skillDirName, fileName);

  await writeFile(absPath, body.content, 'utf-8');
  logger.info('sandbox', 'content_updated', { id, file: fileName });
  return c.json({ ok: true });
});

// POST /api/sandbox/:id/test
sandbox.post('/:id/test', async (c) => {
  const id = c.req.param('id');
  const info = sandboxes.get(id);
  if (!info) return c.json({ error: '沙箱不存在' }, 404);

  const body = await c.req.json<{ message: string; phone?: string; lang?: 'zh' | 'en'; history?: CoreMessage[]; useMock?: boolean }>();
  if (!body.message) return c.json({ error: 'message 不能为空' }, 400);

  // 沙箱默认使用 mock 规则，可通过 useMock: false 关闭
  const useMock = body.useMock !== false;

  const skillsDir = resolve(info.sandboxDir, 'biz-skills');

  try {
    const result = await runAgent(
      body.message,
      body.history ?? [],
      body.phone ?? '13800000001',
      body.lang ?? 'zh',
      undefined, // onDiagramUpdate
      undefined, // onTextDelta
      undefined, // subscriberName
      undefined, // planName
      skillsDir, // 沙箱 Skills 目录
      { useMock },
    );
    return c.json({ text: result.text, card: result.card ?? null, mock: useMock });
  } catch (err) {
    return c.json({ error: `Agent 执行失败: ${String(err)}` }, 500);
  }
});

// POST /api/sandbox/:id/validate
sandbox.post('/:id/validate', async (c) => {
  const id = c.req.param('id');
  const info = sandboxes.get(id);
  if (!info) return c.json({ error: '沙箱不存在' }, 404);

  const skillDirName = basename(dirname(info.skillPath));
  const skillMdPath = resolve(info.sandboxDir, 'biz-skills', skillDirName, 'SKILL.md');
  const issues: string[] = [];

  try {
    const content = await readFile(skillMdPath, 'utf-8');

    // 1. 检查 YAML frontmatter
    if (!content.startsWith('---')) {
      issues.push('缺少 YAML frontmatter（文件应以 --- 开头）');
    }

    // 2. 检查 Mermaid 流程图语法（基础检查）
    const mermaidMatch = content.match(/```mermaid\n([\s\S]*?)```/);
    if (mermaidMatch) {
      const mermaid = mermaidMatch[1];
      if (!mermaid.includes('graph') && !mermaid.includes('flowchart') && !mermaid.includes('sequenceDiagram') && !mermaid.includes('stateDiagram')) {
        issues.push('Mermaid 流程图缺少图类型声明（graph/flowchart/sequenceDiagram）');
      }
    }

    // 3. 检查工具引用（区分 available / planned / disabled / missing）
    const toolRefs = content.match(/%% tool:(\w+)/g) ?? [];
    const allToolItems = getToolsOverview();
    const toolStatusMap = new Map(allToolItems.map(t => [t.name, t]));
    for (const ref of toolRefs) {
      const toolName = ref.replace('%% tool:', '');
      const info = toolStatusMap.get(toolName);
      if (!info) {
        issues.push(`引用了未注册的工具: ${toolName}（请在 MCP 管理中创建）`);
      } else if (info.status === 'planned') {
        issues.push(`工具 ${toolName} 处于 planned 状态（来源: ${info.source}），运行时不可用`);
      } else if (info.status === 'disabled') {
        issues.push(`工具 ${toolName} 已被禁用（来源: ${info.source}），请先启用`);
      }
      // available → 无 issue
    }

    // 4. 检查是否为空内容
    const bodyContent = content.replace(/^---[\s\S]*?---\n/, '').trim();
    if (bodyContent.length < 50) {
      issues.push('技能内容过短（正文不足 50 字符）');
    }

  } catch {
    issues.push('无法读取 SKILL.md 文件');
  }

  return c.json({
    valid: issues.length === 0,
    issues,
  });
});

// POST /api/sandbox/:id/publish
sandbox.post('/:id/publish', requireRole('flow_manager'), async (c) => {
  const id = c.req.param('id');
  const info = sandboxes.get(id);
  if (!info) return c.json({ error: '沙箱不存在' }, 404);

  const skillDirName = basename(dirname(info.skillPath));
  const sandboxMdPath = resolve(info.sandboxDir, 'biz-skills', skillDirName, 'SKILL.md');

  try {
    // 清理沙箱（发布由前端通过 /api/skill-versions/publish 完成）
    await rm(info.sandboxDir, { recursive: true, force: true });
    sandboxes.delete(id);

    logger.info('sandbox', 'published', { id, skillPath: info.skillPath });
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: `发布失败: ${String(err)}` }, 500);
  }
});

// ── 断言类型与执行 ──────────────────────────────────────────────────────────

interface Assertion {
  type: 'contains' | 'not_contains' | 'tool_called' | 'tool_not_called' | 'skill_loaded' | 'regex'
    | 'tool_called_any_of' | 'response_mentions_all' | 'response_mentions_any' | 'response_has_next_step';
  value: string;
}

interface AssertionResult {
  type: string;
  value: string;
  passed: boolean;
  detail: string;
}

/**
 * 从 test_case 行解析断言列表。
 * 优先使用新 assertions 字段，fallback 到旧 expected_keywords。
 */
function parseAssertions(tc: { assertions: string | null; expected_keywords: string }): Assertion[] {
  if (tc.assertions) {
    try { return JSON.parse(tc.assertions) as Assertion[]; } catch { /* fall through */ }
  }
  // 兼容旧格式：expected_keywords → contains 断言
  const keywords: string[] = JSON.parse(tc.expected_keywords);
  return keywords.map(kw => ({ type: 'contains' as const, value: kw }));
}

/**
 * 运行一组断言，返回每条的结果。
 * @param responseText Agent 回复文本
 * @param toolsCalled Agent 调用过的工具名列表
 * @param skillsLoaded Agent 加载过的技能名列表
 */
function runAssertions(
  assertions: Assertion[],
  responseText: string,
  toolsCalled: string[],
  skillsLoaded: string[],
): AssertionResult[] {
  return assertions.map(a => {
    switch (a.type) {
      case 'contains': {
        const ok = responseText.includes(a.value);
        return { ...a, passed: ok, detail: ok ? `回复包含 "${a.value}"` : `回复未包含 "${a.value}"` };
      }
      case 'not_contains': {
        const ok = !responseText.includes(a.value);
        return { ...a, passed: ok, detail: ok ? `回复不包含 "${a.value}"` : `回复错误地包含了 "${a.value}"` };
      }
      case 'tool_called': {
        const ok = toolsCalled.includes(a.value);
        return { ...a, passed: ok, detail: ok ? `调用了工具 ${a.value}` : `未调用工具 ${a.value}（已调用: ${toolsCalled.join(', ') || '无'}）` };
      }
      case 'tool_not_called': {
        const ok = !toolsCalled.includes(a.value);
        return { ...a, passed: ok, detail: ok ? `未调用工具 ${a.value}` : `错误地调用了工具 ${a.value}` };
      }
      case 'skill_loaded': {
        const ok = skillsLoaded.includes(a.value);
        return { ...a, passed: ok, detail: ok ? `加载了技能 ${a.value}` : `未加载技能 ${a.value}（已加载: ${skillsLoaded.join(', ') || '无'}）` };
      }
      case 'regex': {
        try {
          const ok = new RegExp(a.value).test(responseText);
          return { ...a, passed: ok, detail: ok ? `匹配正则 /${a.value}/` : `未匹配正则 /${a.value}/` };
        } catch {
          return { ...a, passed: false, detail: `正则表达式无效: ${a.value}` };
        }
      }
      case 'tool_called_any_of': {
        const candidates = a.value.split(',').map(s => s.trim());
        const matched = candidates.filter(t => toolsCalled.includes(t));
        const ok = matched.length > 0;
        return { ...a, passed: ok, detail: ok ? `调用了工具 ${matched.join(', ')}` : `未调用任一工具 [${candidates.join(', ')}]（已调用: ${toolsCalled.join(', ') || '无'}）` };
      }
      case 'response_mentions_all': {
        const keywords = a.value.split(',').map(s => s.trim());
        const missing = keywords.filter(kw => !responseText.includes(kw));
        const ok = missing.length === 0;
        return { ...a, passed: ok, detail: ok ? `回复包含所有关键词: ${keywords.join(', ')}` : `回复缺少关键词: ${missing.join(', ')}` };
      }
      case 'response_mentions_any': {
        const keywords = a.value.split(',').map(s => s.trim());
        const matched = keywords.filter(kw => responseText.includes(kw));
        const ok = matched.length > 0;
        return { ...a, passed: ok, detail: ok ? `回复包含关键词: ${matched.join(', ')}` : `回复未包含任一关键词: ${keywords.join(', ')}` };
      }
      case 'response_has_next_step': {
        const patterns = ['您可以', '建议您', '如需', '下一步', '请您', '可以通过', '前往', '拨打',
          '是否需要', '需要我', '您看', '如果您', '如有', '请问', '告诉我', '联系我', '帮您', '为您'];
        const matched = patterns.filter(p => responseText.includes(p));
        const ok = matched.length > 0;
        return { ...a, passed: ok, detail: ok ? `回复包含下一步引导: "${matched[0]}"` : `回复缺少下一步引导（未匹配常见引导句式）` };
      }
      default:
        return { ...a, passed: false, detail: `未知断言类型: ${a.type}` };
    }
  });
}

// ── 基础设施错误识别 ──────────────────────────────────────────────────────────

const INFRA_ERROR_PATTERNS = [
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'Too Many Requests',
  '429',
  'socket connection was closed',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'fetch failed',
  'network error',
];

function isInfraError(err: unknown): boolean {
  const msg = String(err);
  return INFRA_ERROR_PATTERNS.some(p => msg.includes(p));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

type TestStatus = 'passed' | 'failed' | 'infra_error';

// POST /api/sandbox/:id/regression — 沙箱回归测试（支持丰富断言）
sandbox.post('/:id/regression', async (c) => {
  const id = c.req.param('id');
  const info = sandboxes.get(id);
  if (!info) return c.json({ error: '沙箱不存在' }, 404);

  const skillDirName = basename(dirname(info.skillPath));
  const skillsDir = resolve(info.sandboxDir, 'biz-skills');

  // 可配置参数
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const delayMs = Number(body.delay_ms ?? 2000);       // 用例间退避间隔（默认 2 秒）
  const retryOnInfra = body.retry_on_infra !== false;   // 基础设施错误自动重试（默认开启）
  const retryDelayMs = Number(body.retry_delay_ms ?? 5000); // 重试前等待时间（默认 5 秒）

  const cases = await db
    .select()
    .from(testCases)
    .where(eq(testCases.skill_name, skillDirName));

  if (cases.length === 0) {
    return c.json({ total: 0, passed: 0, failed: 0, infra_error: 0, results: [], message: '没有找到测试用例' });
  }

  const results: Array<{
    test_id: number;
    input: string;
    actual: string;
    status: TestStatus;
    passed: boolean;
    assertions: AssertionResult[];
    tools_called: string[];
    skills_loaded: string[];
  }> = [];

  // 单条用例执行逻辑（提取为函数以支持重试）
  async function runSingleCase(tc: typeof cases[number], assertions: Assertion[]): Promise<typeof results[number]> {
    const toolsCalled: string[] = [];
    const skillsLoaded: string[] = [];

    let phone = '13800000001';
    if (tc.persona_id) {
      const persona = db.select().from(testPersonas).where(eq(testPersonas.id, tc.persona_id)).get();
      if (persona) {
        const ctx = JSON.parse(persona.context) as Record<string, unknown>;
        phone = (ctx.phone as string) ?? phone;
      }
    }

    const agentResult = await runAgent(
      tc.input_message,
      [],
      phone,
      'zh',
      undefined, // onDiagramUpdate
      undefined, // onTextDelta
      undefined, // subscriberName
      undefined, // planName
      skillsDir, // 沙箱 Skills 目录
      { useMock: true }, // 沙箱回归测试默认使用 mock
    );

    const responseText = agentResult.text ?? '';
    toolsCalled.push(...(agentResult.toolRecords ?? []).map(r => r.tool));
    if (toolsCalled.length === 0 && agentResult.card) {
      switch (agentResult.card.type) {
        case 'bill_card': toolsCalled.push('query_bill'); break;
        case 'cancel_card': toolsCalled.push('cancel_service'); break;
        case 'plan_card': toolsCalled.push('query_plans'); break;
        case 'diagnostic_card': toolsCalled.push('diagnose_network'); break;
      }
    }
    if (agentResult.transferData) toolsCalled.push('transfer_to_human');
    if (agentResult.skill_diagram?.skill_name) skillsLoaded.push(agentResult.skill_diagram.skill_name);
    for (const rec of agentResult.toolRecords ?? []) {
      if (rec.tool === 'get_skill_instructions' && rec.args?.skill_name && !skillsLoaded.includes(rec.args.skill_name)) {
        skillsLoaded.push(rec.args.skill_name);
      }
    }

    const assertionResults = runAssertions(assertions, responseText, toolsCalled, skillsLoaded);
    const allPassed = assertionResults.every(r => r.passed);

    return {
      test_id: tc.id,
      input: tc.input_message,
      actual: responseText.slice(0, 500),
      status: allPassed ? 'passed' : 'failed',
      passed: allPassed,
      assertions: assertionResults,
      tools_called: toolsCalled,
      skills_loaded: skillsLoaded,
    };
  }

  for (let i = 0; i < cases.length; i++) {
    const tc = cases[i];
    const assertions = parseAssertions(tc);

    try {
      const result = await runSingleCase(tc, assertions);
      results.push(result);
    } catch (err) {
      if (isInfraError(err) && retryOnInfra) {
        // 基础设施错误：等待后重试一次
        logger.warn('sandbox', 'infra_error_retry', { id, test_id: tc.id, error: String(err) });
        await sleep(retryDelayMs);
        try {
          const retryResult = await runSingleCase(tc, assertions);
          results.push(retryResult);
          // 退避后继续
          if (i < cases.length - 1) await sleep(delayMs);
          continue;
        } catch (retryErr) {
          // 重试也失败，标记为 infra_error
          results.push({
            test_id: tc.id,
            input: tc.input_message,
            actual: `InfraError: ${String(retryErr)}`,
            status: 'infra_error',
            passed: false,
            assertions: assertions.map(a => ({ ...a, passed: false, detail: `基础设施异常（已重试）: ${String(retryErr)}` })),
            tools_called: [],
            skills_loaded: [],
          });
        }
      } else if (isInfraError(err)) {
        // 基础设施错误但未开启重试
        results.push({
          test_id: tc.id,
          input: tc.input_message,
          actual: `InfraError: ${String(err)}`,
          status: 'infra_error',
          passed: false,
          assertions: assertions.map(a => ({ ...a, passed: false, detail: `基础设施异常: ${String(err)}` })),
          tools_called: [],
          skills_loaded: [],
        });
      } else {
        // 真正的内容/逻辑错误
        results.push({
          test_id: tc.id,
          input: tc.input_message,
          actual: `Error: ${String(err)}`,
          status: 'failed',
          passed: false,
          assertions: assertions.map(a => ({ ...a, passed: false, detail: `执行异常: ${String(err)}` })),
          tools_called: [],
          skills_loaded: [],
        });
      }
    }

    // 用例间退避，避免 429
    if (i < cases.length - 1) await sleep(delayMs);
  }

  const passed = results.filter(r => r.status === 'passed').length;
  const failed = results.filter(r => r.status === 'failed').length;
  const infraError = results.filter(r => r.status === 'infra_error').length;

  logger.info('sandbox', 'regression', { id, total: results.length, passed, failed, infra_error: infraError });
  return c.json({ total: results.length, passed, failed, infra_error: infraError, content_evaluated: passed + failed, results });
});

// DELETE /api/sandbox/:id
sandbox.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const info = sandboxes.get(id);
  if (!info) return c.json({ error: '沙箱不存在' }, 404);

  await rm(info.sandboxDir, { recursive: true, force: true });
  sandboxes.delete(id);
  logger.info('sandbox', 'deleted', { id });
  return c.json({ ok: true });
});

export default sandbox;
