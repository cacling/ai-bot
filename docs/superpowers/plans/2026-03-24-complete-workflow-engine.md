# Complete Workflow Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete workflow engine where the runtime owns flow control — it decides the current step, calls tools directly, pauses for confirmation, logs events, and persists instance state. LLM only generates language for the current step.

**Architecture:** Runtime-driven step loop replaces LLM's `generateText(maxSteps:10)` for workflow-managed skills. Each business conversation creates a `skill_instance` (persisted in DB), which tracks current step, pending confirm, branch context, and tool results. Every state transition emits an event to `skill_instance_events` for audit/replay. Step handlers (tool/message/ref/confirm/choice/human/end) each have a single responsibility. Skills without compiled specs fall back to existing `runAgent()`.

**Tech Stack:** Bun + Drizzle ORM (SQLite), Vercel AI SDK (`generateText`), TypeScript strict, Bun:test

**Spec:** `docs/superpowers/specs/2026-03-24-complete-workflow-engine-architecture.md`

**Reused from prior work:**
- `skill-workflow-compiler.ts` — Mermaid to WorkflowSpec compiler (already built)
- `skill-workflow-types.ts` — Core types (extend with instance/event types)
- `skill_workflow_specs` DB table (already exists)
- All 7 annotated SKILL.md files (already annotated)
- MCP tool execution chain in `runner.ts` (export for reuse)

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| **Data Layer** | | |
| `packages/shared-db/src/schema/platform.ts` | Modify | Add `skill_instances` + `skill_instance_events` tables |
| `backend/src/db/schema/platform.ts` | Modify | Re-export new tables |
| `backend/src/engine/skill-workflow-types.ts` | Modify | Add InstanceStatus, SkillInstanceRow, EventType types |
| **Instance Management** | | |
| `backend/src/engine/skill-instance-store.ts` | Create | CRUD for instances + events (create, load, advance, finish, appendEvent) |
| **Step Handlers** | | |
| `backend/src/engine/skill-branch-resolver.ts` | Create | Guard evaluation for choice nodes |
| `backend/src/engine/skill-tool-executor.ts` | Create | Direct MCP tool call (no LLM) |
| `backend/src/engine/skill-step-renderer.ts` | Create | Single-shot LLM for message/ref/confirm text |
| **Core Runtime** | | |
| `backend/src/engine/skill-runtime.ts` | Create | The orchestration loop: `runSkillTurn()` |
| `backend/src/engine/skill-router.ts` | Create | Route to runtime vs legacy `runAgent` |
| **Integration** | | |
| `backend/src/engine/runner.ts` | Modify | Export `getMcpToolsForRuntime()` |
| `backend/src/chat/chat-ws.ts` | Modify | Route through skill-router |
| `backend/src/chat/chat.ts` | Modify | Same routing for HTTP |
| **Tests** | | |
| `tests/unittest/engine/skill-instance-store.test.ts` | Create | Instance + event CRUD tests |
| `tests/unittest/engine/skill-branch-resolver.test.ts` | Create | Guard evaluation tests |
| `tests/unittest/engine/skill-tool-executor.test.ts` | Create | Tool execution tests |
| `tests/unittest/engine/skill-runtime.test.ts` | Create | Runtime loop tests |
| `frontend/tests/e2e/13-workflow-engine.spec.ts` | Create | UI-driven multi-step verification |

---

## Phase 1: Data Layer + Instance Store

### Task 1: Add `skill_instances` and `skill_instance_events` tables

**Files:**
- Modify: `packages/shared-db/src/schema/platform.ts`
- Modify: `backend/src/db/schema/platform.ts`
- Modify: `backend/src/engine/skill-workflow-types.ts`

- [ ] **Step 1: Add tables to shared-db**

At end of `packages/shared-db/src/schema/platform.ts` (after existing `skillWorkflowSpecs`):

