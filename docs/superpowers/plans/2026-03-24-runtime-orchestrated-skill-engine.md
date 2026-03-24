# Runtime Orchestrated Skill Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move flow-control authority from LLM to a runtime engine — the runtime decides which step to execute, what tool to call, and when to pause; the LLM only generates language for the current step.

**Architecture:** New `runSkillTurn()` function replaces `runAgent()` for runtime-managed skills. It loops through WorkflowSpec steps: tool steps call MCP directly via `tool-executor.ts`, message/ref steps use single-shot `generateText` (no tools) via `step-renderer.ts`, confirm steps pause and wait, choice steps evaluate guards via `branch-resolver.ts`. Session workflow state persists in a new `workflow_state` column on the `sessions` table. Skills without compiled specs fall back to existing `runAgent()`.

**Tech Stack:** Bun + Drizzle ORM (SQLite), Vercel AI SDK (`generateText`), TypeScript strict, Bun:test

**Spec:** User-provided 方案B description (this conversation). Design evolution from `docs/superpowers/specs/2026-03-24-execution-plan-driven-sop-design.md`.

**Reused from 方案二:** `skill-workflow-compiler.ts`, `skill-workflow-types.ts`, all 7 annotated SKILL.md files, `skill_workflow_specs` DB table.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `backend/src/engine/skill-runtime.ts` | **Create** | Core runtime loop: `runSkillTurn()` — step dispatcher, state advancement |
| `backend/src/engine/skill-step-renderer.ts` | **Create** | Handle `message`/`ref` steps: single-shot LLM for language generation only |
| `backend/src/engine/skill-tool-executor.ts` | **Create** | Handle `tool` steps: call MCP tool directly, extract result |
| `backend/src/engine/skill-branch-resolver.ts` | **Create** | Handle `choice` steps: evaluate guards against tool results |
| `backend/src/engine/skill-session-state.ts` | **Create** | Read/write workflow state on session (DB column) |
| `backend/src/engine/skill-router.ts` | **Create** | Determine if a message should be handled by runtime or legacy runAgent |
| `backend/src/engine/runner.ts` | **Modify** | Add runtime branch before `generateText`; export MCP tool access |
| `backend/src/chat/chat-ws.ts` | **Modify** | Route through skill-router before runAgent |
| `backend/src/chat/chat.ts` | **Modify** | Same routing for HTTP |
| `packages/shared-db/src/schema/platform.ts` | **Modify** | Add `workflow_state` column to `sessions` table |
| `backend/src/db/schema/platform.ts` | **Modify** | Re-export (auto) |
| `backend/src/engine/skill-workflow-types.ts` | **Modify** | Add `WorkflowSessionState` type |
| `tests/unittest/engine/skill-runtime.test.ts` | **Create** | Runtime loop tests |
| `tests/unittest/engine/skill-step-renderer.test.ts` | **Create** | Renderer tests |
| `tests/unittest/engine/skill-tool-executor.test.ts` | **Create** | Tool executor tests |
| `tests/unittest/engine/skill-branch-resolver.test.ts` | **Create** | Branch resolver tests |
| `tests/unittest/engine/skill-session-state.test.ts` | **Create** | Session state CRUD tests |
| `frontend/tests/e2e/13-runtime-sop-verification.spec.ts` | **Create** | UI-driven E2E for runtime mode |

---

## Phase 1: Foundation (types + session state + branch resolver)

### Task 1: Add WorkflowSessionState type and DB column

**Files:**
- Modify: `backend/src/engine/skill-workflow-types.ts`
- Modify: `packages/shared-db/src/schema/platform.ts`
- Modify: `backend/src/db/schema/platform.ts`

- [ ] **Step 1: Add WorkflowSessionState type**

In `skill-workflow-types.ts`, add after `CompileResult`:

```typescript
/** Lightweight workflow state stored per session (not full durable instance) */
export interface WorkflowSessionState {
  skillName: string;
  versionNo: number;
  currentStepId: string;
  pendingConfirm: boolean;
  lastToolName?: string;
  lastToolResult?: { success: boolean; hasData: boolean; payload?: unknown };
  branchContext?: Record<string, unknown>;
  startedAt: string;  // ISO timestamp
}
```

- [ ] **Step 2: Add workflow_state column to sessions table**

In `packages/shared-db/src/schema/platform.ts`, find the `sessions` table and add:

