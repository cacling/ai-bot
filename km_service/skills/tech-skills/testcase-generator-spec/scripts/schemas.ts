/**
 * schemas.ts — testcase-generator 的 Zod 校验 schema
 *
 * 引擎在 LLM 输出后用这些 schema 做硬校验。
 * 与 references/manifest-schema.md 一一对应。
 */

import { z } from 'zod';

// ── Stage 1: Requirement IR ─────────────────────────────────────────────────

export const requirementSchema = z.object({
  id: z.string(),
  source: z.string(),
  description: z.string(),
});

export type Requirement = z.infer<typeof requirementSchema>;

// ── Stage 2: Testcase ───────────────────────────────────────────────────────

export const assertionSchema = z.object({
  type: z.string(),
  value: z.string(),
});

export const testCaseEntrySchema = z.object({
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

export type TestCaseEntry = z.infer<typeof testCaseEntrySchema>;

export const stage2OutputSchema = z.object({
  coverage_matrix: z.array(z.object({
    requirement_id: z.string(),
    covered_by: z.array(z.string()),
  })).optional(),
  cases: z.array(testCaseEntrySchema).min(1),
});

export type Stage2Output = z.infer<typeof stage2OutputSchema>;
