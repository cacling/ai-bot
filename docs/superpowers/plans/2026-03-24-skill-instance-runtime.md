# Skill Instance Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make SKILL.md mermaid state diagrams executable at runtime — the engine controls which step the agent is on, what tools it can call, and when to pause for user confirmation.

**Architecture:** New mermaid annotations (`%% step:`, `%% kind:`, `%% guard:`) make state diagrams machine-parseable. A compiler converts them to `WorkflowSpec JSON`. A per-session `SkillInstanceRuntime` drives state transitions, wrapping the existing `runAgent` with `maxSteps:1` in an outer loop. SOPGuard remains as fallback for skills without specs.

**Tech Stack:** Bun + Drizzle ORM (SQLite), TypeScript strict, Bun:test

**Spec:** `docs/superpowers/specs/2026-03-24-skill-instance-runtime-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `packages/shared-db/src/schema/platform.ts` | Modify | Add 3 new tables + indexes |
| `backend/src/db/schema/platform.ts` | Modify | Re-export new tables |
| `backend/skills/tech-skills/skill-creator-spec/scripts/types.ts` | Modify | Expand MermaidAnnotation.type union |
| `backend/skills/tech-skills/skill-creator-spec/scripts/validate_statediagram.ts` | Modify | Parse new annotations, add compilability checks |
| `backend/skills/tech-skills/skill-creator-spec/references/spec-writing.md` | Modify | Add annotation conventions section |
| `backend/skills/tech-skills/skill-creator-spec/references/spec-checklist.md` | Modify | Add workflow-readiness checklist items |
| `backend/src/engine/skill-workflow-types.ts` | Create | WorkflowSpec, WorkflowStep, GuardType types |
| `backend/src/engine/skill-workflow-compiler.ts` | Create | Mermaid -> WorkflowSpec compiler |
| `backend/src/engine/skill-instance-store.ts` | Create | CRUD for skill_instances + events tables |
| `backend/src/engine/skill-instance-runtime.ts` | Create | State machine logic, allowed actions, guard evaluation |
| `backend/src/chat/chat.ts` | Modify | Persist responseMessages |
| `backend/src/chat/chat-ws.ts` | Modify | Integrate runtime, push active_step_id |
| `backend/src/chat/skill-instances.ts` | Create | REST API for instance queries |
| `backend/src/engine/runner.ts` | Modify | Accept workflowContext, maxStepsOverride |
| `backend/src/index.ts` | Modify | Mount skill-instances route |
| `backend/skills/biz-skills/service-cancel/SKILL.md` | Modify | Add new annotations (grayscale target) |
| `tests/unittest/engine/skill-workflow-compiler.test.ts` | Create | Compiler tests |
| `tests/unittest/engine/skill-instance-runtime.test.ts` | Create | Runtime tests |
| `tests/unittest/engine/skill-instance-store.test.ts` | Create | Store tests |

---

## Phase 0: Prerequisites

### Task 1: Persist responseMessages in HTTP chat

**Files:**
- Modify: `backend/src/chat/chat.ts:76-80`
- Reference: `backend/src/chat/chat-ws.ts:320-328` (WS already does this)

- [ ] **Step 1: Write the failing test**

Create `tests/unittest/chat/chat-response-persist.test.ts`:

```typescript
import { describe, test, expect } from 'bun:test';

