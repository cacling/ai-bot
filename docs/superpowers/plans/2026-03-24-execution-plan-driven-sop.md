# Execution-Plan-Driven SOP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compile SKILL.md mermaid state diagrams into execution plan JSON. Upgrade SOPGuard to read the plan and control tool access per state — no chat entry changes, no instance persistence.

**Architecture:** Compiler converts annotated mermaid → WorkflowSpec JSON (stored in DB). SOPGuard V2 tracks `currentStepId` and `pendingConfirm`, blocking tools that don't match the current state. Agent keeps `maxSteps:10` and existing execution model.

**Tech Stack:** Bun + Drizzle ORM (SQLite), TypeScript strict, Bun:test

**Spec:** `docs/superpowers/specs/2026-03-24-execution-plan-driven-sop-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `packages/shared-db/src/schema/platform.ts` | Modify | Add `skill_workflow_specs` table |
| `backend/src/db/schema/platform.ts` | Modify | Re-export new table |
| `backend/skills/tech-skills/skill-creator-spec/scripts/types.ts` | Modify | Expand MermaidAnnotation.type union |
| `backend/skills/tech-skills/skill-creator-spec/scripts/validate_statediagram.ts` | Modify | Parse new annotations |
| `backend/src/engine/skill-workflow-types.ts` | Create | WorkflowSpec, GuardType types |
| `backend/src/engine/skill-workflow-compiler.ts` | Create | Mermaid → WorkflowSpec compiler |
| `backend/src/engine/sop-guard.ts` | Modify | Upgrade to V2: plan-aware state tracking |
| `backend/src/engine/runner.ts` | Modify | 4 integration points with SOPGuard V2 |
| `backend/src/engine/skills.ts` | Modify | Activate plan on skill load |
| `backend/skills/biz-skills/service-cancel/SKILL.md` | Modify | Add annotations (grayscale target) |
| `backend/skills/tech-skills/skill-creator-spec/references/spec-writing.md` | Modify | Docs |
| `backend/skills/tech-skills/skill-creator-spec/references/spec-checklist.md` | Modify | Docs |
| `backend/src/agent/km/skills/skill-creator.ts` | Modify | Compile on save |
| `backend/src/agent/km/skills/skill-versions.ts` | Modify | Compile on publish |

---

## Phase 1: Foundation (types + DB + annotation parsing)

### Task 1: Add `skill_workflow_specs` table

**Files:**
- Modify: `packages/shared-db/src/schema/platform.ts`
- Modify: `backend/src/db/schema/platform.ts`

- [ ] **Step 1: Read existing schema for patterns**

Read `packages/shared-db/src/schema/platform.ts` to confirm import style and `sql` availability.

- [ ] **Step 2: Add table to shared-db**

At end of `packages/shared-db/src/schema/platform.ts`:

```typescript
// ── Skill Workflow Specs ────────────────────────────────────────────

export const skillWorkflowSpecs = sqliteTable('skill_workflow_specs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  skill_id: text('skill_id').notNull(),
  version_no: integer('version_no').notNull(),
  status: text('status').notNull(),
  mermaid_checksum: text('mermaid_checksum'),
  spec_json: text('spec_json').notNull(),
  created_at: text('created_at').default(sql`(datetime('now'))`),
  updated_at: text('updated_at').default(sql`(datetime('now'))`),
}, (table) => ({
  uniqSkillVersion: unique().on(table.skill_id, table.version_no),
}));
```

Add `import { sql } from 'drizzle-orm';` and `import { unique } from 'drizzle-orm/sqlite-core';` if not present.

- [ ] **Step 3: Re-export from backend schema**

Add `skillWorkflowSpecs` to the export list in `backend/src/db/schema/platform.ts`.

- [ ] **Step 4: Push schema**

Run: `cd backend && bunx drizzle-kit push`

- [ ] **Step 5: Commit**

```bash
git add packages/shared-db/src/schema/platform.ts backend/src/db/schema/platform.ts
git commit -m "feat: add skill_workflow_specs table"
```

---

### Task 2: Expand MermaidAnnotation types + parse new annotations

**Files:**
- Modify: `backend/skills/tech-skills/skill-creator-spec/scripts/types.ts`
- Modify: `backend/skills/tech-skills/skill-creator-spec/scripts/validate_statediagram.ts`
- Test: `tests/unittest/backend/skills/skill-creator-spec/validate_statediagram.test.ts`

- [ ] **Step 1: Expand types**

In `types.ts`, change `MermaidAnnotation.type` to:

```typescript
type: 'tool' | 'ref' | 'branch' | 'step' | 'kind' | 'guard' | 'output';
```

Add after `SkillMode`:

```typescript
export type StepKind = 'tool' | 'confirm' | 'ref' | 'human' | 'message' | 'choice' | 'end';