```typescript
export const skillInstances = sqliteTable('skill_instances', {
  id: text('id').primaryKey(),                    // uuid
  session_id: text('session_id').notNull(),
  skill_id: text('skill_id').notNull(),
  skill_version: integer('skill_version').notNull(),
  status: text('status').notNull(),               // running | waiting_user | completed | escalated | aborted
  current_step_id: text('current_step_id'),
  pending_confirm: integer('pending_confirm').default(0), // 0=false, 1=true (SQLite has no bool)
  branch_context: text('branch_context'),         // JSON
  last_tool_result: text('last_tool_result'),     // JSON
  revision: integer('revision').default(1),
  started_at: text('started_at').default(sql`(datetime('now'))`),
  updated_at: text('updated_at').default(sql`(datetime('now'))`),
  finished_at: text('finished_at'),
});

export const skillInstanceEvents = sqliteTable('skill_instance_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  instance_id: text('instance_id').notNull(),
  seq: integer('seq').notNull(),
  event_type: text('event_type').notNull(),       // state_enter | tool_call | tool_result | branch_taken | user_confirm | user_cancel | guard_block | handoff | completed
  step_id: text('step_id'),
  tool_name: text('tool_name'),
  payload_json: text('payload_json'),
  created_at: text('created_at').default(sql`(datetime('now'))`),
});
```

- [ ] **Step 2: Re-export from backend schema**

Add `skillInstances, skillInstanceEvents` to `backend/src/db/schema/platform.ts` re-export list.

- [ ] **Step 3: Add types to skill-workflow-types.ts**

```typescript
export type InstanceStatus = 'running' | 'waiting_user' | 'completed' | 'escalated' | 'aborted';

export type EventType =
  | 'state_enter' | 'tool_call' | 'tool_result' | 'branch_taken'
  | 'user_confirm' | 'user_cancel' | 'guard_block' | 'handoff' | 'completed';
```

- [ ] **Step 4: Push schema**

Run: `cd backend && bunx drizzle-kit push`

- [ ] **Step 5: Commit**

```bash
git add packages/shared-db/src/schema/platform.ts backend/src/db/schema/platform.ts backend/src/engine/skill-workflow-types.ts
git commit -m "feat: add skill_instances and skill_instance_events tables"
```

---

### Task 2: Create skill-instance-store.ts

**Files:**
- Create: `backend/src/engine/skill-instance-store.ts`
- Create: `tests/unittest/engine/skill-instance-store.test.ts`

- [ ] **Step 1: Write tests**

```typescript
describe('SkillInstanceStore', () => {
  test('createInstance returns instance with running status');
  test('findActiveInstance returns null when none active');
  test('findActiveInstance returns running instance for session');
  test('advanceStep updates step and increments revision');
  test('advanceStep fails on revision mismatch (optimistic lock)');
  test('setPendingConfirm toggles confirm state');
  test('finishInstance sets status and finished_at');
  test('appendEvent increments seq per instance');
  test('getEvents returns ordered event list');
});
```

- [ ] **Step 2: Run tests, verify fail**

- [ ] **Step 3: Implement**

```typescript
import { db } from '../db';
import { skillInstances, skillInstanceEvents } from '../db/schema';
import { eq, and, sql, desc } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import type { InstanceStatus, EventType } from './skill-workflow-types';

export function createInstance(sessionId: string, skillId: string, skillVersion: number, startStepId: string) {
  const id = randomUUID();
  db.insert(skillInstances).values({
    id, session_id: sessionId, skill_id: skillId,
    skill_version: skillVersion, status: 'running',
    current_step_id: startStepId, pending_confirm: 0,
  }).run();
  return { id, sessionId, skillId, skillVersion, status: 'running' as const, currentStepId: startStepId, pendingConfirm: false, revision: 1 };
}

export function findActiveInstance(sessionId: string) {
  return db.select().from(skillInstances)
    .where(and(
      eq(skillInstances.session_id, sessionId),
      eq(skillInstances.status, 'running'),
    )).get() ?? db.select().from(skillInstances)
    .where(and(
      eq(skillInstances.session_id, sessionId),
      eq(skillInstances.status, 'waiting_user'),
    )).get() ?? null;
}

export function advanceStep(instanceId: string, nextStepId: string, currentRevision: number): boolean {
  const result = db.update(skillInstances).set({
    current_step_id: nextStepId,
    revision: currentRevision + 1,
    updated_at: new Date().toISOString(),
  }).where(and(
    eq(skillInstances.id, instanceId),
    eq(skillInstances.revision, currentRevision),
  )).run();
  return result.changes > 0;
}

export function setPendingConfirm(instanceId: string, pending: boolean): void {
  db.update(skillInstances).set({
    pending_confirm: pending ? 1 : 0,
    status: pending ? 'waiting_user' : 'running',
    updated_at: new Date().toISOString(),
  }).where(eq(skillInstances.id, instanceId)).run();
}

export function updateLastToolResult(instanceId: string, result: unknown): void {
  db.update(skillInstances).set({
    last_tool_result: JSON.stringify(result),
    updated_at: new Date().toISOString(),
  }).where(eq(skillInstances.id, instanceId)).run();
}

export function finishInstance(instanceId: string, status: 'completed' | 'escalated' | 'aborted'): void {
  db.update(skillInstances).set({
    status, finished_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).where(eq(skillInstances.id, instanceId)).run();
}

export function appendEvent(instanceId: string, event: {
  eventType: EventType; stepId?: string; toolName?: string; payload?: unknown;
}): void {
  const maxSeq = db.select({ max: sql<number>`MAX(seq)` }).from(skillInstanceEvents)
    .where(eq(skillInstanceEvents.instance_id, instanceId)).get();
  const seq = (maxSeq?.max ?? 0) + 1;
  db.insert(skillInstanceEvents).values({
    instance_id: instanceId, seq,
    event_type: event.eventType, step_id: event.stepId,
    tool_name: event.toolName,
    payload_json: event.payload ? JSON.stringify(event.payload) : null,
  }).run();
}

export function getEvents(instanceId: string) {
  return db.select().from(skillInstanceEvents)
    .where(eq(skillInstanceEvents.instance_id, instanceId))
    .orderBy(skillInstanceEvents.seq).all();
}
```

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Commit**

