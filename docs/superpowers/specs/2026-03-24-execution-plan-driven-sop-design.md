# Execution-Plan-Driven SOP Design

> Compile SKILL.md mermaid state diagrams into execution plan JSON. SOPGuard V2 reads the plan to control which tools the Agent can call at each state.

**Date**: 2026-03-24
**Status**: Draft
**Approach**: Plan B — compile mermaid to plan JSON, upgrade SOPGuard to plan-aware. No instance persistence, no chat entry changes.
**Supersedes**: `2026-03-24-skill-instance-runtime-design.md` (方案三, abandoned — too heavy)

---

## Problem Statement

Same as the superseded spec. Current SOPGuard only checks tool dependencies (partial order), not state progression. See the superseded spec for full gap analysis.

---

## Solution Overview

```
SKILL.md (with new annotations)
    |
    v
Workflow Compiler (at save/publish)  →  Plan JSON (stored in skill_workflow_specs)
    |
    v
SOPGuard V2 (at each tool call)
    |
    ├── Reads plan + calledTools → computes currentStepId
    ├── Decides: can this tool be called in this state?
    ├── Blocks operations if pendingConfirm is true
    └── Returns allow / reject (same interface as today)
```

Key difference from 方案三: **Agent keeps `maxSteps: 10`**, chat entry points are untouched, no instance persistence. SOPGuard becomes plan-aware instead of adding a separate runtime layer.

---

## 1. Mermaid Annotation Conventions

Same as superseded spec. New annotations: `%% step:`, `%% kind:`, `%% guard:`, `%% output:`.

See superseded spec Section 1 for full details. Summary:

| Annotation | Semantics |
|------------|-----------|
| `%% step:<id>` | Stable node identifier (kebab-case) |
| `%% kind:<type>` | Node type: tool / confirm / ref / human / message / choice / end |
| `%% guard:<condition>` | Transition condition: tool.success / tool.error / tool.no_data / user.confirm / user.cancel / always |
| `%% output:<key>` | Tool return value reference key |

Backward compatible: all optional, compiler infers from context when absent.

---

## 2. Data Model

**One new table** in `packages/shared-db/src/schema/platform.ts`:

```typescript
export const skillWorkflowSpecs = sqliteTable('skill_workflow_specs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  skill_id: text('skill_id').notNull(),
  version_no: integer('version_no').notNull(),
  status: text('status').notNull(),              // 'draft' | 'published'
  mermaid_checksum: text('mermaid_checksum'),
  spec_json: text('spec_json').notNull(),         // WorkflowSpec JSON
  created_at: text('created_at').default(sql`(datetime('now'))`),
  updated_at: text('updated_at').default(sql`(datetime('now'))`),
});
```

No `skill_instances` or `skill_instance_events` tables.

---

## 3. Workflow Compiler

Same as superseded spec Section 3. Reuse `WorkflowSpec`, `WorkflowStep`, `WorkflowTransition`, `GuardType`, `CompileResult` types.

Type definitions (`skill-workflow-types.ts`):

```typescript
export interface WorkflowSpec {
  skillId: string;
  version: number;
  startStepId: string;
  steps: Record<string, WorkflowStep>;
  terminalSteps: string[];
}

export interface WorkflowStep {
  id: string;
  label: string;
  kind: StepKind;
  tool?: string;
  ref?: string;
  output?: string;
  transitions: WorkflowTransition[];
}

export type StepKind = 'tool' | 'confirm' | 'ref' | 'human' | 'message' | 'choice' | 'end';

export interface WorkflowTransition {
  target: string;
  guard: GuardType;
  label?: string;
}

export type GuardType =
  | 'tool.success' | 'tool.error' | 'tool.no_data'
  | 'user.confirm' | 'user.cancel'
  | 'always';

export interface CompileResult {
  spec: WorkflowSpec | null;
  errors: string[];
  warnings: string[];
}
```

Compilation pipeline, nested state flattening, guard heuristics — all same as superseded spec.

---

## 4. SOPGuard V2

This is the core of 方案二. Replace the current dependency-only guard with a plan-aware state machine.

### Interface

```typescript
export class SOPGuard {
  // Existing
  private calledTools: Set<string>;
  private violations: number;

  // New
  private activeSkill: string | null;
  private activePlan: WorkflowSpec | null;
  private currentStepId: string | null;
  private pendingConfirm: boolean;

  /** Activate a skill's execution plan */
  activatePlan(skillName: string, plan: WorkflowSpec): void;

  /** Record tool call and advance state */
  recordToolCall(toolName: string, result?: { success: boolean; hasData: boolean }): void;

  /** Called when user message arrives (clears pendingConfirm if intent matches) */
  onUserMessage(text: string): void;

  /** Check if tool can be called */
  check(toolName: string): string | null;

  /** Get current state prompt hint for LLM injection */
  getPromptHint(): string | null;

  /** Whether to escalate (existing) */
  shouldEscalate(): boolean;
  resetViolations(): void;
}
```

### State Progression Logic

**On `check(toolName)`:**

```
1. No activePlan → fall through to existing global dependency check
2. Has activePlan →
   a. pendingConfirm === true → REJECT all operation tools
      ("当前在确认节点，请先等待用户确认")
   b. currentStep.kind === 'tool' && currentStep.tool === toolName → ALLOW
   c. toolName is query-type (readOnlyHint) → ALLOW (queries always pass)
   d. Otherwise → REJECT
      ("当前在 [X] 状态，下一步应该 [Y]")
```

**On `recordToolCall(toolName, result)`:**