```typescript
workflow_state: text('workflow_state'),  // JSON-serialized WorkflowSessionState, null when no active workflow
```

- [ ] **Step 3: Push schema**

Run: `cd backend && bunx drizzle-kit push`

- [ ] **Step 4: Commit**

```bash
git add backend/src/engine/skill-workflow-types.ts packages/shared-db/src/schema/platform.ts backend/src/db/schema/platform.ts
git commit -m "feat: add WorkflowSessionState type and DB column"
```

---

### Task 2: Create skill-session-state.ts

**Files:**
- Create: `backend/src/engine/skill-session-state.ts`
- Create: `tests/unittest/engine/skill-session-state.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { describe, test, expect } from 'bun:test';

describe('SkillSessionState', () => {
  test('loadState returns null for session without workflow', () => { ... });
  test('saveState persists and loadState retrieves it', () => { ... });
  test('clearState removes workflow state', () => { ... });
  test('saveState overwrites previous state', () => { ... });
});
```

- [ ] **Step 2: Run tests, verify fail**

- [ ] **Step 3: Implement**

```typescript
import { db } from '../db';
import { sessions } from '../db/schema';
import { eq } from 'drizzle-orm';
import type { WorkflowSessionState } from './skill-workflow-types';

export function loadState(sessionId: string): WorkflowSessionState | null {
  const row = db.select({ workflow_state: sessions.workflow_state })
    .from(sessions).where(eq(sessions.id, sessionId)).get();
  if (!row?.workflow_state) return null;
  try { return JSON.parse(row.workflow_state); } catch { return null; }
}

export function saveState(sessionId: string, state: WorkflowSessionState): void {
  db.update(sessions).set({ workflow_state: JSON.stringify(state) })
    .where(eq(sessions.id, sessionId)).run();
}

export function clearState(sessionId: string): void {
  db.update(sessions).set({ workflow_state: null })
    .where(eq(sessions.id, sessionId)).run();
}
```

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Commit**

```bash
git add backend/src/engine/skill-session-state.ts tests/unittest/engine/skill-session-state.test.ts
git commit -m "feat: add skill session state (lightweight workflow persistence)"
```

---

### Task 3: Create skill-branch-resolver.ts

**Files:**
- Create: `backend/src/engine/skill-branch-resolver.ts`
- Create: `tests/unittest/engine/skill-branch-resolver.test.ts`

- [ ] **Step 1: Write tests**

```typescript
describe('BranchResolver', () => {
  test('resolves tool.success when result is successful', () => { ... });
  test('resolves tool.error when result failed', () => { ... });
  test('resolves tool.no_data when success but empty', () => { ... });
  test('resolves user.confirm from user message', () => { ... });
  test('resolves user.cancel from user message', () => { ... });
  test('returns null for unresolved (ambiguous user message)', () => { ... });
  test('resolves always unconditionally', () => { ... });
  test('single always transition auto-resolves', () => { ... });
});
```

- [ ] **Step 2: Run tests, verify fail**

- [ ] **Step 3: Implement**

```typescript
import type { WorkflowTransition, GuardType } from './skill-workflow-types';

interface ToolResult {
  success: boolean;
  hasData: boolean;
  payload?: unknown;
}

/**
 * Resolve which transition to take from a choice/tool node.
 * Returns the target step ID, or null if unresolved.
 */
export function resolveBranch(
  transitions: WorkflowTransition[],
  context: {
    toolResult?: ToolResult;
    userIntent?: 'confirm' | 'cancel' | 'other';
  },
): string | null {
  // Single 'always' → take it
  if (transitions.length === 1 && transitions[0].guard === 'always') {
    return transitions[0].target;
  }
  for (const t of transitions) {
    if (matchGuard(t.guard, context)) return t.target;
  }
  return null; // unresolved
}

export function classifyUserIntent(text: string): 'confirm' | 'cancel' | 'other' {
  if (/确认|同意|好的|可以|办理|没问题|是的|对|嗯|行/.test(text)) return 'confirm';
  if (/取消|不要|算了|放弃|不用|再说|不办/.test(text)) return 'cancel';
  return 'other';
}

function matchGuard(guard: GuardType, ctx: { toolResult?: ToolResult; userIntent?: string }): boolean {
  switch (guard) {
    case 'tool.success': return !!ctx.toolResult?.success && !!ctx.toolResult?.hasData;
    case 'tool.error': return ctx.toolResult?.success === false;
    case 'tool.no_data': return !!ctx.toolResult?.success && !ctx.toolResult?.hasData;
    case 'user.confirm': return ctx.userIntent === 'confirm';
    case 'user.cancel': return ctx.userIntent === 'cancel';
    case 'always': return true;
    default: return false;
  }
}
```

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Commit**