```bash
git add backend/src/engine/skill-instance-store.ts tests/unittest/engine/skill-instance-store.test.ts
git commit -m "feat: add skill instance store (CRUD + event logging)"
```

---

## Phase 2: Step Handlers

### Task 3: Create skill-branch-resolver.ts

Same as 方案 B Plan Task 3. Guard evaluation for choice nodes + user intent classification.

- [ ] **Step 1-5: Write tests, implement, commit**

```bash
git commit -m "feat: add branch resolver for guard evaluation"
```

---

### Task 4: Create skill-tool-executor.ts

Same as 方案 B Plan Task 4. Direct MCP tool call without LLM.

- [ ] **Step 1-5: Write tests, implement, commit**

```bash
git commit -m "feat: add tool executor (direct MCP call)"
```

---

### Task 5: Create skill-step-renderer.ts

Same as 方案 B Plan Task 5. Single-shot `generateText` with no tools for message/ref/confirm.

- [ ] **Step 1-5: Write tests, implement, commit**

```bash
git commit -m "feat: add step renderer (LLM text-only generation)"
```

---

## Phase 3: Core Runtime

### Task 6: Create skill-runtime.ts

**Files:**
- Create: `backend/src/engine/skill-runtime.ts`
- Create: `tests/unittest/engine/skill-runtime.test.ts`

This is the core — the orchestration loop. Key difference from 方案 B: uses `skill-instance-store` instead of session column, and emits events.

- [ ] **Step 1: Write tests**

```typescript
describe('SkillRuntime', () => {
  describe('runSkillTurn', () => {
    test('creates instance on first turn');
    test('resumes instance on subsequent turns');
    test('tool step: calls MCP, logs event, advances');
    test('message step: renders text, pauses for user');
    test('confirm step: pauses and sets pending_confirm');
    test('confirm with user.confirm: advances past confirm');
    test('confirm with user.cancel: takes cancel branch');
    test('choice step: evaluates guard, advances');
    test('end step: finishes instance');
    test('human step: finishes with escalated status');
    test('consecutive tools: executes chain in one turn');
    test('events logged for each state transition');
  });
});
```

- [ ] **Step 2: Run tests, verify fail**

- [ ] **Step 3: Implement**

Core structure (see 方案 B Task 6 for the loop logic, adapted to use instance store):

