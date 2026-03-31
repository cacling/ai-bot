/**
 * testcase-generator.ts — 两阶段 LLM 测试用例生成 pipeline
 *
 * 生成策略由 tech-skills/testcase-generator-spec/SKILL.md 定义，
 * 本模块只做编排：读数据 → 组装 prompt → 调 LLM → Zod 校验 → 落盘。
 *
 * Stage 1: 从 SKILL.md + references + workflow spec 提取 Requirement IR
 * Stage 2: 基于 Requirement IR 生成结构化测试用例
 * 输出: tests/generated-test-cases.json + .md 写入版本快照
 */

import { generateText } from 'ai';
import { resolve, join } from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';

import { getSkillCreatorModels, type SkillCreatorProvider } from '../llm';
import { getVersionDetail, writeVersionFile } from './version-manager';
import { db } from '../db';
import { logger } from '../logger';
import { SKILLS_ROOT } from '../paths';

// ── 数据结构（re-export from scripts/schemas.ts 的镜像） ────────────────────

export interface TestManifest {
  meta: {
    skill_id: string;
    version_no: number;
    generated_at: string;
    source_checksum: string;
    generator_version: string;
  };
  requirements: Requirement[];
  cases: TestCaseEntry[];
}

export interface Requirement {
  id: string;
  source: string;
  description: string;
}

export interface TestCaseEntry {
  id: string;
  title: string;
  category: 'functional' | 'edge' | 'error' | 'state';
  priority: number;
  requirement_refs: string[];
  persona_id?: string;
  turns: string[];
  assertions: Array<{ type: string; value: string }>;
  notes?: string;
}

// ── Zod 校验（与 scripts/schemas.ts 一致）────────────────────────────────────

const requirementSchema = z.object({
  id: z.string(),
  source: z.string(),
  description: z.string(),
});

const assertionSchema = z.object({
  type: z.string(),
  value: z.string(),
});

const testCaseEntrySchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.enum(['functional', 'edge', 'error', 'state']),
  priority: z.number().min(1).max(3),
  requirement_refs: z.array(z.string()),
  persona_id: z.string().optional(),
  turns: z.array(z.string()).min(1),
  assertions: z.array(assertionSchema).min(1),
  notes: z.string().optional(),
});

const stage2OutputSchema = z.object({
  coverage_matrix: z.array(z.object({
    requirement_id: z.string(),
    covered_by: z.array(z.string()),
  })).optional(),
  cases: z.array(testCaseEntrySchema).min(1),
});

// ── Tech-skill 加载（对齐 skill-creator.ts 的 loadSkillPrompt/loadBizSkillSpec 模式）

const TECH_SKILLS_DIR = resolve(SKILLS_ROOT, 'tech-skills');
const SPEC_SKILL_DIR = join(TECH_SKILLS_DIR, 'testcase-generator-spec');

// 简易文件缓存（同 skill-creator.ts）
const _cache = new Map<string, { content: string; ts: number }>();
const CACHE_TTL = 30_000;

function readCached(path: string): string {
  const now = Date.now();
  const cached = _cache.get(path);
  if (cached && now - cached.ts < CACHE_TTL) return cached.content;
  try {
    const content = readFileSync(path, 'utf-8');
    _cache.set(path, { content, ts: now });
    return content;
  } catch { return ''; }
}

/** 读取 SKILL.md 并去掉 YAML frontmatter，返回纯 prompt 正文 */
function loadSpecPrompt(): string {
  const raw = readCached(join(SPEC_SKILL_DIR, 'SKILL.md'));
  return raw.replace(/^---[\s\S]*?---\s*/, '');
}

/** 按阶段加载 references（减少 token 消耗，提升注意力集中度） */
function loadSpecRefs(stage: 'extract_requirements' | 'generate_testcases'): string {
  const refsDir = join(SPEC_SKILL_DIR, 'references');
  const shared = [
    readCached(join(refsDir, 'manifest-schema.md')),
    readCached(join(refsDir, 'few-shot-examples.md')),
  ];

  switch (stage) {
    case 'extract_requirements':
      return [
        readCached(join(refsDir, 'requirement-extraction-rules.md')),
        ...shared,
      ].filter(Boolean).join('\n\n---\n\n');
    case 'generate_testcases':
      return [
        readCached(join(refsDir, 'testcase-generation-rules.md')),
        readCached(join(refsDir, 'assertion-catalog.md')),
        ...shared,
      ].filter(Boolean).join('\n\n---\n\n');
  }
}