```
1. calledTools.add(toolName)
2. If no activePlan → return (existing behavior)
3. Find current step's transitions
4. Evaluate guards against result:
   - result.success && result.hasData → tool.success
   - !result.success → tool.error
   - result.success && !result.hasData → tool.no_data
5. Find matching transition, advance to target step
6. Auto-advance through choice nodes (evaluate guard, continue)
7. If next step is confirm → set pendingConfirm = true
8. If next step is end → clear activePlan (skill completed)
9. If next step is human → clear activePlan (escalated)
```

**On `onUserMessage(text)`:**

```
1. If !pendingConfirm → return
2. classifyUserIntent(text):
   - confirm → evaluate guard(user.confirm), advance, clear pendingConfirm
   - cancel → evaluate guard(user.cancel), advance, clear pendingConfirm
   - other → keep pendingConfirm, LLM clarifies
```

### User Intent Classification

```typescript
function classifyUserIntent(text: string): 'confirm' | 'cancel' | 'other' {
  const CONFIRM = /确认|同意|好的|可以|办理|没问题|是的|对|嗯|行/;
  const CANCEL  = /取消|不要|算了|放弃|不用|再说|不办/;
  if (CONFIRM.test(text)) return 'confirm';
  if (CANCEL.test(text)) return 'cancel';
  return 'other';
}
```

When `other`: runtime does NOT advance. LLM naturally re-asks. Next user message re-evaluates.

### Prompt Hint

`getPromptHint()` returns a string injected into the system prompt:

```
⚡ SOP 进度：你在 [说明停机影响] 状态。
下一步是 [确认办理]——向用户说明影响并询问是否确认。
在用户确认前，禁止调用任何操作类工具。
```

When no plan is active, returns null.

### Multi-turn Recovery

From history, `recordToolCall` is called for each past tool call (existing behavior). Since `recordToolCall` now advances state, replaying history automatically rebuilds `currentStepId`.

For tool results during recovery: **assume success** for all tools found in history. Rationale: if a tool failed, the LLM would have taken the error branch or escalated — subsequent tools in history would not have been called.

### Fallback

| Situation | Handling |
|-----------|----------|
| Skill matched but no plan in DB | Existing SOPGuard global dependency check (no change) |
| Guard evaluation fails (no match) | Don't advance, log warning, let LLM respond freely |
| User switches topic (new skill loaded) | `activatePlan()` overwrites previous plan |

---

## 5. Runner.ts Integration

Four small changes:

### 5.1 Pass tool result to SOPGuard

In the `sopWrappedTools` execute wrapper:

```typescript
const result = await tool.execute(...args);
const success = !isErrorResult(result);
const hasData = !isNoDataResult(result);
sopGuard.recordToolCall(name, { success, hasData });
```

### 5.2 Inject promptHint

After building systemPrompt, before `generateText`:

```typescript
const hint = sopGuard.getPromptHint();
if (hint) systemPrompt += '\n\n' + hint;
```

### 5.3 Notify SOPGuard of user message

At the start of `runAgent`:

```typescript
sopGuard.onUserMessage(userMessage);
```

### 5.4 Activate plan on skill load

In `get_skill_instructions` execute handler in `skills.ts`:

```typescript
const plan = findPublishedSpec(resolvedName);
if (plan) sopGuard.activatePlan(resolvedName, JSON.parse(plan.spec_json));
```

**Problem:** SOPGuard is created inside `runAgent`, but `get_skill_instructions` is a tool executed within `generateText`. The SOPGuard instance is accessible via closure — same scope as `sopWrappedTools`. So `activatePlan` can be called from the tool's execute function.

Implementation: pass `sopGuard` reference to `skillsTools` or make `activatePlan` callable from the tool wrapper.

---

## 6. Compilation Triggers

Same as superseded spec:

| Trigger | Behavior |
|---------|----------|
| `/api/skill-creator/save` | Attempt compile; warnings OK |
| `/api/skill-versions/publish` | Must compile without errors; write to `skill_workflow_specs` |
| `syncSkillMetadata()` at startup | Compile missing specs for published skills |

---

## 7. Files Changed

| File | Change | Size |
|------|--------|------|
| `packages/shared-db/src/schema/platform.ts` | +1 table | S |
| `backend/src/db/schema/platform.ts` | re-export | S |
| `backend/src/engine/skill-workflow-types.ts` | Create: types | S |
| `backend/src/engine/skill-workflow-compiler.ts` | Create: compiler | L |
| `backend/src/engine/sop-guard.ts` | **Core: upgrade to V2** | M |
| `backend/src/engine/runner.ts` | 4 integration points | S |
| `backend/src/engine/skills.ts` | activatePlan on skill load | S |
| `backend/skills/.../types.ts` | Expand MermaidAnnotation | S |
| `backend/skills/.../validate_statediagram.ts` | Parse new annotations | S |
| `backend/skills/.../spec-writing.md` | Docs | S |
| `backend/skills/.../spec-checklist.md` | Docs | S |
| `backend/skills/biz-skills/service-cancel/SKILL.md` | Add annotations | M |
| `backend/src/agent/km/skills/skill-creator.ts` | Compile on save | S |
| `backend/src/agent/km/skills/skill-versions.ts` | Compile on publish | S |

**Not changed:** chat-ws.ts, chat.ts, index.ts, frontend, no new routes.

---

## 8. Grayscale

No env var needed. Plan-aware behavior activates automatically when a skill has a published spec in `skill_workflow_specs`. Skills without specs continue using existing SOPGuard logic.

---

## 9. Future Evolution to 方案三

If persistent instances are needed later:
- Add `skill_instances` + `skill_instance_events` tables
- Extract SOPGuard V2's state into the instance store
- Add REST API for instance queries
- No compiler or plan format changes needed