```typescript
import type { WorkflowSpec, WorkflowStep } from './skill-workflow-types';
import * as store from './skill-instance-store';
import { executeTool, buildToolArgs } from './skill-tool-executor';
import { renderStep } from './skill-step-renderer';
import { resolveBranch, classifyUserIntent } from './skill-branch-resolver';
import { logger } from '../services/logger';

export interface SkillTurnResult {
  text: string;
  currentStepId: string | null;
  instanceId: string;
  pendingConfirm: boolean;
  finished: boolean;
  toolRecords: Array<{ tool: string; result: string; success: boolean }>;
  transferRequested: boolean;
}

export async function runSkillTurn(
  sessionId: string,
  userMessage: string,
  spec: WorkflowSpec,
  mcpTools: Record<string, any>,
  context: { phone: string; subscriberName?: string; lang: 'zh' | 'en'; history: Array<{ role: string; content: string }> },
): Promise<SkillTurnResult> {
  // 1. Load or create instance
  let instance = store.findActiveInstance(sessionId);
  if (!instance) {
    const created = store.createInstance(sessionId, spec.skillId, spec.version, spec.startStepId);
    instance = { ...created, /* map to row format */ } as any;
    store.appendEvent(created.id, { eventType: 'state_enter', stepId: spec.startStepId });
    // Auto-advance past non-actionable start nodes
    advanceToActionable(created.id, spec, spec.startStepId, null);
    instance = store.findActiveInstance(sessionId)!;
  }
  const instanceId = instance.id;
  let currentStepId = instance.current_step_id!;
  let revision = instance.revision ?? 1;

  // 2. Handle pending confirm
  if (instance.pending_confirm) {
    const intent = classifyUserIntent(userMessage);
    if (intent !== 'other') {
      const step = spec.steps[currentStepId];
      const target = step ? resolveBranch(step.transitions, { userIntent: intent }) : null;
      if (target) {
        store.appendEvent(instanceId, { eventType: intent === 'confirm' ? 'user_confirm' : 'user_cancel', stepId: currentStepId });
        store.advanceStep(instanceId, target, revision++);
        store.setPendingConfirm(instanceId, false);
        currentStepId = advanceToActionable(instanceId, spec, target, null);
      }
    } else {
      // Ambiguous — render clarification
      const step = spec.steps[currentStepId];
      const text = step ? await renderStep(step, { userMessage, history: context.history, skillName: spec.skillId, phone: context.phone, subscriberName: context.subscriberName, lang: context.lang, sessionState: { skillName: spec.skillId, versionNo: spec.version, currentStepId, pendingConfirm: true, startedAt: instance.started_at } }) : '';
      return { text, currentStepId, instanceId, pendingConfirm: true, finished: false, toolRecords: [], transferRequested: false };
    }
  }

  // 3. Main loop
  const toolRecords: SkillTurnResult['toolRecords'] = [];
  let replyParts: string[] = [];
  let finished = false;
  let transferRequested = false;
  let lastToolResult: { success: boolean; hasData: boolean; payload?: unknown } | null = instance.last_tool_result ? JSON.parse(instance.last_tool_result) : null;
  let safety = 15;

  while (safety-- > 0) {
    const step = spec.steps[currentStepId];
    if (!step) { finished = true; break; }

    switch (step.kind) {
      case 'tool': {
        const args = buildToolArgs(step.tool!, { phone: context.phone, sessionId });
        store.appendEvent(instanceId, { eventType: 'tool_call', stepId: currentStepId, toolName: step.tool, payload: args });
        const result = await executeTool(step.tool!, args, mcpTools);
        lastToolResult = { success: result.success, hasData: result.hasData, payload: result.parsed };
        store.updateLastToolResult(instanceId, lastToolResult);
        store.appendEvent(instanceId, { eventType: 'tool_result', stepId: currentStepId, toolName: step.tool, payload: { success: result.success, hasData: result.hasData, preview: result.rawText.slice(0, 200) } });
        toolRecords.push({ tool: step.tool!, result: result.rawText.slice(0, 200), success: result.success });

        const target = resolveBranch(step.transitions, { toolResult: result });
        if (target) {
          store.appendEvent(instanceId, { eventType: 'branch_taken', stepId: currentStepId, payload: { target, guard: step.transitions.find(t => t.target === target)?.guard } });
          store.advanceStep(instanceId, target, revision++);
          currentStepId = advanceToActionable(instanceId, spec, target, lastToolResult);
        } else {
          logger.warn('skill-runtime', 'tool_branch_unresolved', { step: currentStepId, tool: step.tool });
          break;
        }
        continue;
      }

      case 'message':
      case 'ref': {
        store.appendEvent(instanceId, { eventType: 'state_enter', stepId: currentStepId });
        const refContent = step.ref ? loadReference(spec.skillId, step.ref) : undefined;
        const toolFacts = lastToolResult ? summarizeToolResult(lastToolResult) : undefined;
        const text = await renderStep(step, {
          userMessage, history: context.history, skillName: spec.skillId,
          phone: context.phone, subscriberName: context.subscriberName, lang: context.lang,
          toolFacts, refContent,
          sessionState: { skillName: spec.skillId, versionNo: spec.version, currentStepId, pendingConfirm: false, startedAt: instance.started_at },
        });
        replyParts.push(text);

        const target = resolveBranch(step.transitions, {});
        if (target) {
          store.advanceStep(instanceId, target, revision++);
          currentStepId = advanceToActionable(instanceId, spec, target, lastToolResult);
        }
        const nextStep = spec.steps[currentStepId];
        if (!nextStep || nextStep.kind === 'confirm' || nextStep.kind === 'message' || nextStep.kind === 'ref') break;
        continue;
      }

      case 'confirm': {
        store.appendEvent(instanceId, { eventType: 'state_enter', stepId: currentStepId });
        const toolFacts = lastToolResult ? summarizeToolResult(lastToolResult) : undefined;
        const text = await renderStep(step, {
          userMessage, history: context.history, skillName: spec.skillId,
          phone: context.phone, subscriberName: context.subscriberName, lang: context.lang, toolFacts,
          sessionState: { skillName: spec.skillId, versionNo: spec.version, currentStepId, pendingConfirm: true, startedAt: instance.started_at },
        });
        replyParts.push(text);
        store.setPendingConfirm(instanceId, true);
        break;
      }

      case 'end': {
        store.appendEvent(instanceId, { eventType: 'completed', stepId: currentStepId });
        store.finishInstance(instanceId, 'completed');
        finished = true;
        break;
      }

      case 'human': {
        store.appendEvent(instanceId, { eventType: 'handoff', stepId: currentStepId });
        store.finishInstance(instanceId, 'escalated');
        transferRequested = true;
        finished = true;
        break;
      }

      case 'choice': {
        const target = resolveBranch(step.transitions, { toolResult: lastToolResult ?? undefined });
        if (target) {
          store.appendEvent(instanceId, { eventType: 'branch_taken', stepId: currentStepId, payload: { target } });
          store.advanceStep(instanceId, target, revision++);
          currentStepId = target;
          continue;
        }
        logger.warn('skill-runtime', 'choice_unresolved', { step: currentStepId });
        break;
      }

      default: break;
    }
    break;
  }

  return {
    text: replyParts.join('\n\n'),
    currentStepId: finished ? null : currentStepId,
    instanceId,
    pendingConfirm: !finished && spec.steps[currentStepId]?.kind === 'confirm',
    finished,
    toolRecords,
    transferRequested,
  };
}

/** Advance past non-actionable nodes (choice with resolved guards, message with single always) */
function advanceToActionable(instanceId: string, spec: WorkflowSpec, stepId: string, lastToolResult: any): string {
  let current = stepId;
  let safety = 20;
  while (safety-- > 0) {
    const step = spec.steps[current];
    if (!step) break;
    if (step.kind === 'choice') {
      const target = resolveBranch(step.transitions, { toolResult: lastToolResult ?? undefined });
      if (target) { current = target; store.advanceStep(instanceId, target, 0); continue; }
      break;
    }
    if ((step.kind === 'message' || step.kind === 'ref') && step.transitions.length === 1 && step.transitions[0].guard === 'always') {
      current = step.transitions[0].target;
      continue;
    }
    break;
  }
  return current;
}

function loadReference(skillName: string, refPath: string): string | undefined {
  try {
    const { readFileSync } = require('fs');
    const { join } = require('path');
    const { BIZ_SKILLS_DIR } = require('../services/paths');
    return readFileSync(join(BIZ_SKILLS_DIR, skillName, 'references', refPath), 'utf-8');
  } catch { return undefined; }
}

function summarizeToolResult(result: { success: boolean; hasData: boolean; payload?: unknown }): string {
  const status = result.success ? (result.hasData ? '成功' : '成功但无数据') : '失败';
  return `查询结果（${status}）：${JSON.stringify(result.payload ?? {}).slice(0, 500)}`;
}
```