export type GuardType =
  | 'tool.success' | 'tool.error' | 'tool.no_data'
  | 'user.confirm' | 'user.cancel'
  | 'always';
```

- [ ] **Step 2: Add regex patterns to validate_statediagram.ts**

After `RE_ANNOTATION_BRANCH`:

```typescript
const RE_ANNOTATION_STEP = /%%\s*step:([\w-]+)/g;
const RE_ANNOTATION_KIND = /%%\s*kind:(\w+)/g;
const RE_ANNOTATION_GUARD = /%%\s*guard:([\w.]+)/g;
const RE_ANNOTATION_OUTPUT = /%%\s*output:(\w+)/g;
```

Update `extractAnnotations` to extract all 4 new types (same pattern as existing).

- [ ] **Step 3: Write tests**

Add to `validate_statediagram.test.ts`:

```typescript
describe('workflow annotation parsing', () => {
  test('parses %% step: annotations', () => { ... });
  test('parses %% kind: annotations', () => { ... });
  test('parses %% guard: with dot notation', () => { ... });
  test('parses %% output: annotations', () => { ... });
});
```

- [ ] **Step 4: Run tests**

Run: `cd backend && bun test tests/unittest/backend/skills/skill-creator-spec/validate_statediagram.test.ts`

- [ ] **Step 5: Commit**

```bash
git add backend/skills/tech-skills/skill-creator-spec/scripts/types.ts backend/skills/tech-skills/skill-creator-spec/scripts/validate_statediagram.ts tests/unittest/backend/skills/skill-creator-spec/validate_statediagram.test.ts
git commit -m "feat: parse step/kind/guard/output annotations in state diagrams"
```

---

### Task 3: Create WorkflowSpec types

**Files:**
- Create: `backend/src/engine/skill-workflow-types.ts`

- [ ] **Step 1: Create types file**

See spec Section 3 for exact content. Key types: `WorkflowSpec`, `WorkflowStep`, `StepKind`, `WorkflowTransition`, `GuardType`, `CompileResult`.

- [ ] **Step 2: Commit**

```bash
git add backend/src/engine/skill-workflow-types.ts
git commit -m "feat: add WorkflowSpec type definitions"
```

---

## Phase 2: Compiler

### Task 4: Create workflow compiler

**Files:**
- Create: `backend/src/engine/skill-workflow-compiler.ts`
- Create: `tests/unittest/engine/skill-workflow-compiler.test.ts`

- [ ] **Step 1: Write test for simple linear skill**

Test: compile a simple skill with explicit annotations. Verify startStepId, step kinds, transition guards, terminal steps.

- [ ] **Step 2: Run test, verify fail**

- [ ] **Step 3: Implement compiler**

`compileWorkflow(skillMd, skillId, version): CompileResult`

Pipeline:
1. Extract mermaid block
2. Parse lines → nodes + transitions
3. Flatten nested states (prefix with parent name)
4. Propagate transition annotations to target nodes
5. Determine step id (from `%% step:` or label fallback)
6. Determine kind (from `%% kind:`, `%% tool:`, `<<choice>>`, or default)
7. Determine guard (from `%% guard:`, heuristic, or `always`)
8. Find start/terminal steps
9. Validate + return

Copy regex patterns from validate_statediagram.ts (don't import — different layer).

- [ ] **Step 4: Run test, verify pass**

- [ ] **Step 5: Add test for guard heuristic (Chinese labels)**

- [ ] **Step 6: Add test for nested state flattening**

- [ ] **Step 7: Run all compiler tests**

Run: `cd backend && bun test tests/unittest/engine/skill-workflow-compiler.test.ts`

- [ ] **Step 8: Commit**

```bash
git add backend/src/engine/skill-workflow-compiler.ts tests/unittest/engine/skill-workflow-compiler.test.ts
git commit -m "feat: add workflow compiler (mermaid -> WorkflowSpec JSON)"
```

---

### Task 5: Annotate service-cancel SKILL.md

**Files:**
- Modify: `backend/skills/biz-skills/service-cancel/SKILL.md`

- [ ] **Step 1: Add annotations to mermaid diagram**

Add `%% step:`, `%% kind:`, `%% guard:` to all nodes. Use prefix convention: `std.` for standard cancel, `unk.` for unknown charge, `acc.` for accidental sub.

- [ ] **Step 2: Verify compilation succeeds**

Write a quick test or script that compiles service-cancel and checks 0 errors.

- [ ] **Step 3: Commit**

```bash
git add backend/skills/biz-skills/service-cancel/SKILL.md
git commit -m "feat: annotate service-cancel SKILL.md for workflow compilation"
```

---

## Phase 3: SOPGuard V2

### Task 6: Upgrade SOPGuard to V2

**Files:**
- Modify: `backend/src/engine/sop-guard.ts`
- Create: `tests/unittest/engine/sop-guard-v2.test.ts`

This is the core task. SOPGuard gains plan awareness.

- [ ] **Step 1: Write tests for V2 behavior**

```typescript
describe('SOPGuard V2', () => {
  describe('without plan (backward compat)', () => {
    test('allows query tools freely', () => { ... });
    test('blocks operation tools without prerequisites', () => { ... });
  });

  describe('with plan', () => {
    test('allows tool matching current step', () => { ... });
    test('blocks tool not matching current step', () => { ... });
    test('advances state on recordToolCall with success', () => { ... });
    test('advances through choice nodes automatically', () => { ... });
    test('blocks operations when pendingConfirm is true', () => { ... });
    test('clears pendingConfirm on user confirm message', () => { ... });
    test('clears pendingConfirm on user cancel message', () => { ... });
    test('keeps pendingConfirm on ambiguous user message', () => { ... });
    test('clears plan on end step', () => { ... });
    test('generates correct promptHint', () => { ... });
  });

  describe('multi-turn recovery', () => {
    test('replaying recordToolCall from history rebuilds state', () => { ... });
  });
});
```

- [ ] **Step 2: Run tests, verify fail**

- [ ] **Step 3: Implement V2**

Add to existing `SOPGuard` class:
- `activeSkill`, `activePlan`, `currentStepId`, `pendingConfirm` fields
- `activatePlan()`, `onUserMessage()`, `getPromptHint()` methods
- Upgrade `check()` to be plan-aware
- Upgrade `recordToolCall()` to accept result and advance state
- `classifyUserIntent()` helper function
- `evaluateGuard()` helper function

Keep all existing logic as fallback when no plan is active.

- [ ] **Step 4: Run tests, iterate until pass**

- [ ] **Step 5: Run existing sop-guard tests for regression**

Run: `cd backend && bun test tests/unittest/engine/sop-guard.test.ts`

- [ ] **Step 6: Commit**

```bash
git add backend/src/engine/sop-guard.ts tests/unittest/engine/sop-guard-v2.test.ts
git commit -m "feat: upgrade SOPGuard to V2 (plan-aware state tracking)"
```

---

## Phase 4: Integration

### Task 7: Integrate SOPGuard V2 into runner.ts and skills.ts

**Files:**
- Modify: `backend/src/engine/runner.ts`
- Modify: `backend/src/engine/skills.ts`

Four integration points in runner.ts, one in skills.ts.

- [ ] **Step 1: Pass tool result to recordToolCall**

In `sopWrappedTools` execute wrapper in runner.ts, change:

```typescript
sopGuard.recordToolCall(name);
```

to:

```typescript
const toolSuccess = !isErrorResult(result);
const toolHasData = !isNoDataResult(result);
sopGuard.recordToolCall(name, { success: toolSuccess, hasData: toolHasData });
```

Use the existing `isNoDataResult` import. Add a helper `isErrorResult` that parses JSON and checks for explicit error signals (avoid string-matching which can false-positive on legitimate data containing "error"):

```typescript
function isErrorResult(result: unknown): boolean {
  try {
    let text = '';
    if (typeof result === 'string') {
      text = result;
    } else if (result && typeof result === 'object' && 'content' in result) {
      text = (result as any).content?.[0]?.text ?? '';
    }
    if (text.startsWith('Error:')) return true;
    const parsed = JSON.parse(text);
    return parsed.success === false || parsed.error !== undefined;
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: Inject promptHint into system prompt**

After `systemPrompt` is built, before `generateText`:

```typescript
const sopHint = sopGuard.getPromptHint();
if (sopHint) systemPrompt += '\n\n' + sopHint;
```

- [ ] **Step 3: Call onUserMessage at start of runAgent**

At the beginning of `runAgent`, after `sopGuard` is created/restored:

```typescript
sopGuard.onUserMessage(userMessage);
```

- [ ] **Step 4: Activate plan on skill load via closure wrapper**

**Important:** `skillsTools` is a module-level constant in `skills.ts` — it has no access to the per-request `sopGuard` instance. Do NOT use a module-level setter (concurrency unsafe with multiple users).

Instead, wrap `skillsTools` in the `runAgent` closure (same pattern as `sopWrappedTools`). In `runner.ts`, before the `generateText` call, replace:

```typescript
tools: {
  ...sopWrappedTools,
  ...skillsTools,
},
```

with:

```typescript
// Wrap get_skill_instructions to activate plan on skill load
const planAwareSkillsTools = {
  ...skillsTools,
  get_skill_instructions: {
    ...skillsTools.get_skill_instructions,
    execute: async (args: { skill_name: string }) => {
      const result = await skillsTools.get_skill_instructions.execute(args);
      // Activate plan if available (after successful load)
      if (typeof result === 'string' && !result.startsWith('Error:')) {
        const resolvedName = args.skill_name.replace(/_/g, '-');
        try {
          const planRow = findPublishedSpec(resolvedName) ?? findPublishedSpec(args.skill_name);
          if (planRow) {
            sopGuard.activatePlan(resolvedName, JSON.parse(planRow.spec_json));
          }
        } catch { /* ignore parse errors */ }
      }
      return result;
    },
  },
};

// In generateText:
tools: {
  ...sopWrappedTools,
  ...planAwareSkillsTools,
},
```

Add `findPublishedSpec` function (query `skill_workflow_specs` table by skill_id + status='published'):

```typescript
import { db } from '../db';
import { skillWorkflowSpecs } from '../db/schema';
import { eq, and } from 'drizzle-orm';

function findPublishedSpec(skillId: string) {
  return db.select().from(skillWorkflowSpecs)
    .where(and(eq(skillWorkflowSpecs.skill_id, skillId), eq(skillWorkflowSpecs.status, 'published')))
    .get();
}
```

- [ ] **Step 4a: When plan active, replace SOP_ENFORCEMENT_SUFFIX with lighter version**

In the closure wrapper above, when plan is activated, replace the full `SOP_ENFORCEMENT_SUFFIX` with a shorter version that doesn't conflict with `promptHint`:

```typescript
if (planRow) {
  // Replace verbose SOP suffix with plan-aware hint
  return result.replace(SOP_ENFORCEMENT_SUFFIX, '\n\n---\n## SOP 执行要求\n按照状态图顺序执行，系统会自动约束工具调用顺序。\n');
}
```

- [ ] **Step 4b: Pass default result in history replay**

In the existing history replay loop (around line 381-388), change:

```typescript
sopGuard.recordToolCall(part.toolName);
```

to:

```typescript
sopGuard.recordToolCall(part.toolName, { success: true, hasData: true });
```

This ensures SOPGuard V2 rebuilds `currentStepId` correctly from history.

- [ ] **Step 5: Run full test suite**

Run: `cd backend && bun test tests/unittest/`

- [ ] **Step 6: Commit**

```bash
git add backend/src/engine/runner.ts backend/src/engine/skills.ts
git commit -m "feat: integrate SOPGuard V2 into runner and skill loading"
```

---

### Task 8: Hook compiler into save/publish

**Files:**
- Modify: `backend/src/agent/km/skills/skill-creator.ts`
- Modify: `backend/src/agent/km/skills/skill-versions.ts`

- [ ] **Step 1: Add compile-on-save**

In `skill-creator.ts` (path: `backend/src/agent/km/skills/skill-creator.ts`), after `syncSkillMetadata()`:

```typescript
try {
  const { compileWorkflow } = await import('../../../engine/skill-workflow-compiler');
  const { extractMermaidBlock } = await import('../../../engine/skill-workflow-compiler');
  const compileResult = compileWorkflow(body.skill_md, body.skill_name, 1);
  if (compileResult.spec) {
    const mermaidSrc = extractMermaidBlock(body.skill_md) ?? '';
    db.insert(skillWorkflowSpecs).values({
      skill_id: body.skill_name,
      version_no: 1,
      status: 'draft',
      spec_json: JSON.stringify(compileResult.spec),
      mermaid_checksum: Bun.hash(mermaidSrc).toString(16),
    }).onConflictDoUpdate({
      target: [skillWorkflowSpecs.skill_id, skillWorkflowSpecs.version_no],
      set: { spec_json: JSON.stringify(compileResult.spec), status: 'draft', mermaid_checksum: Bun.hash(mermaidSrc).toString(16), updated_at: new Date().toISOString() },
    }).run();
  }
} catch (e) {
  logger.warn('skill-creator', 'compile_error', { error: String(e) });
}
```

- [ ] **Step 2: Add compile-on-publish**

In `skill-versions.ts` (path: `backend/src/agent/km/skills/skill-versions.ts`), before `publishVersion()`.

To read the skill content, use the existing version detail pattern (see `/test` endpoint around line 119-126):

```typescript
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { BIZ_SKILLS_DIR } from '../../../services/paths';

// In the publish handler, before publishVersion():
const { compileWorkflow } = await import('../../../engine/skill-workflow-compiler');
// Read skill content from the published version's snapshot
const versionDetail = getVersionDetail(body.skill, body.version_no);
let skillMd: string | null = null;
if (versionDetail?.snapshot_path) {
  try {
    skillMd = readFileSync(resolve(BIZ_SKILLS_DIR, '..', '.versions', versionDetail.snapshot_path, 'SKILL.md'), 'utf-8');
  } catch { /* fallback: read from biz-skills */ }
}
if (!skillMd) {
  try { skillMd = readFileSync(resolve(BIZ_SKILLS_DIR, body.skill, 'SKILL.md'), 'utf-8'); } catch { /* ignore */ }
}

if (skillMd) {
  const result = compileWorkflow(skillMd, body.skill, body.version_no);
  if (result.errors.length > 0) {
    return c.json({ error: 'Workflow 编译失败', details: result.errors }, 400);
  }
  if (result.spec) {
    db.insert(skillWorkflowSpecs).values({
      skill_id: body.skill,
      version_no: body.version_no,
      status: 'published',
      spec_json: JSON.stringify(result.spec),
    }).onConflictDoUpdate({
      target: [skillWorkflowSpecs.skill_id, skillWorkflowSpecs.version_no],
      set: { spec_json: JSON.stringify(result.spec), status: 'published', updated_at: new Date().toISOString() },
    }).run();
  }
}
```

- [ ] **Step 3: Add compile-on-startup in syncAllSkillMetadata**

In `backend/src/engine/skills.ts`, at the end of `syncAllSkillMetadata()`:

```typescript
// Compile workflow specs for published skills that don't have one yet
try {
  const { compileWorkflow } = await import('./skill-workflow-compiler');
  for (const row of rows) {
    const existing = db.select().from(skillWorkflowSpecs)
      .where(and(eq(skillWorkflowSpecs.skill_id, row.id), eq(skillWorkflowSpecs.status, 'published')))
      .get();
    if (existing) continue;
    const mdPath = join(SKILLS_DIR, row.id, 'SKILL.md');
    if (!existsSync(mdPath)) continue;
    const content = readFileSync(mdPath, 'utf-8');
    const result = compileWorkflow(content, row.id, row.published_version ?? 1);
    if (result.spec) {
      db.insert(skillWorkflowSpecs).values({
        skill_id: row.id,
        version_no: row.published_version ?? 1,
        status: 'published',
        spec_json: JSON.stringify(result.spec),
      }).onConflictDoNothing().run();
      logger.info('skills', 'workflow_spec_compiled', { skill: row.id });
    }
  }
} catch (e) {
  logger.warn('skills', 'workflow_compile_startup_error', { error: String(e) });
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/agent/km/skills/skill-creator.ts backend/src/agent/km/skills/skill-versions.ts
git commit -m "feat: compile workflow spec on skill save/publish"
```

---

### Task 9: Update spec documentation

**Files:**
- Modify: `backend/skills/tech-skills/skill-creator-spec/references/spec-writing.md`
- Modify: `backend/skills/tech-skills/skill-creator-spec/references/spec-checklist.md`

- [ ] **Step 1: Add annotation conventions to spec-writing.md**

- [ ] **Step 2: Add checklist items to spec-checklist.md**

- [ ] **Step 3: Commit**

```bash
git add backend/skills/tech-skills/skill-creator-spec/references/
git commit -m "docs: add workflow annotation conventions to spec-writing and checklist"
```

---

### Task 10: Integration test

**Files:**
- Create: `tests/unittest/engine/sop-guard-integration.test.ts`

- [ ] **Step 1: Write integration test**

Test the full flow: compile service-cancel → create SOPGuard → activate plan → simulate tool calls → verify state progression and blocking.

```typescript
describe('SOPGuard V2 + compiler integration', () => {
  test('service-cancel: blocks cancel_service before query_subscriber', () => { ... });
  test('service-cancel: allows cancel_service after query + confirm', () => { ... });
  test('service-cancel: blocks during pendingConfirm', () => { ... });
  test('service-cancel: promptHint reflects current state', () => { ... });
});
```

- [ ] **Step 2: Run test**

Run: `cd backend && bun test tests/unittest/engine/sop-guard-integration.test.ts`

- [ ] **Step 3: Run full suite**

Run: `cd backend && bun test tests/unittest/`

- [ ] **Step 4: Commit**

```bash
git add tests/unittest/engine/sop-guard-integration.test.ts
git commit -m "test: add SOPGuard V2 + compiler integration test"
```

---

## Summary

| Phase | Tasks | Key Deliverable |
|-------|-------|----------------|
| Phase 1 | Task 1-3 | DB table + types + annotation parsing |
| Phase 2 | Task 4-5 | Compiler + annotated service-cancel |
| Phase 3 | Task 6 | SOPGuard V2 (core) |
| Phase 4 | Task 7-10 | Runner integration + save/publish hooks + docs + integration test |

Total: 10 tasks. ~40% less than 方案三 (15 tasks).

**What's NOT changed:** chat-ws.ts, chat.ts, index.ts, frontend. No new routes. No instance persistence.