/** 组装 system prompt：SKILL.md 正文 + 上下文注入 + 阶段 references */
function buildSystemPrompt(
  stage: 'extract_requirements' | 'generate_testcases',
  skillId: string,
  versionNo: number,
): string {
  let prompt = loadSpecPrompt();

  // 注入运行时上下文
  const context = JSON.stringify({ stage, skill_id: skillId, version_no: versionNo }, null, 2);
  prompt = prompt.replace('{{CONTEXT}}', context);
  prompt = prompt.replace('{{STAGE}}', stage);

  // 附加阶段 references
  const refs = loadSpecRefs(stage);
  if (refs) {
    prompt += '\n\n---\n\n# 参考规范\n\n' + refs;
  }

  return prompt;
}

// ── 辅助 ─────────────────────────────────────────────────────────────────────

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex').slice(0, 16);
}

function extractJsonFromText(text: string): string {
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();
  const jsonStart = text.indexOf('[') !== -1 && (text.indexOf('{') === -1 || text.indexOf('[') < text.indexOf('{'))
    ? text.indexOf('[')
    : text.indexOf('{');
  if (jsonStart === -1) return text;
  return text.slice(jsonStart);
}

// ── Stage 1: 提取 Requirement IR ─────────────────────────────────────────────

async function extractRequirements(
  skillMd: string,
  references: string[],
  workflowSpec: string | null,
  provider: SkillCreatorProvider,
  skillId: string,
  versionNo: number,
): Promise<Requirement[]> {
  const systemPrompt = buildSystemPrompt('extract_requirements', skillId, versionNo);
  const { model } = getSkillCreatorModels(provider);

  let userContent = `## SKILL.md\n\n${skillMd}`;
  if (references.length > 0) {
    userContent += `\n\n## 参考文档\n\n${references.join('\n\n---\n\n')}`;
  }
  if (workflowSpec) {
    userContent += `\n\n## Workflow Spec (JSON)\n\n${workflowSpec}`;
  }

  const { text } = await generateText({
    model,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
    temperature: 0.3,
  });

  const jsonStr = extractJsonFromText(text);
  const parsed = JSON.parse(jsonStr);
  return z.array(requirementSchema).parse(parsed);
}

// ── Stage 2: 生成测试用例 ────────────────────────────────────────────────────

async function generateCases(
  requirements: Requirement[],
  skillMd: string,
  provider: SkillCreatorProvider,
  skillId: string,
  versionNo: number,
): Promise<TestCaseEntry[]> {
  const systemPrompt = buildSystemPrompt('generate_testcases', skillId, versionNo);
  const { model } = getSkillCreatorModels(provider);

  const userContent = [
    `## Requirements\n\n${JSON.stringify(requirements, null, 2)}`,
    `## SKILL.md\n\n${skillMd}`,
  ].join('\n\n');

  const { text } = await generateText({
    model,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
    temperature: 0.3,
  });

  const jsonStr = extractJsonFromText(text);
  const parsed = JSON.parse(jsonStr);
  const validated = stage2OutputSchema.parse(parsed);
  return validated.cases;
}

// ── Markdown 渲染 ────────────────────────────────────────────────────────────

function renderMarkdown(manifest: TestManifest): string {
  const lines: string[] = [];
  lines.push(`# 测试用例 — ${manifest.meta.skill_id} v${manifest.meta.version_no}`);
  lines.push('');
  lines.push(`> 自动生成于 ${manifest.meta.generated_at} | source_checksum: \`${manifest.meta.source_checksum}\` | generator: v${manifest.meta.generator_version}`);
  lines.push('');

  // Overview
  lines.push('## Overview');
  lines.push('');
  lines.push(`- 需求数: ${manifest.requirements.length}`);
  lines.push(`- 用例数: ${manifest.cases.length}`);
  const byCategory = { functional: 0, edge: 0, error: 0, state: 0 };
  for (const c of manifest.cases) byCategory[c.category]++;
  lines.push(`- 分类: functional(${byCategory.functional}) / edge(${byCategory.edge}) / error(${byCategory.error}) / state(${byCategory.state})`);
  lines.push('');

  // Requirements
  lines.push('## Requirements');
  lines.push('');
  for (const r of manifest.requirements) {
    lines.push(`- **${r.id}** [${r.source}]: ${r.description}`);
  }
  lines.push('');

  // Test Cases by Category
  const categories: Array<{ key: TestCaseEntry['category']; label: string }> = [
    { key: 'functional', label: 'Functional Tests' },
    { key: 'edge', label: 'Edge Case Tests' },
    { key: 'error', label: 'Error Tests' },
    { key: 'state', label: 'State Tests' },
  ];

  for (const { key, label } of categories) {
    const cases = manifest.cases.filter(c => c.category === key);
    if (cases.length === 0) continue;
    lines.push(`## ${label}`);
    lines.push('');
    for (const c of cases) {
      lines.push(`### ${c.id}: ${c.title}`);
      lines.push('');
      lines.push(`- **Priority**: P${c.priority}`);
      lines.push(`- **Requirements**: ${c.requirement_refs.join(', ')}`);
      if (c.persona_id) lines.push(`- **Persona**: ${c.persona_id}`);
      lines.push(`- **Turns**:`);
      for (let i = 0; i < c.turns.length; i++) {
        lines.push(`  ${i + 1}. "${c.turns[i]}"`);
      }
      lines.push(`- **Assertions**:`);
      for (const a of c.assertions) {
        lines.push(`  - \`${a.type}\`: ${a.value}`);
      }
      if (c.notes) lines.push(`- **Notes**: ${c.notes}`);
      lines.push('');
    }
  }

  // Coverage Matrix
  lines.push('## Coverage Matrix');
  lines.push('');
  lines.push('| Requirement | Covered By |');
  lines.push('|-------------|------------|');
  for (const r of manifest.requirements) {
    const covering = manifest.cases.filter(c => c.requirement_refs.includes(r.id)).map(c => c.id);
    lines.push(`| ${r.id} | ${covering.length > 0 ? covering.join(', ') : '**UNCOVERED**'} |`);
  }
  lines.push('');

  return lines.join('\n');
}