```bash
git add backend/src/engine/skill-branch-resolver.ts tests/unittest/engine/skill-branch-resolver.test.ts
git commit -m "feat: add branch resolver for choice/guard evaluation"
```

---

## Phase 2: Step Handlers (tool executor + step renderer)

### Task 4: Create skill-tool-executor.ts

**Files:**
- Create: `backend/src/engine/skill-tool-executor.ts`
- Create: `tests/unittest/engine/skill-tool-executor.test.ts`

This module calls a single MCP tool directly, without LLM involvement.

- [ ] **Step 1: Write tests**

```typescript
describe('ToolExecutor', () => {
  test('executeTool calls the named tool and returns structured result', () => { ... });
  test('executeTool returns error result when tool not found', () => { ... });
  test('executeTool parses MCP response format', () => { ... });
  test('buildToolArgs fills phone from session context', () => { ... });
});
```

- [ ] **Step 2: Run tests, verify fail**

- [ ] **Step 3: Implement**

```typescript
import { isErrorResult, isNoDataResult } from '../services/tool-result';
import { logger } from '../services/logger';

export interface ToolExecResult {
  success: boolean;
  hasData: boolean;
  rawText: string;
  parsed: unknown;
}

/**
 * Execute a single MCP tool by name.
 * @param toolName - The tool to call
 * @param args - Arguments (runtime fills phone, traceId, etc.)
 * @param mcpTools - The available MCP tools object from runner
 */
export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  mcpTools: Record<string, { execute: (...args: any[]) => Promise<any> }>,
): Promise<ToolExecResult> {
  const tool = mcpTools[toolName];
  if (!tool) {
    return { success: false, hasData: false, rawText: `Tool "${toolName}" not found`, parsed: null };
  }
  try {
    const result = await tool.execute(args);
    // Unwrap MCP format: { content: [{ type: 'text', text: '...' }] }
    let text = '';
    if (typeof result === 'string') text = result;
    else if (result?.content?.[0]?.text) text = result.content[0].text;
    else text = JSON.stringify(result);

    const success = !isErrorResult(text);
    const hasData = !isNoDataResult(text);
    let parsed: unknown = null;
    try { parsed = JSON.parse(text); } catch { parsed = text; }

    logger.info('skill-runtime', 'tool_executed', { tool: toolName, success, hasData });
    return { success, hasData, rawText: text, parsed };
  } catch (err) {
    logger.error('skill-runtime', 'tool_exec_error', { tool: toolName, error: String(err) });
    return { success: false, hasData: false, rawText: String(err), parsed: null };
  }
}

/**
 * Build tool arguments from session context.
 * Auto-fills phone, traceId, sessionId. Leaves tool-specific args for LLM or runtime to fill.
 */
export function buildToolArgs(
  toolName: string,
  sessionContext: { phone: string; sessionId: string },
  existingArgs?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    phone: sessionContext.phone,
    traceId: crypto.randomUUID(),
    sessionId: sessionContext.sessionId,
    ...existingArgs,
  };
}
```

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Commit**

```bash
git add backend/src/engine/skill-tool-executor.ts tests/unittest/engine/skill-tool-executor.test.ts
git commit -m "feat: add tool executor (direct MCP call without LLM)"
```

---

### Task 5: Create skill-step-renderer.ts

**Files:**
- Create: `backend/src/engine/skill-step-renderer.ts`
- Create: `tests/unittest/engine/skill-step-renderer.test.ts`

This module handles `message` and `ref` steps — it calls `generateText` with **no tools**, only asking the LLM to generate language for the current step.

- [ ] **Step 1: Write tests**

```typescript
describe('StepRenderer', () => {
  test('renderStep returns non-empty text', () => { ... });
  test('renderStep includes step label in prompt', () => { ... });
  test('renderStep for ref step includes reference content', () => { ... });
});
```

Note: These tests need to mock `generateText` since they call LLM. Use a simple mock:

```typescript
// Mock the LLM call for testing
import { mock } from 'bun:test';
```

- [ ] **Step 2: Run tests, verify fail**

