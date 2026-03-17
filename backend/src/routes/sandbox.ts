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
import { runAgent } from '../agent/runner';
import { saveSkillWithVersion } from '../compliance/version-manager';
import { logger } from '../logger';
import { requireRole } from '../middleware/auth';
import { db } from '../db';
import { testCases } from '../db/schema';

const PROJECT_ROOT = resolve(import.meta.dir, '../..');
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

  const body = await c.req.json<{ message: string; phone?: string; lang?: 'zh' | 'en'; history?: CoreMessage[] }>();
  if (!body.message) return c.json({ error: 'message 不能为空' }, 400);

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
    );
    return c.json({ text: result.text, card: result.card ?? null });
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
      if (!mermaid.includes('graph') && !mermaid.includes('flowchart') && !mermaid.includes('sequenceDiagram')) {
        issues.push('Mermaid 流程图缺少图类型声明（graph/flowchart/sequenceDiagram）');
      }
    }

    // 3. 检查工具引用
    const toolRefs = content.match(/%% tool:(\w+)/g) ?? [];
    const knownTools = new Set([
      'query_subscriber', 'query_bill', 'query_plans', 'cancel_service',
      'diagnose_network', 'diagnose_app', 'transfer_to_human',
      'record_call_result', 'send_followup_sms', 'create_callback_task',
    ]);
    for (const ref of toolRefs) {
      const toolName = ref.replace('%% tool:', '');
      if (!knownTools.has(toolName)) {
        issues.push(`引用了未知工具: ${toolName}`);
      }
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
    const newContent = await readFile(sandboxMdPath, 'utf-8');
    const { versionId } = await saveSkillWithVersion(
      info.skillPath,
      newContent,
      `从沙箱 ${id} 发布`,
      'sandbox',
    );

    // 清理沙箱
    await rm(info.sandboxDir, { recursive: true, force: true });
    sandboxes.delete(id);

    logger.info('sandbox', 'published', { id, skillPath: info.skillPath, versionId });
    return c.json({ ok: true, versionId });
  } catch (err) {
    return c.json({ error: `发布失败: ${String(err)}` }, 500);
  }
});

// POST /api/sandbox/:id/regression — 沙箱回归测试
sandbox.post('/:id/regression', async (c) => {
  const id = c.req.param('id');
  const info = sandboxes.get(id);
  if (!info) return c.json({ error: '沙箱不存在' }, 404);

  // Determine skill name from path
  const skillDirName = dirname(info.skillPath).split('/').pop()!;
  const skillsDir = resolve(info.sandboxDir, 'biz-skills');

  // Load test cases for this skill
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
    expected: string[];
    actual: string;
    passed: boolean;
    missing_keywords: string[];
  }> = [];

  for (const tc of cases) {
    const expectedKeywords: string[] = JSON.parse(tc.expected_keywords);
    try {
      const agentResult = await runAgent(
        tc.input_message,
        [],
        tc.phone ?? '13800000001',
        'zh',
        undefined,
        undefined,
        undefined,
        undefined,
        skillsDir,
      );

      const responseText = agentResult.text ?? '';
      const missingKeywords = expectedKeywords.filter(kw => !responseText.includes(kw));
      const passed = missingKeywords.length === 0;

      results.push({
        test_id: tc.id,
        input: tc.input_message,
        expected: expectedKeywords,
        actual: responseText.slice(0, 500),
        passed,
        missing_keywords: missingKeywords,
      });
    } catch (err) {
      results.push({
        test_id: tc.id,
        input: tc.input_message,
        expected: expectedKeywords,
        actual: `Error: ${String(err)}`,
        passed: false,
        missing_keywords: expectedKeywords,
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