- [ ] **Step 4: Run tests, iterate until pass**

- [ ] **Step 5: Commit**

```bash
git add backend/src/engine/skill-runtime.ts tests/unittest/engine/skill-runtime.test.ts
git commit -m "feat: add workflow runtime core (instance-backed orchestration loop)"
```

---

## Phase 4: Router + Chat Integration

### Task 7: Create skill-router.ts

Route to runtime for skills with published specs, legacy `runAgent` otherwise. Same as 方案 B Task 7 but uses instance store instead of session column.

Key change: `routeSkill` checks `findActiveInstance(sessionId)` from instance store.

- [ ] **Step 1-2: Implement + commit**

```bash
git commit -m "feat: add skill router (runtime vs legacy)"
```

---

### Task 8: Export getMcpToolsForRuntime from runner.ts

**Files:**
- Modify: `backend/src/engine/runner.ts`

- [ ] **Step 1: Add export**

```typescript
export async function getMcpToolsForRuntime(): Promise<Record<string, any>> {
  const { tools } = await getMCPTools();
  return tools as Record<string, any>;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/engine/runner.ts
git commit -m "feat: export getMcpToolsForRuntime from runner"
```

---

### Task 9: Integrate into chat-ws.ts

**Files:**
- Modify: `backend/src/chat/chat-ws.ts`

