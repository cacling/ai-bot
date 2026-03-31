/**
 * skill-versions.ts — Skill 版本管理 API
 *
 * GET    /api/skill-versions/registry              — 技能注册表
 * GET    /api/skill-versions?skill=bill-inquiry     — 版本列表
 * GET    /api/skill-versions/:skill/:versionNo      — 版本快照文件树
 * POST   /api/skill-versions/save                   — 保存为版本（从当前 skill 目录）
 * POST   /api/skill-versions/save-version           — 保存版本（draft → saved）
 * POST   /api/skill-versions/publish                — 发布指定版本
 * POST   /api/skill-versions/create-from            — 基于某版本创建新版本
 */

import { Hono } from 'hono';
import { readdir, stat } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { readFileSync } from 'node:fs';
import {
  getVersionList,
  getVersionDetail,
  markVersionSaved,
  publishVersion,
  createVersionFrom,
  listSkillRegistry,
} from './version-manager';
import { logger } from '../logger';
import { SKILLS_ROOT } from '../paths';
import { db } from '../db';
import { eq, and } from 'drizzle-orm';
import { extractPrimaryMermaidBlock, findCustomerGuidanceDiagramSection } from '../skill-markdown';

import { REPO_ROOT } from '../paths';
const PROJECT_ROOT = REPO_ROOT;

const app = new Hono();

// GET /api/skill-versions/registry
app.get('/registry', async (c) => {
  return c.json({ items: listSkillRegistry() });
});

// GET /api/skill-versions?skill=bill-inquiry
app.get('/', async (c) => {
  const skillId = c.req.query('skill');
  if (!skillId) return c.json({ error: 'skill 参数缺失' }, 400);
  const versions = await getVersionList(skillId);
  return c.json({ skill: skillId, versions, total: versions.length });
});