- [ ] **Step 3: Implement**

```typescript
import { generateText } from 'ai';
import { chatModel } from './llm';
import { getSkillContent } from './skills';
import type { WorkflowStep, WorkflowSessionState } from './skill-workflow-types';
import { logger } from '../services/logger';

/**
 * Render a message/ref step — LLM generates language for THIS step only.
 * No tools are provided. LLM cannot call tools.
 */
export async function renderStep(
  step: WorkflowStep,
  context: {
    userMessage: string;
    history: Array<{ role: string; content: string }>;
    skillName: string;
    sessionState: WorkflowSessionState;
    phone: string;
    subscriberName?: string;
    lang: 'zh' | 'en';
    toolFacts?: string;  // Summary of previous tool results
    refContent?: string; // Reference doc content (for ref steps)
  },
): Promise<string> {
  const systemPrompt = buildStepPrompt(step, context);

  const result = await generateText({
    model: chatModel,
    system: systemPrompt,
    messages: [
      ...context.history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user' as const, content: context.userMessage },
    ],
    // NO tools — LLM can only generate text
  });

  logger.info('skill-runtime', 'step_rendered', {
    step: step.id, kind: step.kind, textLen: result.text.length,
  });

  return result.text;
}

function buildStepPrompt(step: WorkflowStep, context: {
  skillName: string;
  phone: string;
  subscriberName?: string;
  lang: 'zh' | 'en';
  toolFacts?: string;
  refContent?: string;
  sessionState: WorkflowSessionState;
}): string {
  const lines: string[] = [
    `你是电信客服"小通"。当前正在执行技能 [${context.skillName}] 的 SOP 流程。`,
    `用户手机号：${context.phone}${context.subscriberName ? `，姓名：${context.subscriberName}` : ''}`,
    '',
    `## 当前步骤`,
    `你正在执行步骤 [${step.label}]（类型：${step.kind}）。`,
    `请只完成这一步的任务，不要尝试执行其他步骤。`,
  ];

  if (step.kind === 'message') {
    lines.push('', '你的任务是：根据当前步骤的要求，生成合适的回复给用户。');
    lines.push('不要调用任何工具，不要尝试执行操作，只生成文字回复。');
  }

  if (step.kind === 'ref' && context.refContent) {
    lines.push('', '## 参考文档', context.refContent);
    lines.push('', '请基于以上参考文档内容，向用户解释相关信息。');
  }

  if (step.kind === 'confirm') {
    lines.push('', '你的任务是：向用户说明操作影响，并询问是否确认执行。');
    lines.push('用户确认后系统会自动执行操作，你不需要调用工具。');
  }

  if (context.toolFacts) {
    lines.push('', '## 已获取的数据', context.toolFacts);
  }

  return lines.join('\n');
}
```

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Commit**

```bash
git add backend/src/engine/skill-step-renderer.ts tests/unittest/engine/skill-step-renderer.test.ts
git commit -m "feat: add step renderer (LLM text-only for message/ref/confirm steps)"
```

---

## Phase 3: Core Runtime Loop

### Task 6: Create skill-runtime.ts

**Files:**
- Create: `backend/src/engine/skill-runtime.ts`
- Create: `tests/unittest/engine/skill-runtime.test.ts`

This is the core module — the orchestration loop that replaces `generateText(maxSteps:10)`.

- [ ] **Step 1: Write tests**

```typescript
describe('SkillRuntime', () => {
  describe('runSkillTurn', () => {
    test('tool step: calls tool and advances state', () => { ... });
    test('message step: renders text and advances', () => { ... });
    test('confirm step: pauses and returns confirm prompt', () => { ... });
    test('confirm step with user confirm: advances past confirm', () => { ... });
    test('confirm step with user cancel: takes cancel branch', () => { ... });
    test('choice step: evaluates guard and advances', () => { ... });
    test('end step: clears session state', () => { ... });
    test('human step: returns transfer response', () => { ... });
    test('consecutive tool steps: executes all in one turn', () => { ... });
    test('tool -> choice -> message: chain executes in one turn', () => { ... });
  });
});
```

- [ ] **Step 2: Run tests, verify fail**

- [ ] **Step 3: Implement core runtime**

```typescript
import type { WorkflowSpec, WorkflowStep, WorkflowSessionState } from './skill-workflow-types';
import { executeTool, buildToolArgs } from './skill-tool-executor';
import { renderStep } from './skill-step-renderer';
import { resolveBranch, classifyUserIntent } from './skill-branch-resolver';
import { loadState, saveState, clearState } from './skill-session-state';
import { getSkillContent } from './skills';
import { logger } from '../services/logger';