Before existing `runAgent` call, add routing check:

```typescript
const route = routeSkill(sessionId);
if (route.mode === 'runtime' && route.spec) {
  const turnResult = await runSkillTurn(sessionId, message, route.spec, await getMcpToolsForRuntime(), { ... });
  // Persist, push WS events, handle transfer
  return;
}
// Fall through to legacy runAgent
```

After legacy `runAgent` returns, check if skill should activate runtime for next turn:

```typescript
if (result.skill_diagram?.skill_name) {
  const rt = shouldUseRuntime(result.skill_diagram.skill_name);
  if (rt.use && rt.spec) {
    store.createInstance(sessionId, rt.spec.skillId, rt.spec.version, rt.spec.startStepId);
  }
}
```

- [ ] **Step 1-3: Implement, test manually, commit**

```bash
git commit -m "feat: integrate workflow engine into WS chat"
```

---

### Task 10: Integrate into chat.ts (HTTP)

Same pattern as Task 9 for HTTP endpoint.

- [ ] **Step 1-2: Implement, commit**

```bash
git commit -m "feat: integrate workflow engine into HTTP chat"
```

---

## Phase 5: E2E Verification + Grayscale

### Task 11: E2E tests for workflow engine

**Files:**
- Create: `frontend/tests/e2e/13-workflow-engine.spec.ts`

Multi-step flow tests (same scenarios as `12-sop-ui-verification.spec.ts` but verifying instance-backed behavior):

```typescript
test('WF-01: standard cancel — 4 step flow with instance persistence');
test('WF-02: unknown charge — query then cancel');
test('WF-03: user cancel branch — no operation executed');
test('WF-04: mid-flow transfer to human');
test('WF-05: instance survives across page reload (session-level state)');
```

- [ ] **Step 1-3: Write tests, run with `--headed`, commit**

```bash
RUNTIME_ORCHESTRATED_SKILLS=service-cancel npx playwright test 13-workflow-engine.spec.ts --headed
git commit -m "test: add E2E tests for complete workflow engine"
```

---

### Task 12: Documentation

- [ ] **Step 1: Update quickstart.md with workflow engine commands**
- [ ] **Step 2: Commit**

```bash
git commit -m "docs: add workflow engine to quickstart"
```

---

## Summary

| Phase | Tasks | Key Deliverable |
|-------|-------|----------------|
| Phase 1 | 1-2 | DB tables + instance store |
| Phase 2 | 3-5 | Branch resolver + tool executor + step renderer |
| Phase 3 | 6 | **Core runtime loop** (the hardest task) |
| Phase 4 | 7-10 | Router + WS/HTTP integration |
| Phase 5 | 11-12 | E2E tests + docs |

**Total: 12 tasks, estimated 7-9 days.**

**Key differences from 方案 B plan:**
- Instance persisted in dedicated table (not session column)
- Every state transition emits audit event
- Instance lifecycle: create → running → waiting_user → completed/escalated/aborted
- Optimistic locking via `revision` column
- Events enable future replay/debug UI

**Grayscale:** `RUNTIME_ORCHESTRATED_SKILLS=service-cancel` env var. Empty = all skills with specs.
