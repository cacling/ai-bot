/**
 * pipeline-executor.ts — KM 文档处理流水线 stage 执行器
 *
 * 四个阶段：parse → chunk → generate → validate
 * P0 骨架：parse/chunk 有基础实现，generate/validate 返回 mock 结果。
 * P3 补真实 LLM 实现。
 *
 * Temporal 的 KmDocumentPipelineWorkflow 通过 POST /api/internal/pipeline/jobs/:id/execute
 * 调用此模块。
 */
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { eq } from 'drizzle-orm';
import { db, kmDocVersions, kmDocChunks, kmCandidates, kmPipelineJobs } from '../db';
import { nanoid } from '../nanoid';
import { logger } from '../logger';
import { resolveDocContentPath } from '../paths';

export type PipelineStage = 'parse' | 'chunk' | 'generate' | 'validate';

export interface StageResult {
  status: 'completed' | 'failed';
  result?: Record<string, unknown>;
  error?: string;
  candidate_count?: number;
}

/**
 * 执行指定 pipeline stage
 */
export async function executeStage(
  jobId: string,
  stage: PipelineStage,
): Promise<StageResult> {
  // 获取 job 信息，找到关联的 doc_version_id
  const [job] = await db.select().from(kmPipelineJobs).where(eq(kmPipelineJobs.id, jobId)).limit(1);
  if (!job) return { status: 'failed', error: `Job ${jobId} not found` };

  const docVersionId = job.doc_version_id;
  logger.info('pipeline-executor', 'execute_stage', { jobId, stage, docVersionId });

  switch (stage) {
    case 'parse':
      return executeParse(docVersionId);
    case 'chunk':
      return executeChunk(docVersionId);
    case 'generate':
      return executeGenerate(docVersionId);
    case 'validate':
      return executeValidate(docVersionId);
    default:
      return { status: 'failed', error: `Unknown stage: ${stage}` };
  }
}

// ── Parse: 读取文档文件，验证结构 ──