// GET /api/skill-versions/:skill/diagram-data — 流程图渲染数据（mermaid + nodeTypeMap）
// Must be BEFORE /:skill/:versionNo to avoid being caught by that pattern
app.get('/:skill/diagram-data', async (c) => {
  const skillId = c.req.param('skill');
  try {
    const { getSkillMermaid } = await import('../engine-stubs');
    const { stripMermaidMarkers, buildNodeTypeMap } = await import('../mermaid');
    const { skillWorkflowSpecs } = await import('../db');

    const rawMermaid = getSkillMermaid(skillId);
    if (!rawMermaid) return c.json({ error: 'Skill not found or has no mermaid' }, 404);

    const mermaid = stripMermaidMarkers(rawMermaid);

    let nodeTypeMap: Record<string, string> | null = null;
    const specRow = db.select().from(skillWorkflowSpecs)
      .where(and(eq(skillWorkflowSpecs.skill_id, skillId), eq(skillWorkflowSpecs.status, 'published')))
      .get();
    if (specRow) {
      nodeTypeMap = buildNodeTypeMap(JSON.parse(specRow.spec_json));
    }

    return c.json({ mermaid, nodeTypeMap });
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

// POST /api/skill-versions/diagram-preview — 用当前 draft SKILL.md 实时预览状态图和诊断
app.post('/diagram-preview', async (c) => {
  type PreviewBody = {
    skill?: string;
    version_no?: number | null;
    skill_md?: string;
    references?: Array<{ filename: string }>;
    assets?: Array<{ filename: string }>;
  };

  const body = await c.req.json<PreviewBody>();
  if (!body || typeof body.skill_md !== 'string') return c.json({ error: 'skill_md 必须为字符串' }, 400);
  const skillMd = body.skill_md;
  if (!skillMd.trim()) return c.json({ error: 'skill_md 不能为空' }, 400);

  try {
    const [{ compileWorkflow }, { stripMermaidMarkers, buildNodeTypeMap }, { runValidation }, { parseStateDiagram }] = await Promise.all([
      import('../engine-stubs'),
      import('../mermaid'),
      import('../../../backend/skills/tech-skills/skill-creator-spec/scripts/run_validation'),
      import('../../../backend/skills/tech-skills/skill-creator-spec/scripts/validate_statediagram'),
    ]);

    const skillId = body.skill?.trim() || 'skill-preview';
    const versionNo = Number(body.version_no ?? 0) || 0;
    const compileResult = compileWorkflow(skillMd, skillId, versionNo);
    const validation = runValidation({
      skill_name: skillId,
      skill_md: skillMd,
      references: body.references ?? [],
      assets: body.assets ?? [],
    });

    const section = findCustomerGuidanceDiagramSection(skillMd);
    const rawMermaid = section.mermaid ?? extractPrimaryMermaidBlock(skillMd);
    const mermaid = rawMermaid ? stripMermaidMarkers(rawMermaid) : null;
    const nodeTypeMap = compileResult.spec ? buildNodeTypeMap(compileResult.spec) : null;
    const structure = rawMermaid ? parseStateDiagram(rawMermaid) : null;

    return c.json({
      mermaid,
      nodeTypeMap,
      section: {
        hasSection: section.hasSection,
        hasMermaidBlock: section.hasMermaidBlock,
      },
      compile: {
        errors: compileResult.errors,
        warnings: compileResult.warnings,
      },
      validation,
      structure,
    });
  } catch (err) {
    return c.json({ error: `状态图预览失败: ${String(err)}` }, 500);
  }
});

// GET /api/skill-versions/:skill/:versionNo — 版本快照文件树
app.get('/:skill/:versionNo', async (c) => {
  const skillId = c.req.param('skill');
  const versionNo = Number(c.req.param('versionNo'));
  const version = getVersionDetail(skillId, versionNo);
  if (!version || !version.snapshot_path) {
    return c.json({ error: `版本 v${versionNo} 不存在` }, 404);
  }

  const snapshotDir = resolve(SKILLS_ROOT, version.snapshot_path);

  interface TreeNode { name: string; type: 'file' | 'dir'; path: string; children?: TreeNode[] }

  async function buildTree(dir: string): Promise<TreeNode[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const nodes: TreeNode[] = [];
    for (const entry of entries) {
      if (entry.name.endsWith('.draft')) continue;
      const absPath = join(dir, entry.name);
      const relPath = relative(PROJECT_ROOT, absPath);
      if (entry.isDirectory()) {
        const children = await buildTree(absPath);
        nodes.push({ name: entry.name, type: 'dir', path: relPath, children });
      } else {
        nodes.push({ name: entry.name, type: 'file', path: relPath });
      }
    }
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return nodes;
  }

  const tree = await buildTree(snapshotDir);
  return c.json({ version, tree });
});

// POST /api/skill-versions/save-version — 标记版本为已保存（draft → saved）
app.post('/save-version', async (c) => {
  const body = await c.req.json<{ skill: string; version_no: number }>();
  if (!body.skill || !body.version_no) return c.json({ error: 'skill 和 version_no 必填' }, 400);
  markVersionSaved(body.skill, body.version_no);
  return c.json({ ok: true });
});

// POST /api/skill-versions/publish — 发布指定版本
app.post('/publish', async (c) => {
  const body = await c.req.json<{ skill: string; version_no: number; operator?: string }>();
  if (!body.skill || !body.version_no) return c.json({ error: 'skill 和 version_no 必填' }, 400);

  // Compile workflow spec — block publish if errors
  // Read from the version snapshot (not biz-skills/ main dir) to ensure plan matches the published version
  try {
    const { compileWorkflow } = await import('../engine-stubs');
    const version = getVersionDetail(body.skill, body.version_no);
    let skillMd: string | null = null;
    if (version?.snapshot_path) {
      try {
        skillMd = readFileSync(resolve(SKILLS_ROOT, version.snapshot_path, 'SKILL.md'), 'utf-8');
      } catch { /* snapshot not found, try main dir as fallback */ }
    }
    if (!skillMd) {
      const mainPath = resolve(SKILLS_ROOT, 'biz-skills', body.skill, 'SKILL.md');
      try { skillMd = readFileSync(mainPath, 'utf-8'); } catch { /* ignore */ }
    }

    if (skillMd) {
      const result = compileWorkflow(skillMd, body.skill, body.version_no);
      if (result.errors.length > 0) {
        return c.json({ error: 'Workflow 编译失败', details: result.errors }, 400);
      }
      if (result.spec) {
        const { skillWorkflowSpecs } = await import('../db');
        const specJson = JSON.stringify(result.spec);
        db.delete(skillWorkflowSpecs)
          .where(and(eq(skillWorkflowSpecs.skill_id, body.skill), eq(skillWorkflowSpecs.version_no, body.version_no)))
          .run();
        db.insert(skillWorkflowSpecs).values({
          skill_id: body.skill,
          version_no: body.version_no,
          status: 'published',
          spec_json: specJson,
        }).run();
      }
    }
  } catch (e) {
    logger.warn('skill-versions', 'compile_error', { skill: body.skill, error: String(e) });
  }

  const result = await publishVersion(body.skill, body.version_no, body.operator ?? 'system');
  if (!result.success) return c.json({ error: result.error }, 400);
  return c.json({ ok: true });
});

// POST /api/skill-versions/create-from — 基于某版本创建新版本
app.post('/create-from', async (c) => {
  const body = await c.req.json<{ skill: string; from_version: number; description?: string; operator?: string }>();
  if (!body.skill || !body.from_version) return c.json({ error: 'skill 和 from_version 必填' }, 400);
  try {
    const result = await createVersionFrom(body.skill, body.from_version, body.description ?? '', body.operator ?? 'system');
    return c.json({ ok: true, ...result });
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

// POST /api/skill-versions/test — 直接用版本快照测试（不创建沙箱）
app.post('/test', async (c) => {
  const body = await c.req.json<{
    skill: string;
    version_no: number;
    message: string;
    history?: Array<{ role: string; content: string }>;
    phone?: string;
    lang?: 'zh' | 'en';
    useMock?: boolean;
    persona?: Record<string, unknown>;
    session_id?: string;
  }>();
  if (!body.skill || !body.version_no || !body.message) {
    return c.json({ error: 'skill, version_no, message 必填' }, 400);
  }

  const version = getVersionDetail(body.skill, body.version_no);
  if (!version?.snapshot_path) return c.json({ error: `版本 v${body.version_no} 不存在` }, 404);

  const skillsDir = resolve(SKILLS_ROOT, version.snapshot_path, '..');
  // snapshot_path = ".versions/bill-inquiry/v2" → parent = ".versions/bill-inquiry"
  // But runAgent expects a dir containing skill folders, so we need to restructure:
  // The snapshot IS the skill dir, so we create a virtual parent with the skill as a subdirectory
  const snapshotAbsPath = resolve(SKILLS_ROOT, version.snapshot_path);

  // runAgent expects skillsDir to contain skill subdirs (e.g. skillsDir/bill-inquiry/SKILL.md)
  // But our snapshot is already the skill dir. Use a symlink-like approach:
  // Actually, just pass the snapshot's parent as skillsDir and skill name matches the dir name? No.
  // The simplest: pass snapshot dir directly and let runAgent find SKILL.md in it.
  // runAgent uses overrideSkillsDir which scans for subdirs. We need the snapshot to be inside a parent.
  // Solution: use a temp dir with a symlink, or restructure.

  // Simplest approach: use runAgent's existing useMock + the snapshot path
  const { runAgent, SOP_ENFORCEMENT_SUFFIX } = await import('../engine-stubs');

  try {
    // Create a virtual skills dir structure: tempParent/{skillId}/ -> snapshot (copy)
    const { mkdtempSync, cpSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const tempParent = mkdtempSync(join(tmpdir(), 'skill-test-'));
    try {
      cpSync(snapshotAbsPath, join(tempParent, body.skill), { recursive: true });
      const history = (body.history ?? []).map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));
      // Read SKILL.md and inject into prompt (so LLM sees SOP without needing to call get_skill_instructions)
      const { readFileSync } = await import('node:fs');
      const skillMdPath = join(snapshotAbsPath, 'SKILL.md');
      let skillContent: string | undefined;
      try {
        const raw = readFileSync(skillMdPath, 'utf-8');
        skillContent = raw + SOP_ENFORCEMENT_SUFFIX;
      } catch { /* SKILL.md not found, proceed without injection */ }

      // Build persona context to inject into prompt
      const persona = body.persona ?? {};
      const phone = (persona.phone as string) ?? body.phone ?? '13800000001';
      const sessionId = body.session_id?.trim() || `skilltest_${body.skill}_v${body.version_no}_${phone}`;
      const subscriberName = (persona.name as string) ?? undefined;
      const planName = (persona.plan as string) ?? undefined;

      // For outbound personas, inject task context
      let personaContext = '';
      if (persona.task_type) {
        personaContext = `\n\n---\n### 测试任务上下文\n\n任务类型：${persona.task_type === 'collection' ? '催收' : '营销'}\n` +
          `客户姓名：${persona.name ?? '用户'}\n` +
          `客户手机号：${phone}\n` +
          (persona.product_name ? `产品名称：${persona.product_name}\n` : '') +
          (persona.arrears_amount ? `欠款金额：¥${persona.arrears_amount}\n` : '') +
          (persona.overdue_days ? `逾期天数：${persona.overdue_days}天\n` : '') +
          (persona.campaign_name ? `活动名称：${persona.campaign_name}\n` : '') +
          '\n请根据以上任务信息，按照技能操作指南执行。';
        if (skillContent) skillContent += personaContext;
        else skillContent = personaContext;
      }

      // Compile workflow plan for SOPGuard V2
      let workflowPlan: import('../engine-stubs').WorkflowSpec | undefined;
      try {
        const { compileWorkflow } = await import('../engine-stubs');
        const raw = readFileSync(skillMdPath, 'utf-8');
        const compileResult = compileWorkflow(raw, body.skill, body.version_no);
        if (compileResult.spec) workflowPlan = compileResult.spec;
      } catch { /* compilation optional */ }

      const result = await runAgent(
        body.message,
        history,
        phone,
        body.lang ?? 'zh',
        undefined,        // onDiagramUpdate
        undefined,        // onTextDelta
        subscriberName,   // subscriberName
        planName,         // planName
        undefined,        // subscriberGender
        tempParent,       // overrideSkillsDir
        { useMock: body.useMock !== false, skillContent, skillName: body.skill, workflowPlan, sessionId },
      );
      return c.json({
        text: result.text,
        card: result.card ?? null,
        skill_diagram: result.skill_diagram ?? null,
        mock: body.useMock !== false,
        session_id: sessionId,
      });
    } finally {
      rmSync(tempParent, { recursive: true, force: true });
    }
  } catch (err) {
    return c.json({ error: `测试失败: ${String(err)}` }, 500);
  }
});

export default app;