export interface SkillTurnResult {
  text: string;
  currentStepId: string | null;
  pendingConfirm: boolean;
  finished: boolean;
  toolRecords: Array<{ tool: string; args: Record<string, unknown>; result: string; success: boolean }>;
  transferRequested: boolean;
}

export async function runSkillTurn(
  sessionId: string,
  userMessage: string,
  spec: WorkflowSpec,
  mcpTools: Record<string, any>,
  context: {
    phone: string;
    subscriberName?: string;
    lang: 'zh' | 'en';
    history: Array<{ role: string; content: string }>;
  },
): Promise<SkillTurnResult> {
  // Load or initialize session state
  let state = loadState(sessionId);
  if (!state) {
    state = {
      skillName: spec.skillId,
      versionNo: spec.version,
      currentStepId: spec.startStepId,
      pendingConfirm: false,
      startedAt: new Date().toISOString(),
    };
    // Auto-advance past initial non-actionable nodes
    state.currentStepId = advanceToActionable(spec, state.currentStepId, null);
  }

  const toolRecords: SkillTurnResult['toolRecords'] = [];
  let replyParts: string[] = [];
  let finished = false;
  let transferRequested = false;
  let safety = 15; // prevent infinite loops

  // Handle pending confirm from previous turn
  if (state.pendingConfirm) {
    const intent = classifyUserIntent(userMessage);
    const step = spec.steps[state.currentStepId];
    if (step && intent !== 'other') {
      const target = resolveBranch(step.transitions, { userIntent: intent });
      if (target) {
        state.currentStepId = target;
        state.pendingConfirm = false;
        state.currentStepId = advanceToActionable(spec, state.currentStepId, state.lastToolResult ?? null);
      }
    }
    if (state.pendingConfirm && classifyUserIntent(userMessage) === 'other') {
      // Ambiguous — let LLM clarify
      const step = spec.steps[state.currentStepId];
      if (step) {
        const text = await renderStep(step, {
          userMessage, history: context.history, skillName: spec.skillId,
          sessionState: state, phone: context.phone,
          subscriberName: context.subscriberName, lang: context.lang,
        });
        replyParts.push(text);
      }
      saveState(sessionId, state);
      return { text: replyParts.join('\n\n'), currentStepId: state.currentStepId, pendingConfirm: true, finished: false, toolRecords, transferRequested };
    }
  }

  // Main loop: advance through steps until we need to pause
  while (safety-- > 0) {
    const step = spec.steps[state.currentStepId];
    if (!step) { finished = true; break; }

    switch (step.kind) {
      case 'tool': {
        // Runtime calls the tool directly — LLM does NOT choose tools
        const args = buildToolArgs(step.tool!, { phone: context.phone, sessionId });
        const result = await executeTool(step.tool!, args, mcpTools);
        state.lastToolName = step.tool;
        state.lastToolResult = { success: result.success, hasData: result.hasData, payload: result.parsed };
        toolRecords.push({ tool: step.tool!, args, result: result.rawText.slice(0, 200), success: result.success });

        // Resolve branch (tool step transitions are guard-based)
        const target = resolveBranch(step.transitions, { toolResult: result });
        if (target) {
          state.currentStepId = target;
          state.currentStepId = advanceToActionable(spec, state.currentStepId, state.lastToolResult);
        } else {
          // Unresolved — stay here, log warning
          logger.warn('skill-runtime', 'tool_branch_unresolved', { step: step.id, tool: step.tool });
          break;
        }
        continue; // don't pause, keep looping
      }

      case 'message':
      case 'ref': {
        // LLM generates text for this step only (no tools)
        const refContent = step.ref ? loadReference(spec.skillId, step.ref) : undefined;
        const toolFacts = state.lastToolResult ? summarizeToolResult(state.lastToolName, state.lastToolResult) : undefined;
        const text = await renderStep(step, {
          userMessage, history: context.history, skillName: spec.skillId,
          sessionState: state, phone: context.phone,
          subscriberName: context.subscriberName, lang: context.lang,
          toolFacts, refContent,
        });
        replyParts.push(text);

        // Advance to next step
        const target = resolveBranch(step.transitions, {});
        if (target) {
          state.currentStepId = target;
          state.currentStepId = advanceToActionable(spec, state.currentStepId, state.lastToolResult ?? null);
        }

        // If next step needs user input (confirm) or is another message, pause
        const nextStep = spec.steps[state.currentStepId];
        if (!nextStep || nextStep.kind === 'confirm' || nextStep.kind === 'message' || nextStep.kind === 'ref') {
          break; // pause — return reply to user
        }
        continue; // next step is tool/choice — keep looping
      }

      case 'confirm': {
        // Render the confirmation prompt, then pause
        const toolFacts = state.lastToolResult ? summarizeToolResult(state.lastToolName, state.lastToolResult) : undefined;
        const text = await renderStep(step, {
          userMessage, history: context.history, skillName: spec.skillId,
          sessionState: state, phone: context.phone,
          subscriberName: context.subscriberName, lang: context.lang,
          toolFacts,
        });
        replyParts.push(text);
        state.pendingConfirm = true;
        break; // pause — wait for user confirm/cancel
      }

      case 'end': {
        finished = true;
        break;
      }

      case 'human': {
        transferRequested = true;
        finished = true;
        break;
      }

      case 'choice': {
        // Should have been resolved by advanceToActionable, but handle edge case
        const target = resolveBranch(step.transitions, {
          toolResult: state.lastToolResult ?? undefined,
        });
        if (target) {
          state.currentStepId = target;
          continue;
        }
        // Unresolved choice — stop
        logger.warn('skill-runtime', 'choice_unresolved_in_loop', { step: step.id });
        break;
      }

      default:
        break;
    }
    break; // if we didn't continue, we're pausing
  }

  // Persist or clear state
  if (finished) {
    clearState(sessionId);
  } else {
    saveState(sessionId, state);
  }

  return {
    text: replyParts.join('\n\n'),
    currentStepId: finished ? null : state.currentStepId,
    pendingConfirm: state.pendingConfirm,
    finished,
    toolRecords,
    transferRequested,
  };
}

