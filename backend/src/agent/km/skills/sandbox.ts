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
import { resolve, join, dirname } from 'node:path';
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

const PROJECT_ROOT = resolve(import.meta.dir, '../../../..');
const SANDBOX_ROOT = resolve(PROJECT_ROOT, 'skills', '.sandbox');

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
  const sandboxSkillDir = resolve(sandboxDir, 'biz-skills', dirname(skillPath).split('/').pop()!);

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
  const skillDirName = dirname(info.skillPath).split('/').pop()!;
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
  const skillDirName = dirname(info.skillPath).split('/').pop()!;
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

  const skillDirName = dirname(info.skillPath).split('/').pop()!;
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

  const skillDirName = dirname(info.skillPath).split('/').pop()!;
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
  type: 'contains' | 'not_contains' | 'tool_called' | 'tool_not_called' | 'skill_loaded' | 'regex';
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
      default:
        return { ...a, passed: false, detail: `未知断言类型: ${a.type}` };
    }
  });
}

// POST /api/sandbox/:id/regression — 沙箱回归测试（支持丰富断言）
sandbox.post('/:id/regression', async (c) => {
  const id = c.req.param('id');
  const info = sandboxes.get(id);
  if (!info) return c.json({ error: '沙箱不存在' }, 404);

  const skillDirName = dirname(info.skillPath).split('/').pop()!;
  const skillsDir = resolve(info.sandboxDir, 'biz-skills');

  const cases = await db
    .select()
    .from(testCases)
    .where(eq(testCases.skill_name, skillDirName));

  if (cases.length === 0) {
    return c.json({ total: 0, passed: 0, failed: 0, results: [], message: '没有找到测试用例' });
  }

  const results: Array<{
    test_id: number;
    input: string;
    actual: string;
    passed: boolean;
    assertions: AssertionResult[];
    tools_called: string[];
    skills_loaded: string[];
  }> = [];

  for (const tc of cases) {
    const assertions = parseAssertions(tc);
    try {
      // 收集工具调用和技能加载信息
      const toolsCalled: string[] = [];
      const skillsLoaded: string[] = [];

      // 从 persona 获取 phone
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

      // 从 agent result 的 steps 中提取工具调用信息
      // runAgent 内部通过 onStepFinish 记录了工具调用，但这些信息不直接暴露在 AgentResult 中
      // 我们通过解析回复文本和 card 信息来推断
      const responseText = agentResult.text ?? '';

      // 从 card 推断工具调用
      if (agentResult.card) {
        switch (agentResult.card.type) {
          case 'bill_card': toolsCalled.push('query_bill'); break;
          case 'cancel_card': toolsCalled.push('cancel_service'); break;
          case 'plan_card': toolsCalled.push('query_plans'); break;
          case 'diagnostic_card': toolsCalled.push('diagnose_network'); break;
        }
      }
      if (agentResult.transferData) toolsCalled.push('transfer_to_human');
      if (agentResult.skill_diagram?.skillName) skillsLoaded.push(agentResult.skill_diagram.skillName);

      const assertionResults = runAssertions(assertions, responseText, toolsCalled, skillsLoaded);
      const allPassed = assertionResults.every(r => r.passed);

      results.push({
        test_id: tc.id,
        input: tc.input_message,
        actual: responseText.slice(0, 500),
        passed: allPassed,
        assertions: assertionResults,
        tools_called: toolsCalled,
        skills_loaded: skillsLoaded,
      });
    } catch (err) {
      results.push({
        test_id: tc.id,
        input: tc.input_message,
        actual: `Error: ${String(err)}`,
        passed: false,
        assertions: assertions.map(a => ({ ...a, passed: false, detail: `执行异常: ${String(err)}` })),
        tools_called: [],
        skills_loaded: [],
      });
    }
  }

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  logger.info('sandbox', 'regression', { id, total: results.length, passed, failed });
  return c.json({ total: results.length, passed, failed, results });
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