async function executeParse(docVersionId: string): Promise<StageResult> {
  const [version] = await db.select().from(kmDocVersions).where(eq(kmDocVersions.id, docVersionId)).limit(1);
  if (!version) return { status: 'failed', error: 'doc_version not found' };
  if (!version.file_path) return { status: 'failed', error: 'no file_path on doc_version' };

  const resolvedPath = resolveDocContentPath(version.file_path);
  if (!resolvedPath || !existsSync(resolvedPath)) {
    return { status: 'failed', error: `File not found: ${version.file_path}` };
  }

  try {
    const content = await readFile(resolvedPath, 'utf-8');
    if (!content.trim()) {
      return { status: 'failed', error: 'Document is empty' };
    }

    // 基础校验：是否为合法 Markdown（有内容、无乱码）
    const lineCount = content.split('\n').length;
    const headingCount = (content.match(/^#{1,6}\s+/gm) ?? []).length;

    await db.update(kmDocVersions)
      .set({ status: 'parsing' })
      .where(eq(kmDocVersions.id, docVersionId));

    return {
      status: 'completed',
      result: { lineCount, headingCount, byteLength: Buffer.byteLength(content, 'utf-8') },
    };
  } catch (e) {
    return { status: 'failed', error: `Parse error: ${String(e)}` };
  }
}

// ── Chunk: 按标题拆分文档 ──

async function executeChunk(docVersionId: string): Promise<StageResult> {
  const [version] = await db.select().from(kmDocVersions).where(eq(kmDocVersions.id, docVersionId)).limit(1);
  if (!version) return { status: 'failed', error: 'doc_version not found' };
  if (!version.file_path) return { status: 'failed', error: 'no file_path' };

  const resolvedPath = resolveDocContentPath(version.file_path);
  if (!resolvedPath || !existsSync(resolvedPath)) {
    return { status: 'failed', error: `File not found: ${version.file_path}` };
  }

  try {
    const content = await readFile(resolvedPath, 'utf-8');

    // 删除旧 chunks
    await db.delete(kmDocChunks).where(eq(kmDocChunks.doc_version_id, docVersionId));

    const sections = content.split(/^(#{1,3}\s+.+)$/m).filter(Boolean);
    const now = new Date().toISOString();
    let chunkIndex = 0;
    let currentTitle = '';

    for (const section of sections) {
      if (/^#{1,3}\s+/.test(section)) {
        currentTitle = section.replace(/^#+\s+/, '').trim();
        continue;
      }
      const text = section.trim();
      if (!text) continue;

      await db.insert(kmDocChunks).values({
        id: nanoid(),
        doc_version_id: docVersionId,
        chunk_index: chunkIndex,
        chunk_text: text,
        anchor_type: 'section',
        anchor_value: currentTitle,
        citation_label: currentTitle || `Chunk ${chunkIndex}`,
        created_at: now,
      });
      chunkIndex++;
    }

    await db.update(kmDocVersions)
      .set({ chunk_count: chunkIndex })
      .where(eq(kmDocVersions.id, docVersionId));

    logger.info('pipeline-executor', 'chunk_completed', { docVersionId, chunkCount: chunkIndex });
    return { status: 'completed', result: { chunkCount: chunkIndex } };
  } catch (e) {
    return { status: 'failed', error: `Chunk error: ${String(e)}` };
  }
}

// ── Generate: 从 chunks 生成 Q&A 候选 ──
// P0 骨架：为每个 chunk 生成一条 mock candidate
// P3 阶段将接入 LLM 生成真正的 Q&A

async function executeGenerate(docVersionId: string): Promise<StageResult> {
  const chunks = await db.select().from(kmDocChunks)
    .where(eq(kmDocChunks.doc_version_id, docVersionId))
    .all();

  if (chunks.length === 0) {
    return { status: 'failed', error: 'No chunks found — run chunk stage first' };
  }

  const now = new Date().toISOString();
  let candidateCount = 0;

  for (const chunk of chunks) {
    // P0 mock: 每个 chunk 生成一条占位 candidate
    const id = nanoid();
    await db.insert(kmCandidates).values({
      id,
      source_type: 'parsing',
      source_ref_id: docVersionId,
      normalized_q: `[Auto] ${(chunk.anchor_value ?? '').slice(0, 60)}`,
      draft_answer: chunk.chunk_text.slice(0, 200),
      variants_json: JSON.stringify([]),
      category: 'auto_generated',
      risk_level: 'low',
      gate_evidence: 'pending',
      gate_conflict: 'pending',
      gate_ownership: 'pending',
      status: 'draft',
      created_at: now,
      updated_at: now,
    });
    candidateCount++;
  }

  logger.info('pipeline-executor', 'generate_completed', { docVersionId, candidateCount });
  return { status: 'completed', candidate_count: candidateCount, result: { candidateCount } };
}

// ── Validate: 校验 candidates 的 gate 状态 ──
// P0 骨架：全部标记为 gate_pass
// P3 阶段将做真正的冲突/证据/归属检查

async function executeValidate(docVersionId: string): Promise<StageResult> {
  const candidates = await db.select().from(kmCandidates)
    .where(eq(kmCandidates.source_ref_id, docVersionId))
    .all();

  if (candidates.length === 0) {
    return { status: 'failed', error: 'No candidates found — run generate stage first' };
  }

  const now = new Date().toISOString();
  let passCount = 0;

  for (const candidate of candidates) {
    // P0 mock: 全部通过
    await db.update(kmCandidates)
      .set({
        gate_evidence: 'pass',
        gate_conflict: 'pass',
        gate_ownership: 'pass',
        status: 'gate_pass',
        updated_at: now,
      })
      .where(eq(kmCandidates.id, candidate.id));
    passCount++;
  }

  // 更新 doc version 状态为已完成
  await db.update(kmDocVersions)
    .set({ status: 'parsed' })
    .where(eq(kmDocVersions.id, docVersionId));

  logger.info('pipeline-executor', 'validate_completed', { docVersionId, passCount, total: candidates.length });
  return { status: 'completed', candidate_count: candidates.length, result: { passCount, total: candidates.length } };
}