/**
 * Advance past non-actionable nodes (choice with resolved guards, message with single always).
 * Returns the first actionable step ID.
 */
function advanceToActionable(
  spec: WorkflowSpec,
  stepId: string,
  lastToolResult: { success: boolean; hasData: boolean } | null,
): string {
  let current = stepId;
  let safety = 20;
  while (safety-- > 0) {
    const step = spec.steps[current];
    if (!step) break;
    if (step.kind === 'choice') {
      const target = resolveBranch(step.transitions, { toolResult: lastToolResult ?? undefined });
      if (target) { current = target; continue; }
      break; // unresolved choice — stop here
    }
    // message/ref with single always → auto-advance
    if ((step.kind === 'message' || step.kind === 'ref') &&
        step.transitions.length === 1 && step.transitions[0].guard === 'always') {
      current = step.transitions[0].target;
      continue;
    }
    break; // actionable step — stop
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

function summarizeToolResult(toolName: string | undefined, result: { success: boolean; hasData: boolean; payload?: unknown }): string {
  if (!toolName) return '';
  const status = result.success ? (result.hasData ? 'success with data' : 'success but no data') : 'failed';
  const payloadStr = result.payload ? JSON.stringify(result.payload).slice(0, 500) : 'none';
  return `工具 ${toolName} 结果（${status}）：\n${payloadStr}`;
}
```

- [ ] **Step 4: Run tests, iterate until pass**

- [ ] **Step 5: Commit**

```bash
git add backend/src/engine/skill-runtime.ts tests/unittest/engine/skill-runtime.test.ts
git commit -m "feat: add skill runtime (step-by-step orchestration loop)"
```

---

## Phase 4: Router + Chat Integration

### Task 7: Create skill-router.ts

**Files:**
- Create: `backend/src/engine/skill-router.ts`

- [ ] **Step 1: Implement router**

```typescript
import { loadState } from './skill-session-state';
import { findPublishedSpec } from './runner'; // or inline the DB query
import type { WorkflowSpec } from './skill-workflow-types';

export interface RouteResult {
  mode: 'runtime' | 'legacy';
  spec?: WorkflowSpec;
  resuming: boolean; // true if continuing an active workflow
}

const RUNTIME_ENABLED = new Set(
  (process.env.RUNTIME_ORCHESTRATED_SKILLS ?? '').split(',').filter(Boolean)
);

/**
 * Determine whether a session/message should be handled by the runtime engine
 * or fall back to legacy runAgent.
 */
export function routeSkill(sessionId: string): RouteResult {
  // Check if session has an active workflow
  const state = loadState(sessionId);
  if (state) {
    // Resuming an active workflow — always use runtime
    const spec = findPublishedSpecByName(state.skillName);
    if (spec) return { mode: 'runtime', spec, resuming: true };
    // Spec not found (deleted?) — fall back
    return { mode: 'legacy', resuming: false };
  }

  // No active workflow — will be determined after skill is identified
  // (Router can't know which skill until LLM processes the message)
  return { mode: 'legacy', resuming: false };
}

/**
 * After skill is identified (via get_skill_instructions or intent detection),
 * check if it should be runtime-managed.
 */
export function shouldUseRuntime(skillName: string): { use: boolean; spec?: WorkflowSpec } {
  // Check env var allowlist (empty = all skills with specs)
  if (RUNTIME_ENABLED.size > 0 && !RUNTIME_ENABLED.has(skillName)) {
    return { use: false };
  }
  const spec = findPublishedSpecByName(skillName);
  if (!spec) return { use: false };
  return { use: true, spec };
}

function findPublishedSpecByName(skillName: string): WorkflowSpec | undefined {
  try {
    const { db } = require('../db');
    const { skillWorkflowSpecs } = require('../db/schema');
    const { eq, and } = require('drizzle-orm');
    const row = db.select().from(skillWorkflowSpecs)
      .where(and(eq(skillWorkflowSpecs.skill_id, skillName), eq(skillWorkflowSpecs.status, 'published')))
      .get();
    if (!row) return undefined;
    return JSON.parse(row.spec_json);
  } catch { return undefined; }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/engine/skill-router.ts
git commit -m "feat: add skill router (runtime vs legacy decision)"
```

---

### Task 8: Integrate runtime into chat-ws.ts

**Files:**
- Modify: `backend/src/chat/chat-ws.ts`

This is the critical integration point. Add a check before the existing `runAgent` call.

- [ ] **Step 1: Add runtime import and routing**

Before the existing `runAgent` call (around line 216), add:

```typescript
import { routeSkill, shouldUseRuntime } from '../engine/skill-router';
import { runSkillTurn } from '../engine/skill-runtime';

// In the message handler, before the existing runAgent call:
const route = routeSkill(sessionId);
if (route.mode === 'runtime' && route.spec) {
  // Runtime-managed skill — use step-by-step execution
  const turnResult = await runSkillTurn(sessionId, message, route.spec, await getMcpToolsForRuntime(), {
    phone: userPhone, subscriberName: cachedSubscriberName, lang: agentLang as 'zh' | 'en',
    history: history.map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) })),
  });

  // Persist messages
  const msgRows = [{ sessionId, role: 'user', content: message }];
  msgRows.push({ sessionId, role: 'assistant', content: turnResult.text });
  await db.insert(messages).values(msgRows);

  // Push response
  ws.send(JSON.stringify({
    source: 'user', type: 'bot_reply',
    text: turnResult.text,
    current_step_id: turnResult.currentStepId,
    pending_confirm: turnResult.pendingConfirm,
    msg_id,
  }));

  // Push diagram with active step
  if (route.spec.skillId) {
    const rawMermaid = getSkillMermaid(route.spec.skillId);
    if (rawMermaid) {
      ws.send(JSON.stringify({
        source: 'user', type: 'skill_diagram_update',
        skill_name: route.spec.skillId,
        mermaid: stripMermaidMarkers(rawMermaid),
        active_step_id: turnResult.currentStepId,
      }));
    }
  }

  if (turnResult.transferRequested) {
    // Handle transfer same as existing logic
    botEnabled = false;
  }

  return; // Don't fall through to legacy runAgent
}