describe('HTTP chat responseMessages persistence', () => {
  test('should persist tool call messages, not just final text', () => {
    // This is an integration-level concern — verify by reading chat.ts
    // and confirming responseMessages loop exists after runAgent call.
    // For now, mark as a manual verification step.
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 2: Modify chat.ts to persist responseMessages**

In `backend/src/chat/chat.ts`, after the `runAgent` call (around line 69), replace the simple 2-message insert (lines 76-80) with:

```typescript
// Persist all messages (user + tool calls + tool results + assistant)
const msgRows: Array<{ sessionId: string; role: string; content: string }> = [
  { sessionId, role: 'user', content: userMessage },
];
if (result.responseMessages) {
  for (const msg of result.responseMessages) {
    msgRows.push({ sessionId, role: msg.role, content: JSON.stringify(msg.content) });
  }
} else {
  msgRows.push({ sessionId, role: 'assistant', content: result.text });
}
await db.insert(messages).values(msgRows);
```

- [ ] **Step 3: Verify the server starts and basic chat works**

Run: `cd backend && bun run src/index.ts` (manual smoke test)

- [ ] **Step 4: Commit**

```bash
git add backend/src/chat/chat.ts
git commit -m "fix: persist responseMessages in HTTP chat (align with WS)"
```

---

### Task 2: Add 3 new database tables

**Files:**
- Modify: `packages/shared-db/src/schema/platform.ts`
- Modify: `backend/src/db/schema/platform.ts`

- [ ] **Step 1: Add tables to shared-db**

At the end of `packages/shared-db/src/schema/platform.ts`, add:

```typescript
// ── Skill Workflow Runtime ──────────────────────────────────────────

export const skillWorkflowSpecs = sqliteTable('skill_workflow_specs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  skill_id: text('skill_id').notNull(),
  version_no: integer('version_no').notNull(),
  status: text('status').notNull(),
  mermaid_checksum: text('mermaid_checksum'),
  spec_json: text('spec_json').notNull(),
  created_at: text('created_at').default(sql`(datetime('now'))`),
  updated_at: text('updated_at').default(sql`(datetime('now'))`),
});

export const skillInstances = sqliteTable('skill_instances', {
  id: text('id').primaryKey(),
  session_id: text('session_id').notNull(),
  skill_id: text('skill_id').notNull(),
  skill_version: integer('skill_version').notNull(),
  status: text('status').notNull(),
  current_step_id: text('current_step_id'),
  pending_kind: text('pending_kind'),
  branch_path_json: text('branch_path_json'),
  context_json: text('context_json'),
  revision: integer('revision').default(1),
  started_at: text('started_at').default(sql`(datetime('now'))`),
  updated_at: text('updated_at').default(sql`(datetime('now'))`),
  finished_at: text('finished_at'),
});

export const skillInstanceEvents = sqliteTable('skill_instance_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  instance_id: text('instance_id').notNull(),
  seq: integer('seq').notNull(),
  event_type: text('event_type').notNull(),
  step_id: text('step_id'),
  tool_name: text('tool_name'),
  tool_call_id: text('tool_call_id'),
  payload_json: text('payload_json'),
  message_id: integer('message_id'),
  created_at: text('created_at').default(sql`(datetime('now'))`),
});
```

Note: `sql` is already imported at the top of the file. Verify before adding.

- [ ] **Step 2: Re-export from backend schema**

In `backend/src/db/schema/platform.ts`, add to the re-export list:

```typescript
skillWorkflowSpecs, skillInstances, skillInstanceEvents,
```

- [ ] **Step 3: Push schema to DB**

Run: `cd backend && bunx drizzle-kit push`

Expected: 3 new tables created without errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared-db/src/schema/platform.ts backend/src/db/schema/platform.ts
git commit -m "feat: add skill_workflow_specs, skill_instances, skill_instance_events tables"
```

---

## Phase 1: Spec + Compiler

### Task 3: Expand MermaidAnnotation types

**Files:**
- Modify: `backend/skills/tech-skills/skill-creator-spec/scripts/types.ts`

- [ ] **Step 1: Update MermaidAnnotation.type union**

In `types.ts`, change:

```typescript
export interface MermaidAnnotation {
  type: 'tool' | 'ref' | 'branch';
```

to:

```typescript
export interface MermaidAnnotation {
  type: 'tool' | 'ref' | 'branch' | 'step' | 'kind' | 'guard' | 'output';
```

- [ ] **Step 2: Add StepKind and GuardType types**

After the `MermaidAnnotation` interface, add:

```typescript
export type StepKind = 'tool' | 'confirm' | 'ref' | 'human' | 'message' | 'choice' | 'end';

export type GuardType =
  | 'tool.success' | 'tool.error' | 'tool.no_data'
  | 'user.confirm' | 'user.cancel'
  | 'always';
```

- [ ] **Step 3: Run existing tests to ensure no regression**

Run: `cd backend && bun test tests/unittest/skills/skill-creator-spec/`

Expected: All existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/skills/tech-skills/skill-creator-spec/scripts/types.ts
git commit -m "feat: expand MermaidAnnotation types for workflow annotations"
```

---

### Task 4: Upgrade validate_statediagram.ts to parse new annotations

**Files:**
- Modify: `backend/skills/tech-skills/skill-creator-spec/scripts/validate_statediagram.ts`
- Test: `tests/unittest/backend/skills/skill-creator-spec/validate_statediagram.test.ts`

- [ ] **Step 1: Write tests for new annotation parsing**

Add to existing `validate_statediagram.test.ts`:

```typescript
import { parseStateDiagram, extractMermaidBlock } from '../../../../../backend/skills/tech-skills/skill-creator-spec/scripts/validate_statediagram';

describe('new workflow annotations', () => {
  test('parses %% step: annotations', () => {
    const mermaid = `stateDiagram-v2
      [*] --> QueryUser %% step:query-user %% kind:tool %% tool:query_subscriber
      QueryUser --> Check %% step:check-result %% kind:choice
      state Check <<choice>>
      Check --> OK : success %% guard:tool.success
      Check --> Fail : error %% guard:tool.error`;
    const result = parseStateDiagram(mermaid);
    const stepAnns = result.annotations.filter(a => a.type === 'step');
    expect(stepAnns.length).toBe(2);
    expect(stepAnns[0].value).toBe('query-user');
    const kindAnns = result.annotations.filter(a => a.type === 'kind');
    expect(kindAnns.length).toBe(2);
    const guardAnns = result.annotations.filter(a => a.type === 'guard');
    expect(guardAnns.length).toBe(2);
    expect(guardAnns[0].value).toBe('tool.success');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && bun test tests/unittest/backend/skills/skill-creator-spec/validate_statediagram.test.ts`

Expected: FAIL — new annotation types not parsed yet.

- [ ] **Step 3: Add regex patterns for new annotations**

In `validate_statediagram.ts`, add after existing `RE_ANNOTATION_BRANCH`:

```typescript
const RE_ANNOTATION_STEP = /%%\s*step:([\w-]+)/g;
const RE_ANNOTATION_KIND = /%%\s*kind:(\w+)/g;
const RE_ANNOTATION_GUARD = /%%\s*guard:([\w.]+)/g;
const RE_ANNOTATION_OUTPUT = /%%\s*output:(\w+)/g;
```

Update the `extractAnnotations` function to also extract these 4 new types (same pattern as existing tool/ref/branch).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && bun test tests/unittest/backend/skills/skill-creator-spec/validate_statediagram.test.ts`

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/skills/tech-skills/skill-creator-spec/scripts/validate_statediagram.ts tests/unittest/backend/skills/skill-creator-spec/validate_statediagram.test.ts
git commit -m "feat: parse step/kind/guard/output annotations in state diagrams"
```

---

### Task 5: Create WorkflowSpec types

**Files:**
- Create: `backend/src/engine/skill-workflow-types.ts`

- [ ] **Step 1: Create the types file**

```typescript
/**
 * skill-workflow-types.ts — Type definitions for compiled workflow specs
 *
 * A WorkflowSpec is the machine-readable form of a SKILL.md mermaid state diagram.
 * It is produced by the compiler and consumed by the SkillInstanceRuntime.
 */

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

export type InstanceStatus =
  | 'running' | 'waiting_user' | 'waiting_tool'
  | 'completed' | 'escalated' | 'aborted';

export interface AllowedActions {
  allowedTools: string[];
  requireConfirm: boolean;
  requireRef: string | null;
  canEscalate: boolean;
  promptHint: string;
}

export interface CompileResult {
  spec: WorkflowSpec | null;
  errors: string[];
  warnings: string[];
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd backend && bun build src/engine/skill-workflow-types.ts --no-bundle`

Expected: No TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/engine/skill-workflow-types.ts
git commit -m "feat: add WorkflowSpec type definitions"
```

---

### Task 6: Create workflow compiler

**Files:**
- Create: `backend/src/engine/skill-workflow-compiler.ts`
- Create: `tests/unittest/engine/skill-workflow-compiler.test.ts`

This is the largest task. The compiler converts annotated mermaid to WorkflowSpec JSON.

- [ ] **Step 1: Write compiler test with a simple linear diagram**

Create `tests/unittest/engine/skill-workflow-compiler.test.ts`:

```typescript
import { describe, test, expect } from 'bun:test';
import { compileWorkflow } from '../../../backend/src/engine/skill-workflow-compiler';

const SIMPLE_SKILL = `---
name: test-skill
description: test
metadata:
  version: "1.0.0"
---
# Test

\`\`\`mermaid
stateDiagram-v2
  [*] --> QueryUser %% step:query-user %% kind:tool %% tool:query_subscriber
  QueryUser --> CheckResult %% step:check-result %% kind:choice
  state CheckResult <<choice>>
  CheckResult --> ShowInfo : success %% guard:tool.success
  CheckResult --> Error : error %% guard:tool.error
  ShowInfo --> Confirm %% step:show-info %% kind:message
  Confirm --> Execute : yes %% step:confirm %% kind:confirm %% guard:user.confirm
  Confirm --> Cancel : no %% guard:user.cancel %% step:cancel %% kind:end
  Execute --> Done %% step:execute %% kind:tool %% tool:do_action
  Done --> [*] %% kind:end %% step:done
  Error --> [*] %% kind:human %% step:error
\`\`\`
`;

describe('compileWorkflow', () => {
  test('compiles a simple linear skill', () => {
    const result = compileWorkflow(SIMPLE_SKILL, 'test-skill', 1);
    expect(result.errors).toEqual([]);
    expect(result.spec).not.toBeNull();
    const spec = result.spec!;
    expect(spec.startStepId).toBe('query-user');
    expect(spec.terminalSteps).toContain('done');
    expect(spec.terminalSteps).toContain('cancel');
    expect(spec.terminalSteps).toContain('error');
    expect(spec.steps['query-user'].kind).toBe('tool');
    expect(spec.steps['query-user'].tool).toBe('query_subscriber');
    expect(spec.steps['confirm'].kind).toBe('confirm');
    expect(spec.steps['check-result'].kind).toBe('choice');
    expect(spec.steps['check-result'].transitions.length).toBe(2);
    expect(spec.steps['check-result'].transitions[0].guard).toBe('tool.success');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && bun test tests/unittest/engine/skill-workflow-compiler.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement compiler**

Create `backend/src/engine/skill-workflow-compiler.ts`. Key functions:

```typescript
import type { WorkflowSpec, WorkflowStep, WorkflowTransition, StepKind, GuardType, CompileResult } from './skill-workflow-types';

// Guard heuristic patterns for unannotated choice exits
const GUARD_PATTERNS: Array<[RegExp, GuardType]> = [
  [/成功|正常|有数据|查到|通过/, 'tool.success'],
  [/失败|异常|超时|错误|系统/, 'tool.error'],
  [/未查到|无数据|不存在|为空/, 'tool.no_data'],
  [/确认|同意|办理|是的|好的/, 'user.confirm'],
  [/取消|拒绝|不要|放弃|算了/, 'user.cancel'],
];

export function compileWorkflow(skillMd: string, skillId: string, version: number): CompileResult {
  // 1. Extract mermaid block
  // 2. Parse lines (reuse regex patterns from validate_statediagram)
  // 3. Flatten nested states
  // 4. Propagate transition annotations to target nodes
  // 5. Determine step id, kind, guard for each node/transition
  // 6. Build WorkflowSpec
  // 7. Validate (unique ids, choice exits, confirm exits, start/end)
  // 8. Return { spec, errors, warnings }
}
```

Implementation notes:
- Reuse the regex patterns from `validate_statediagram.ts` (`RE_TRANSITION`, `RE_CHOICE`, `RE_NESTED_OPEN`, and the annotation regexes)
- Do NOT import from `validate_statediagram.ts` directly (it lives in `skills/tech-skills/` — different layer). Copy the regex patterns or extract to a shared utility.
- For nested state flattening: when encountering `state X {`, track the parent name. Prefix all internal node names with `parent-name.`. When the `}` closes, revert to top level.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && bun test tests/unittest/engine/skill-workflow-compiler.test.ts`

Expected: PASS.

- [ ] **Step 5: Add test for nested states (service-cancel pattern)**

Add to the test file:

```typescript
test('compiles nested states with prefix flattening', () => {
  const nested = `---
name: nested-test
description: test
---
\`\`\`mermaid
stateDiagram-v2
  [*] --> 接收请求
  接收请求 --> 分类 %% kind:choice
  state 分类 <<choice>>
  分类 --> 标准退订入口 : standard
  state 标准退订流程 {
    标准退订入口 --> 查询业务 %% tool:query_subscriber
    查询业务 --> 查询结果 %% kind:choice
    state 查询结果 <<choice>>
    查询结果 --> 执行退订 : 成功
    查询结果 --> 失败 : 异常
    执行退订 --> 退订完成 %% tool:cancel_service
  }
  退订完成 --> [*]
  失败 --> [*]
\`\`\``;
  const result = compileWorkflow(nested, 'nested-test', 1);
  expect(result.errors).toEqual([]);
  // Nested nodes should be prefixed
  const stepIds = Object.keys(result.spec!.steps);
  expect(stepIds).toContain('标准退订流程.标准退订入口');
  expect(stepIds).toContain('标准退订流程.查询业务');
});
```

- [ ] **Step 6: Run tests, fix any issues**

Run: `cd backend && bun test tests/unittest/engine/skill-workflow-compiler.test.ts`

Expected: All pass.

- [ ] **Step 7: Add test for guard heuristic fallback**

```typescript
test('infers guard from Chinese labels when no %% guard annotation', () => {
  const skillMd = `---
name: heuristic-test
description: test
---
\`\`\`mermaid
stateDiagram-v2
  [*] --> Query %% step:query %% kind:tool %% tool:query_subscriber
  Query --> Check %% step:check %% kind:choice
  state Check <<choice>>
  Check --> OK : 成功
  Check --> Fail : 系统异常
  OK --> [*] %% step:ok %% kind:end
  Fail --> [*] %% step:fail %% kind:end
\`\`\``;
  const result = compileWorkflow(skillMd, 'heuristic-test', 1);
  expect(result.spec!.steps['check'].transitions[0].guard).toBe('tool.success');
  expect(result.spec!.steps['check'].transitions[1].guard).toBe('tool.error');
});
```

- [ ] **Step 8: Run all compiler tests**

Run: `cd backend && bun test tests/unittest/engine/skill-workflow-compiler.test.ts`

Expected: All pass.

- [ ] **Step 9: Commit**

```bash
git add backend/src/engine/skill-workflow-compiler.ts tests/unittest/engine/skill-workflow-compiler.test.ts
git commit -m "feat: add workflow compiler (mermaid -> WorkflowSpec JSON)"
```

---

### Task 7: Annotate service-cancel SKILL.md

**Files:**
- Modify: `backend/skills/biz-skills/service-cancel/SKILL.md:60-198`

- [ ] **Step 1: Add `%% step:` and `%% kind:` annotations to key nodes**

Add annotations to the mermaid state diagram. Example changes for the standard cancel flow:

```
标准退订入口 --> 查询已订业务: query_subscriber(phone) %% tool:query_subscriber %% ref:cancellation-policy.md#标准退订指引 %% step:std.query-subscriber %% kind:tool
```

Add `%% guard:` to choice exit transitions:

```
查询已订业务结果 --> 目标是否明确: 成功 %% guard:tool.success
查询已订业务结果 --> 提示查询稍后重试: 系统异常 %% guard:tool.error
```

Add `%% kind:confirm` to confirmation nodes and `%% kind:end` to terminal nodes.

Do this for all 3 nested flows (standard, unknown charge, accidental sub).

- [ ] **Step 2: Run compiler test against the annotated file**

Add to compiler test:

```typescript
import { readFileSync } from 'fs';

test('compiles real service-cancel SKILL.md', () => {
  const skillMd = readFileSync('skills/biz-skills/service-cancel/SKILL.md', 'utf-8');
  const result = compileWorkflow(skillMd, 'service-cancel', 1);
  // Warnings OK, but no errors
  expect(result.errors).toEqual([]);
  expect(result.spec).not.toBeNull();
  expect(result.spec!.startStepId).toBeTruthy();
  expect(Object.keys(result.spec!.steps).length).toBeGreaterThan(10);
});
```

- [ ] **Step 3: Run test, fix annotation issues until it passes**

Run: `cd backend && bun test tests/unittest/engine/skill-workflow-compiler.test.ts`

- [ ] **Step 4: Commit**

```bash
git add backend/skills/biz-skills/service-cancel/SKILL.md tests/unittest/engine/skill-workflow-compiler.test.ts
git commit -m "feat: annotate service-cancel SKILL.md for workflow compilation"
```

---

### Task 8: Update spec-writing.md and spec-checklist.md

**Files:**
- Modify: `backend/skills/tech-skills/skill-creator-spec/references/spec-writing.md`
- Modify: `backend/skills/tech-skills/skill-creator-spec/references/spec-checklist.md`

- [ ] **Step 1: Add annotation conventions section to spec-writing.md**

After the existing `%% tool:` / `%% ref:` / `%% branch:` documentation in the "客户引导状态图" section, add:

```markdown
### 运行时执行注释（推荐）

以下注释用于让状态图可被编译为运行时执行计划。新建技能时建议添加：

| 注释 | 语义 | 示例 |
|------|------|------|
| `%% step:<id>` | 节点稳定标识（kebab-case） | `%% step:query-subscriber` |
| `%% kind:<type>` | 节点类型 | `%% kind:tool` / `kind:confirm` / `kind:ref` / `kind:human` / `kind:message` / `kind:end` |
| `%% guard:<condition>` | 转移条件（结构化） | `%% guard:tool.success` / `guard:tool.error` / `guard:user.confirm` / `guard:user.cancel` / `guard:always` |
| `%% output:<key>` | 工具返回值引用键名 | `%% output:subscriber_info` |

规则：
- 注释写在转移行或状态行末尾，和 `%% tool:` 一样
- 转移行上的注释关联到**目标**节点（如 `A --> B %% tool:xxx` 表示 B 执行查询）
- `guard` 只写在转移行（`-->`）上
- `kind:confirm` 的节点必须有 `user.confirm` 和 `user.cancel` 两条出边
```

- [ ] **Step 2: Add checklist items to spec-checklist.md**

Add a new section:

```markdown
### 运行时可编译性（推荐）

- [ ] 关键节点有 `%% step:<id>` 稳定标识
- [ ] 工具节点有 `%% kind:tool`，确认节点有 `%% kind:confirm`
- [ ] choice 节点的出边有 `%% guard:` 注释
- [ ] 确认节点有 `user.confirm` + `user.cancel` 两条出边
- [ ] 工具节点后有 `tool.success` + `tool.error` 分支
```

- [ ] **Step 3: Commit**

```bash
git add backend/skills/tech-skills/skill-creator-spec/references/spec-writing.md backend/skills/tech-skills/skill-creator-spec/references/spec-checklist.md
git commit -m "docs: add workflow annotation conventions to spec-writing and checklist"
```

---

## Phase 2: Runtime

### Task 9: Create skill-instance-store

**Files:**
- Create: `backend/src/engine/skill-instance-store.ts`
- Create: `tests/unittest/engine/skill-instance-store.test.ts`

- [ ] **Step 1: Write store tests**

```typescript
import { describe, test, expect, beforeEach } from 'bun:test';

describe('SkillInstanceStore', () => {
  test('createInstance returns instance with running status', () => {
    // ...
  });
  test('findActiveInstance returns null when no active instance', () => {
    // ...
  });
  test('advanceStep updates current_step_id and increments revision', () => {
    // ...
  });
  test('advanceStep fails on revision mismatch (optimistic lock)', () => {
    // ...
  });
  test('appendEvent increments seq per instance', () => {
    // ...
  });
  test('finishInstance sets status and finished_at', () => {
    // ...
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && bun test tests/unittest/engine/skill-instance-store.test.ts`

- [ ] **Step 3: Implement store**

Create `backend/src/engine/skill-instance-store.ts` with functions:

```typescript
import { db } from '../db';
import { skillInstances, skillInstanceEvents, skillWorkflowSpecs } from '../db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export function createInstance(sessionId: string, skillId: string, skillVersion: number, startStepId: string) { ... }
export function findActiveInstance(sessionId: string) { ... }
export function advanceStep(instanceId: string, nextStepId: string, currentRevision: number): boolean { ... }
export function suspendForUser(instanceId: string, pendingKind: string) { ... }
export function finishInstance(instanceId: string, status: 'completed' | 'escalated' | 'aborted') { ... }
export function appendEvent(instanceId: string, event: { ... }) { ... }
export function getEvents(instanceId: string) { ... }
export function findPublishedSpec(skillId: string) { ... }
export function saveSpec(skillId: string, versionNo: number, specJson: string, checksum: string) { ... }
```

- [ ] **Step 4: Run tests, iterate until pass**

Run: `cd backend && bun test tests/unittest/engine/skill-instance-store.test.ts`

- [ ] **Step 5: Commit**

```bash
git add backend/src/engine/skill-instance-store.ts tests/unittest/engine/skill-instance-store.test.ts
git commit -m "feat: add skill instance store (CRUD for workflow instances)"
```

---

### Task 10: Create skill-instance-runtime

**Files:**
- Create: `backend/src/engine/skill-instance-runtime.ts`
- Create: `tests/unittest/engine/skill-instance-runtime.test.ts`

- [ ] **Step 1: Write runtime tests**

```typescript
import { describe, test, expect } from 'bun:test';

describe('SkillInstanceRuntime', () => {
  describe('computeAllowedActions', () => {
    test('tool step only allows its specific tool', () => { ... });
    test('confirm step requires confirmation, no tools', () => { ... });
    test('message step allows no tools', () => { ... });
    test('human step only allows transfer_to_human', () => { ... });
  });

  describe('evaluateGuard', () => {
    test('tool.success matches successful tool result', () => { ... });
    test('tool.error matches failed tool result', () => { ... });
    test('user.confirm matches confirm intent', () => { ... });
    test('user.cancel matches cancel intent', () => { ... });
    test('always matches anything', () => { ... });
  });

  describe('classifyUserIntent', () => {
    test('recognizes confirm keywords', () => { ... });
    test('recognizes cancel keywords', () => { ... });
    test('returns other for ambiguous input', () => { ... });
  });

  describe('evaluateAndAdvance', () => {
    test('advances through choice node automatically', () => { ... });
    test('stops at confirm node', () => { ... });
    test('finishes at end node', () => { ... });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && bun test tests/unittest/engine/skill-instance-runtime.test.ts`

- [ ] **Step 3: Implement runtime**

Create `backend/src/engine/skill-instance-runtime.ts`:

```typescript
import type { WorkflowSpec, WorkflowStep, AllowedActions, GuardType } from './skill-workflow-types';
import { findActiveInstance, advanceStep, suspendForUser, finishInstance, appendEvent, findPublishedSpec } from './skill-instance-store';
import { logger } from '../services/logger';

export function computeAllowedActions(spec: WorkflowSpec, currentStepId: string): AllowedActions { ... }

export function evaluateGuard(guard: GuardType, context: {
  toolResult?: { success: boolean; hasData: boolean };
  userIntent?: 'confirm' | 'cancel' | 'other';
}): boolean { ... }

export function classifyUserIntent(text: string): 'confirm' | 'cancel' | 'other' { ... }

export function evaluateAndAdvance(instanceId: string, spec: WorkflowSpec, currentStepId: string, revision: number, context: { ... }): { nextStepId: string; advanced: boolean } { ... }
```

- [ ] **Step 4: Run tests, iterate until pass**

Run: `cd backend && bun test tests/unittest/engine/skill-instance-runtime.test.ts`

- [ ] **Step 5: Commit**

```bash
git add backend/src/engine/skill-instance-runtime.ts tests/unittest/engine/skill-instance-runtime.test.ts
git commit -m "feat: add skill instance runtime (state machine, guard evaluation, intent classification)"
```

---

### Task 11: Modify runner.ts to accept workflowContext

**Files:**
- Modify: `backend/src/engine/runner.ts`

- [ ] **Step 1: Add workflowContext to RunAgentOptions**

In `runner.ts`, find `RunAgentOptions` interface and add:

```typescript
export interface RunAgentOptions {
  useMock?: boolean;
  skillContent?: string;
  skillName?: string;
  normalizedContext?: NormalizedQuery;
  /** Workflow runtime context — when present, limits tools and injects prompt hint */
  workflowContext?: {
    allowedTools: string[];
    promptHint: string;
    requireConfirm: boolean;
  };
  /** Override maxSteps (default 10). Workflow runtime uses 1. */
  maxStepsOverride?: number;
}
```

- [ ] **Step 2: Apply tool filtering when workflowContext is present**

Before the `generateText` call, add:

```typescript
// Workflow runtime tool filtering
let effectiveTools = { ...sopWrappedTools, ...skillsTools };
if (options?.workflowContext) {
  const allowed = new Set([
    ...options.workflowContext.allowedTools,
    'transfer_to_human',
    'get_skill_reference',
    'get_skill_instructions',
  ]);
  effectiveTools = Object.fromEntries(
    Object.entries(effectiveTools).filter(([name]) => allowed.has(name))
  );
}
```

- [ ] **Step 3: Append promptHint to system prompt**

```typescript
if (options?.workflowContext?.promptHint) {
  systemPrompt += '\n\n' + options.workflowContext.promptHint;
}
```

- [ ] **Step 4: Use maxStepsOverride**

Change `maxSteps: 10` to:

```typescript
maxSteps: options?.maxStepsOverride ?? 10,
```

- [ ] **Step 5: Skip SOPGuard when workflowContext present**

In the sopWrappedTools section, add early return:

```typescript
// Skip SOP check when workflow runtime is active
if (options?.workflowContext) {
  // Workflow runtime handles gating
  const result = await tool.execute(...args);
  sopGuard.recordToolCall(name);
  return result;
}
```

- [ ] **Step 6: Run existing tests to verify no regression**

Run: `cd backend && bun test tests/unittest/`

- [ ] **Step 7: Commit**

```bash
git add backend/src/engine/runner.ts
git commit -m "feat: runner accepts workflowContext for tool filtering and prompt injection"
```

---

### Task 12: Integrate runtime into chat-ws.ts

**Files:**
- Modify: `backend/src/chat/chat-ws.ts`

- [ ] **Step 1: Add runWorkflowTurn function**

At the top of `chat-ws.ts` (or in a separate file `backend/src/chat/workflow-integration.ts` if preferred), add the workflow turn orchestrator that wraps `runAgent`:

```typescript
import { findActiveInstance, createInstance, findPublishedSpec } from '../engine/skill-instance-store';
import { computeAllowedActions, evaluateGuard, classifyUserIntent, evaluateAndAdvance } from '../engine/skill-instance-runtime';
import type { WorkflowSpec } from '../engine/skill-workflow-types';

const WORKFLOW_ENABLED = new Set(
  (process.env.WORKFLOW_RUNTIME_SKILLS ?? '').split(',').filter(Boolean)
);

export async function runWorkflowTurn(sessionId, userMessage, history, ...otherParams) {
  // See spec section 4 "Runtime Loop Architecture" for full logic
}
```

- [ ] **Step 2: In the WS message handler, check for active instance before calling runAgent**

Insert before the existing `runAgent` call:

```typescript
// Check if workflow runtime should handle this turn
const activeInstance = findActiveInstance(sessionId);
if (activeInstance || WORKFLOW_ENABLED.size > 0) {
  // Try workflow path
  const result = await runWorkflowTurn(sessionId, userMessage, history, ...);
  if (result) {
    // Push WS with active_step_id
    // ... existing WS push logic, enhanced with instance state
    return;
  }
}
// Fall through to existing runAgent path
```

- [ ] **Step 3: Add active_step_id to skill_diagram_update WS event**

When pushing diagram updates, include instance state:

```typescript
if (activeInstance) {
  ws.send(JSON.stringify({
    type: 'skill_diagram_update',
    skill_name: activeInstance.skill_id,
    mermaid: ...,
    active_step_id: activeInstance.current_step_id,
    instance_status: activeInstance.status,
  }));
}
```

- [ ] **Step 4: Manual smoke test**

Start the full stack (`./start.sh`) and test with a service cancellation conversation. Verify:
- Instance created when skill matched
- State advances on tool calls
- Pauses at confirm nodes
- Diagram highlights correct node

- [ ] **Step 5: Commit**

```bash
git add backend/src/chat/chat-ws.ts
git commit -m "feat: integrate workflow runtime into WS chat"
```

---

### Task 13: Create skill-instances REST route

**Files:**
- Create: `backend/src/chat/skill-instances.ts`
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Create route file**

```typescript
import { Hono } from 'hono';
import { findActiveInstance, getEvents, finishInstance } from '../engine/skill-instance-store';
import { computeAllowedActions } from '../engine/skill-instance-runtime';
import { logger } from '../services/logger';

const router = new Hono();

router.get('/:sessionId/active', async (c) => {
  const instance = findActiveInstance(c.req.param('sessionId'));
  if (!instance) return c.json({ instance: null });
  return c.json({ instance });
});

router.get('/:id/events', async (c) => {
  const events = getEvents(c.req.param('id'));
  return c.json({ events });
});

router.post('/:id/abort', async (c) => {
  finishInstance(c.req.param('id'), 'aborted');
  logger.info('skill-instances', 'aborted', { id: c.req.param('id') });
  return c.json({ ok: true });
});

export default router;
```

- [ ] **Step 2: Mount in index.ts**

Add to `backend/src/index.ts`:

```typescript
import skillInstancesRouter from './chat/skill-instances';
app.route('/api/skill-instances', skillInstancesRouter);
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/chat/skill-instances.ts backend/src/index.ts
git commit -m "feat: add skill-instances REST API (active, events, abort)"
```

---

### Task 14: Hook compiler into skill save/publish

**Files:**
- Modify: `backend/src/agent/km/skills/skill-creator.ts` (save endpoint, ~line 1064)
- Modify: `backend/src/agent/km/skills/skill-versions.ts` (publish endpoint, ~line 92)

- [ ] **Step 1: Add compile-on-save (warning only)**

In `skill-creator.ts`, after `syncSkillMetadata()` call (line 1064), add:

```typescript
// Attempt workflow compilation (warnings only, don't block save)
try {
  const { compileWorkflow } = await import('../../engine/skill-workflow-compiler');
  const compileResult = compileWorkflow(body.skill_md, body.skill_name, /* version */ 1);
  if (compileResult.spec) {
    const { saveSpec } = await import('../../engine/skill-instance-store');
    const checksum = Bun.hash(compileResult.spec.toString()).toString(16);
    saveSpec(body.skill_name, 1, JSON.stringify(compileResult.spec), checksum);
  }
  if (compileResult.warnings.length > 0) {
    logger.info('skill-creator', 'compile_warnings', { skill: body.skill_name, warnings: compileResult.warnings });
  }
} catch (e) {
  logger.warn('skill-creator', 'compile_error', { skill: body.skill_name, error: String(e) });
}
```

- [ ] **Step 2: Add compile-on-publish (block on error)**

In `skill-versions.ts`, in the publish handler, before calling `publishVersion`, add compilation check:

```typescript
// Compile workflow spec — block publish if errors
const { compileWorkflow } = await import('../../engine/skill-workflow-compiler');
const skillMd = readSkillContent(body.skill, body.version_no);
if (skillMd) {
  const compileResult = compileWorkflow(skillMd, body.skill, body.version_no);
  if (compileResult.errors.length > 0) {
    return c.json({ error: 'Workflow 编译失败', details: compileResult.errors }, 400);
  }
  if (compileResult.spec) {
    const { saveSpec } = await import('../../engine/skill-instance-store');
    const checksum = Bun.hash(JSON.stringify(compileResult.spec)).toString(16);
    saveSpec(body.skill, body.version_no, JSON.stringify(compileResult.spec), checksum);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/agent/km/skills/skill-creator.ts backend/src/agent/km/skills/skill-versions.ts
git commit -m "feat: compile workflow spec on skill save/publish"
```

---

### Task 15: Integration test — full service-cancel flow

**Files:**
- Create: `tests/unittest/engine/skill-workflow-integration.test.ts`

- [ ] **Step 1: Write integration test**

```typescript
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { compileWorkflow } from '../../../backend/src/engine/skill-workflow-compiler';
import { computeAllowedActions, evaluateGuard, classifyUserIntent } from '../../../backend/src/engine/skill-instance-runtime';

describe('service-cancel workflow integration', () => {
  const skillMd = readFileSync('backend/skills/biz-skills/service-cancel/SKILL.md', 'utf-8');
  const result = compileWorkflow(skillMd, 'service-cancel', 1);
  const spec = result.spec!;

  test('compiles without errors', () => {
    expect(result.errors).toEqual([]);
    expect(spec).not.toBeNull();
  });

  test('starts at 接收请求', () => {
    expect(spec.startStepId).toBeTruthy();
  });

  test('standard cancel flow: query -> choice -> confirm -> execute -> done', () => {
    // Walk the happy path programmatically
    let stepId = spec.startStepId;
    // ... advance through steps verifying allowed actions at each point
  });

  test('confirm step blocks tool execution', () => {
    // Find a confirm step and verify allowedTools is empty
    const confirmSteps = Object.values(spec.steps).filter(s => s.kind === 'confirm');
    for (const step of confirmSteps) {
      const actions = computeAllowedActions(spec, step.id);
      expect(actions.allowedTools).toEqual([]);
      expect(actions.requireConfirm).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd backend && bun test tests/unittest/engine/skill-workflow-integration.test.ts`

- [ ] **Step 3: Fix any issues found**

- [ ] **Step 4: Run full test suite**

Run: `cd backend && bun test tests/unittest/`

Expected: All tests pass, no regressions.

- [ ] **Step 5: Commit**

```bash
git add tests/unittest/engine/skill-workflow-integration.test.ts
git commit -m "test: add service-cancel workflow integration test"
```

---

## Summary

| Phase | Tasks | Key Deliverable |
|-------|-------|----------------|
| Phase 0 | Task 1-2 | HTTP chat persistence + 3 new tables |
| Phase 1 | Task 3-8 | Types + compiler + annotated service-cancel + spec docs |
| Phase 2 | Task 9-15 | Store + runtime + runner integration + WS integration + REST API + integration tests |

Total: 15 tasks, ~50 commits.

After Phase 2, set `WORKFLOW_RUNTIME_SKILLS=service-cancel` in `.env` and test end-to-end.