// ── 主入口 ───────────────────────────────────────────────────────────────────

const GENERATOR_VERSION = '1.1';

export async function generateTestCases(
  skillId: string,
  versionNo: number,
  provider: SkillCreatorProvider = 'qwen',
): Promise<TestManifest> {
  const version = getVersionDetail(skillId, versionNo);
  if (!version?.snapshot_path) throw new Error(`版本 v${versionNo} 不存在`);

  const snapshotAbsPath = resolve(SKILLS_ROOT, version.snapshot_path);

  // 1. 读取 SKILL.md
  const skillMdPath = join(snapshotAbsPath, 'SKILL.md');
  const skillMd = await readFile(skillMdPath, 'utf-8');
  const sourceChecksum = sha256(skillMd);

  // 2. 读取 references
  const refsDir = join(snapshotAbsPath, 'references');
  const references: string[] = [];
  if (existsSync(refsDir)) {
    const files = await readdir(refsDir);
    for (const f of files.filter(f => f.endsWith('.md'))) {
      const content = await readFile(join(refsDir, f), 'utf-8');
      references.push(`### ${f}\n\n${content}`);
    }
  }

  // 3. 读取 workflow spec（from DB）
  let workflowSpec: string | null = null;
  try {
    const { skillWorkflowSpecs } = await import('../db');
    const specRow = db.select().from(skillWorkflowSpecs)
      .where(and(eq(skillWorkflowSpecs.skill_id, skillId), eq(skillWorkflowSpecs.version_no, versionNo)))
      .get();
    if (specRow) workflowSpec = specRow.spec_json;
  } catch { /* workflow spec optional */ }

  logger.info('testcase-gen', 'stage1_start', { skillId, versionNo });

  // Stage 1: 提取 Requirements
  const requirements = await extractRequirements(skillMd, references, workflowSpec, provider, skillId, versionNo);
  logger.info('testcase-gen', 'stage1_done', { skillId, versionNo, reqCount: requirements.length });

  // Stage 2: 生成用例
  const cases = await generateCases(requirements, skillMd, provider, skillId, versionNo);
  logger.info('testcase-gen', 'stage2_done', { skillId, versionNo, caseCount: cases.length });

  // 组装 manifest
  const manifest: TestManifest = {
    meta: {
      skill_id: skillId,
      version_no: versionNo,
      generated_at: new Date().toISOString(),
      source_checksum: sourceChecksum,
      generator_version: GENERATOR_VERSION,
    },
    requirements,
    cases,
  };

  // 写入文件
  await writeVersionFile(skillId, versionNo, 'tests/generated-test-cases.json', JSON.stringify(manifest, null, 2));
  await writeVersionFile(skillId, versionNo, 'tests/generated-test-cases.md', renderMarkdown(manifest));

  logger.info('testcase-gen', 'saved', { skillId, versionNo });
  return manifest;
}

/**
 * 读取版本快照中的测试用例 manifest。
 * 返回 null 表示该版本尚未生成测试用例。
 */
export async function readTestManifest(skillId: string, versionNo: number): Promise<TestManifest | null> {
  const version = getVersionDetail(skillId, versionNo);
  if (!version?.snapshot_path) return null;

  const jsonPath = resolve(SKILLS_ROOT, version.snapshot_path, 'tests/generated-test-cases.json');
  if (!existsSync(jsonPath)) return null;

  const content = await readFile(jsonPath, 'utf-8');
  return JSON.parse(content) as TestManifest;
}