// Existing runAgent call follows...
```

- [ ] **Step 2: Export MCP tools accessor from runner.ts**

In `runner.ts`, export a function to get the MCP tools object (so runtime can call tools directly):

```typescript
export async function getMcpToolsForRuntime(): Promise<Record<string, any>> {
  const { tools } = await getMCPTools();
  return tools as Record<string, any>;
}
```

- [ ] **Step 3: Handle skill activation for new workflows**

After the existing `runAgent` call returns, check if a skill was loaded and should switch to runtime mode for next turn:

```typescript
// After runAgent returns result:
if (result.skill_diagram?.skill_name) {
  const rt = shouldUseRuntime(result.skill_diagram.skill_name);
  if (rt.use && rt.spec) {
    // Initialize workflow state for next turn
    const { saveState } = await import('../engine/skill-session-state');
    saveState(sessionId, {
      skillName: result.skill_diagram.skill_name,
      versionNo: rt.spec.version,
      currentStepId: rt.spec.startStepId,
      pendingConfirm: false,
      startedAt: new Date().toISOString(),
    });
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/chat/chat-ws.ts backend/src/engine/runner.ts
git commit -m "feat: integrate runtime engine into WS chat"
```

---

### Task 9: Integrate runtime into chat.ts (HTTP)

**Files:**
- Modify: `backend/src/chat/chat.ts`

- [ ] **Step 1: Add same routing logic as WS**

Same pattern as Task 8 but for HTTP endpoint. Add before the existing `runAgent` call.

- [ ] **Step 2: Commit**

```bash
git add backend/src/chat/chat.ts
git commit -m "feat: integrate runtime engine into HTTP chat"
```

---

## Phase 5: Grayscale + E2E Verification

### Task 10: E2E tests for runtime mode

**Files:**
- Create: `frontend/tests/e2e/13-runtime-sop-verification.spec.ts`

- [ ] **Step 1: Write multi-step flow tests**

Same structure as `12-sop-ui-verification.spec.ts` but with `RUNTIME_ORCHESTRATED_SKILLS=service-cancel` env var set. Key differences to verify:

- Tool calls happen without LLM choosing them (faster)
- Confirm step pauses reliably
- Multi-turn state persists via DB (not history replay)
- Diagram shows `active_step_id`

Tests:
```typescript
test('RUNTIME-01: standard cancel flow (4 steps)', async ({ page }) => { ... });
test('RUNTIME-02: user cancel branch', async ({ page }) => { ... });
test('RUNTIME-03: unknown charge flow (3 steps)', async ({ page }) => { ... });
test('RUNTIME-04: transfer to human mid-flow', async ({ page }) => { ... });
```

- [ ] **Step 2: Run tests**

```bash
RUNTIME_ORCHESTRATED_SKILLS=service-cancel npx playwright test 13-runtime-sop-verification.spec.ts --headed
```

- [ ] **Step 3: Commit**

```bash
git add frontend/tests/e2e/13-runtime-sop-verification.spec.ts
git commit -m "test: add E2E tests for runtime orchestrated skill engine"
```

---

### Task 11: Documentation update

**Files:**
- Modify: `.specify/specs/000-baseline/quickstart.md`

- [ ] **Step 1: Add runtime mode documentation**

Add to the test commands section:

```markdown
# Runtime Orchestrated SOP 验证（指定 skill 使用 runtime 编排）
RUNTIME_ORCHESTRATED_SKILLS=service-cancel ./start.sh
cd frontend/tests/e2e && npx playwright test 13-runtime-sop-verification.spec.ts --headed

# 全部 skill 启用 runtime（不设 RUNTIME_ORCHESTRATED_SKILLS 则自动对所有有 spec 的 skill 启用）
```

- [ ] **Step 2: Commit**

```bash
git add .specify/specs/000-baseline/quickstart.md
git commit -m "docs: add runtime orchestrated skill engine to quickstart"
```

---

## Summary

| Phase | Tasks | Key Deliverable |
|-------|-------|----------------|
| Phase 1 | Task 1-3 | Session state + branch resolver + types |
| Phase 2 | Task 4-5 | Tool executor + step renderer |
| Phase 3 | Task 6 | **Core runtime loop** (`runSkillTurn`) |
| Phase 4 | Task 7-9 | Router + WS/HTTP integration |
| Phase 5 | Task 10-11 | E2E tests + docs |

Total: 11 tasks.

**Key architectural decisions:**
1. Runtime calls MCP tools directly — LLM never sees tool definitions in runtime mode
2. LLM only used for `message/ref/confirm` steps — single-shot `generateText` with no tools
3. Session state stored as JSON column on `sessions` table — no new tables
4. Grayscale via `RUNTIME_ORCHESTRATED_SKILLS` env var — empty means "all skills with specs"
5. First turn still uses legacy `runAgent` for skill detection — runtime takes over from second turn onward
6. SOPGuard V2 remains as fallback for skills not in runtime mode
