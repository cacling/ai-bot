# Workflow Engine Node System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the current SOP-specific workflow engine to a general-purpose node-based engine with stable type primitives, explicit ports, edge modeling, and an executor registry — enabling future expansion to AI nodes, control flow, and automation.

**Architecture:** Define 20 node type primitives with typed configs, explicit input/output ports, and structured edges. Refactor the current `skill-runtime.ts` step-dispatch into a NodeExecutor registry pattern. Phase 1 maps existing 7 step kinds to the new type system without adding new capabilities. Phase 2 adds control flow (if/switch). Phase 3 adds AI nodes (classifier/extractor).

**Tech Stack:** Bun + TypeScript strict, Bun:test

**Spec:** User-provided node type enumeration design (this conversation)

**Strategy:** Type definitions first (zero runtime risk), then executor registry refactor, then incremental node type expansion.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| **Phase 1: Type Foundation** | | |
| `backend/src/workflow/types/node-types.ts` | Create | NodeType enum, PortKind enum |
| `backend/src/workflow/types/node-configs.ts` | Create | All 20 node config interfaces |
| `backend/src/workflow/types/workflow-definition.ts` | Create | WorkflowDefinition, WorkflowNode, WorkflowEdge, NodePort |
| `backend/src/workflow/types/execution.ts` | Create | WorkflowExecutionContext, NodeExecutionResult, NodeExecutor |
| `backend/src/workflow/types/index.ts` | Create | Barrel export |
| **Phase 2: Executor Registry** | | |
| `backend/src/workflow/executors/registry.ts` | Create | NodeExecutor registry (register/resolve) |
| `backend/src/workflow/executors/tool-executor.ts` | Create | Tool node executor (wraps existing skill-tool-executor) |
| `backend/src/workflow/executors/llm-executor.ts` | Create | LLM node executor (wraps existing skill-step-renderer) |
| `backend/src/workflow/executors/human-executor.ts` | Create | Human node executor |
| `backend/src/workflow/executors/guard-executor.ts` | Create | Guard node executor |
| `backend/src/workflow/executors/if-executor.ts` | Create | If/Switch condition evaluator |
| `backend/src/workflow/executors/start-end-executor.ts` | Create | Start/End lifecycle handlers |
| **Phase 3: Runtime Adapter** | | |
| `backend/src/workflow/runtime.ts` | Create | New runtime loop using executor registry |
| `backend/src/workflow/adapter.ts` | Create | WorkflowSpec → WorkflowDefinition adapter (backward compat) |
| **Tests** | | |
| `tests/unittest/workflow/types.test.ts` | Create | Type validation tests |
| `tests/unittest/workflow/registry.test.ts` | Create | Executor registry tests |
| `tests/unittest/workflow/runtime.test.ts` | Create | Runtime loop tests |
| `tests/unittest/workflow/adapter.test.ts` | Create | Adapter tests |

---

## Phase 1: Type Foundation (zero runtime risk)

### Task 1: Node type enum + port kinds

**Files:**
- Create: `backend/src/workflow/types/node-types.ts`

- [ ] **Step 1: Create the enum files**

```typescript
// backend/src/workflow/types/node-types.ts

export enum NodeType {
  Start = "start",
  End = "end",

  // AI / reasoning
  LLM = "llm",
  Classifier = "classifier",
  Extractor = "extractor",
  Retriever = "retriever",

  // data / state
  Transform = "transform",
  Code = "code",
  State = "state",
  Merge = "merge",

  // control flow
  If = "if",
  Switch = "switch",
  ForEach = "foreach",
  Loop = "loop",
  Subflow = "subflow",

  // external actions
  Tool = "tool",
  Http = "http",
  Db = "db",

  // governance
  Human = "human",
  Guard = "guard",
}

export enum PortKind {
  In = "in",
  Out = "out",
  True = "true",
  False = "false",
  Default = "default",
  Error = "error",
  Timeout = "timeout",
  Approved = "approved",
  Rejected = "rejected",
  Item = "item",
  Done = "done",
  Next = "next",
  LoopBody = "loop_body",
  LoopExit = "loop_exit",
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/workflow/types/node-types.ts
git commit -m "feat: add NodeType and PortKind enums (20 node primitives)"
```

---

### Task 2: Node config interfaces

**Files:**
- Create: `backend/src/workflow/types/node-configs.ts`

- [ ] **Step 1: Create all 20 config interfaces**

Define `StartNodeConfig`, `EndNodeConfig`, `LlmNodeConfig`, `ClassifierNodeConfig`, `ExtractorNodeConfig`, `RetrieverNodeConfig`, `TransformNodeConfig`, `CodeNodeConfig`, `StateNodeConfig`, `MergeNodeConfig`, `IfNodeConfig`, `SwitchNodeConfig`, `ForEachNodeConfig`, `LoopNodeConfig`, `SubflowNodeConfig`, `ToolNodeConfig`, `HttpNodeConfig`, `DbNodeConfig`, `HumanNodeConfig`, `GuardNodeConfig`.

Also define shared types: `RetryPolicy`, `ErrorPolicy`, `JsonSchema` (alias for `Record<string, unknown>`).

Full content as specified in the user's design document sections 8.1-8.14.

- [ ] **Step 2: Commit**

```bash
git add backend/src/workflow/types/node-configs.ts
git commit -m "feat: add node config interfaces for all 20 node types"
```

---

### Task 3: WorkflowDefinition + WorkflowNode + WorkflowEdge

**Files:**
- Create: `backend/src/workflow/types/workflow-definition.ts`

- [ ] **Step 1: Create the graph structure types**

```typescript
import { NodeType, PortKind } from './node-types';
import type { /* all config types */ } from './node-configs';

export interface NodePort {
  id: string;
  label?: string;
  kind?: PortKind;
  multiple?: boolean;
}

export interface BaseNode<TType extends NodeType = NodeType, TConfig = unknown> {
  id: string;
  type: TType;
  name?: string;
  description?: string;
  x?: number;
  y?: number;
  inputs?: NodePort[];
  outputs?: NodePort[];
  config: TConfig;
  retry?: RetryPolicy;
  timeoutMs?: number;
  onError?: ErrorPolicy;
  metadata?: Record<string, unknown>;
}

// Discriminated union of all node types
export type WorkflowNode = BaseNode<NodeType.Start, StartNodeConfig> | ... ;

export interface WorkflowEdge {
  id: string;
  sourceNodeId: string;
  sourcePortId?: string;
  targetNodeId: string;
  targetPortId?: string;
  label?: string;
  condition?: string;
  metadata?: Record<string, unknown>;
}

export interface WorkflowVariable {
  key: string;
  type: "string" | "number" | "boolean" | "object" | "array" | "any";
  defaultValue?: unknown;
  description?: string;
}

export interface ConnectorRef {
  id: string;
  type: "http" | "db" | "tool_service" | "mcp" | "custom";
  name?: string;
  config: Record<string, unknown>;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  version: string;
  description?: string;
  mermaid?: string;
  metadata?: Record<string, unknown>;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  variables?: WorkflowVariable[];
  connectors?: ConnectorRef[];
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/workflow/types/workflow-definition.ts
git commit -m "feat: add WorkflowDefinition, WorkflowNode, WorkflowEdge types"
```

---

### Task 4: Execution types + barrel export

**Files:**
- Create: `backend/src/workflow/types/execution.ts`
- Create: `backend/src/workflow/types/index.ts`

- [ ] **Step 1: Create execution interfaces**

```typescript
// execution.ts
export interface WorkflowExecutionContext {
  workflowId: string;
  executionId: string;
  input: Record<string, unknown>;
  vars: Record<string, unknown>;
  history?: Array<Record<string, unknown>>;
  logger?: WorkflowLogger;
  now?: string;
}

export interface WorkflowLogger {
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
}

export interface NodeExecutionResult {
  status: "success" | "error" | "skipped" | "waiting_human";
  outputs?: Record<string, unknown>;
  nextPortIds?: string[];
  error?: { code?: string; message: string; details?: unknown };
  logs?: Array<{ level: "info" | "warn" | "error"; message: string; data?: unknown }>;
}

export interface NodeExecutor<TConfig = unknown> {
  execute(args: {
    node: BaseNode<NodeType, TConfig>;
    context: WorkflowExecutionContext;
  }): Promise<NodeExecutionResult>;
}
```

- [ ] **Step 2: Create barrel export**

```typescript
// index.ts
export * from './node-types';
export * from './node-configs';
export * from './workflow-definition';
export * from './execution';
```

- [ ] **Step 3: Write type validation test**

```typescript
// tests/unittest/workflow/types.test.ts
import { describe, test, expect } from 'bun:test';
import { NodeType, PortKind } from '../../../src/workflow/types';

describe('Workflow type system', () => {
  test('NodeType has 20 values', () => {
    expect(Object.keys(NodeType).length).toBe(20);
  });
  test('PortKind has standard ports', () => {
    expect(PortKind.Error).toBe('error');
    expect(PortKind.Approved).toBe('approved');
  });
});
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/workflow/types/ tests/unittest/workflow/
git commit -m "feat: add execution types + barrel export + validation tests"
```

---

## Phase 2: Executor Registry

### Task 5: Create executor registry

**Files:**
- Create: `backend/src/workflow/executors/registry.ts`
- Create: `tests/unittest/workflow/registry.test.ts`

- [ ] **Step 1: Write tests**

```typescript
describe('ExecutorRegistry', () => {
  test('register and resolve executor by NodeType');
  test('resolve returns undefined for unregistered type');
  test('registered executor can be called');
});
```

- [ ] **Step 2: Implement**

```typescript
import type { NodeType } from '../types/node-types';
import type { NodeExecutor } from '../types/execution';

const executors = new Map<NodeType, NodeExecutor<any>>();

export function registerExecutor<T>(type: NodeType, executor: NodeExecutor<T>): void {
  executors.set(type, executor);
}

export function resolveExecutor(type: NodeType): NodeExecutor | undefined {
  return executors.get(type);
}

export function hasExecutor(type: NodeType): boolean {
  return executors.has(type);
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/workflow/executors/registry.ts tests/unittest/workflow/registry.test.ts
git commit -m "feat: add node executor registry"
```

---

### Task 6: Implement Phase 1 executors (map existing step handlers)

**Files:**
- Create: `backend/src/workflow/executors/tool-executor.ts`
- Create: `backend/src/workflow/executors/llm-executor.ts`
- Create: `backend/src/workflow/executors/human-executor.ts`
- Create: `backend/src/workflow/executors/start-end-executor.ts`

Each executor wraps the existing handler from the SOP engine:

- `tool-executor.ts` → wraps `skill-tool-executor.ts`
- `llm-executor.ts` → wraps `skill-step-renderer.ts` (for LLM/message/ref/confirm nodes)
- `human-executor.ts` → returns `waiting_human` status
- `start-end-executor.ts` → lifecycle bookkeeping

- [ ] **Step 1-4: Implement each executor**
- [ ] **Step 5: Register all in a `registerDefaults()` function**
- [ ] **Step 6: Commit**

```bash
git add backend/src/workflow/executors/
git commit -m "feat: implement Phase 1 node executors (tool, llm, human, start/end)"
```

---

### Task 7: Implement if-executor (first control flow node)

**Files:**
- Create: `backend/src/workflow/executors/if-executor.ts`
- Create: `backend/src/workflow/executors/guard-executor.ts`

- [ ] **Step 1: Implement if-executor**

Evaluates a JavaScript expression against context.vars and returns `true`/`false` port.

- [ ] **Step 2: Implement guard-executor**

Evaluates a rule/policy expression and returns `approved`/`rejected` port.

- [ ] **Step 3: Commit**

```bash
git add backend/src/workflow/executors/if-executor.ts backend/src/workflow/executors/guard-executor.ts
git commit -m "feat: add if and guard executors"
```

---

## Phase 3: Runtime Adapter

### Task 8: WorkflowSpec → WorkflowDefinition adapter

**Files:**
- Create: `backend/src/workflow/adapter.ts`
- Create: `tests/unittest/workflow/adapter.test.ts`

Maps the existing `WorkflowSpec` (from skill-workflow-compiler) to the new `WorkflowDefinition` format. This ensures backward compatibility — all existing compiled skills work with the new engine.

- [ ] **Step 1: Write tests**

```typescript
describe('WorkflowSpec adapter', () => {
  test('converts simple WorkflowSpec to WorkflowDefinition');
  test('maps step kinds to NodeType (tool→Tool, message→LLM, confirm→Human, etc.)');
  test('converts transitions to edges with ports');
  test('preserves all step metadata');
});
```

- [ ] **Step 2: Implement**

Mapping rules:
- `kind: 'tool'` → `NodeType.Tool`
- `kind: 'message'` → `NodeType.LLM` (with config `{ systemPrompt: ..., responseFormat: 'text' }`)
- `kind: 'ref'` → `NodeType.LLM` (with refContent injected)
- `kind: 'confirm'` → `NodeType.Human` (with config `{ mode: 'approve' }`)
- `kind: 'choice'` → `NodeType.Switch` (with guard-based cases)
- `kind: 'human'` → `NodeType.Human` (with config `{ mode: 'review' }`)
- `kind: 'end'` → `NodeType.End`

Transitions → Edges with sourcePortId/targetPortId based on guards.

- [ ] **Step 3: Commit**

```bash
git add backend/src/workflow/adapter.ts tests/unittest/workflow/adapter.test.ts
git commit -m "feat: add WorkflowSpec to WorkflowDefinition adapter"
```

---

### Task 9: New runtime using executor registry

**Files:**
- Create: `backend/src/workflow/runtime.ts`
- Create: `tests/unittest/workflow/runtime.test.ts`

This is a new runtime loop that uses the executor registry instead of the hardcoded switch statement in `skill-runtime.ts`.

- [ ] **Step 1: Write tests**

```typescript
describe('Workflow Runtime (registry-based)', () => {
  test('executes start → tool → end flow');
  test('evaluates if node and takes correct branch');
  test('human node pauses execution');
  test('error policy routes to error port');
  test('uses executor registry to resolve handlers');
});
```

- [ ] **Step 2: Implement**

Core loop:
```typescript
async function executeWorkflow(def: WorkflowDefinition, ctx: WorkflowExecutionContext) {
  let currentNodeId = findStartNode(def).id;
  while (currentNodeId) {
    const node = def.nodes.find(n => n.id === currentNodeId);
    const executor = resolveExecutor(node.type);
    const result = await executor.execute({ node, context: ctx });
    // Determine next node via edges + result.nextPortIds
    currentNodeId = resolveNextNode(def, node, result);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/workflow/runtime.ts tests/unittest/workflow/runtime.test.ts
git commit -m "feat: add registry-based workflow runtime"
```

---

### Task 10: Integration — wire new runtime into existing chat flow

**Files:**
- Modify: `backend/src/engine/skill-runtime.ts` or `backend/src/engine/skill-router.ts`

Add option to use new registry-based runtime (behind feature flag).

- [ ] **Step 1: Add WORKFLOW_ENGINE_V2 env var check**
- [ ] **Step 2: If enabled, convert WorkflowSpec → WorkflowDefinition and use new runtime**
- [ ] **Step 3: Commit**

```bash
git commit -m "feat: wire registry-based runtime into chat flow (behind flag)"
```

---

### Task 11: E2E verification

- [ ] **Step 1: Run existing E2E tests to verify no regression**
- [ ] **Step 2: Commit**

```bash
git commit -m "test: verify workflow engine v2 passes existing E2E"
```

---

## Summary

| Phase | Tasks | Key Deliverable | Risk |
|-------|-------|----------------|------|
| Phase 1 | 1-4 | **Type definitions** (20 NodeTypes, configs, ports, edges) | Zero — pure types |
| Phase 2 | 5-7 | **Executor registry** + Phase 1 executors + if/guard | Low — new code, doesn't replace existing |
| Phase 3 | 8-11 | **Adapter + new runtime** + integration | Medium — needs careful testing |

**Total: 11 tasks, estimated 5-7 days.**

**Key design decisions:**
1. Types are defined for all 20 node types upfront, but only 8 have executors in v1
2. Existing `WorkflowSpec` is adapted (not replaced) via `adapter.ts`
3. New runtime runs in parallel with existing `skill-runtime.ts` behind feature flag
4. Existing E2E tests validate backward compatibility
5. New node types (classifier, extractor, retriever, foreach, loop) added incrementally later

**Not in scope for this plan:**
- Mermaid flowchart → WorkflowDefinition compiler (future — currently Mermaid only used for visualization)
- Frontend workflow editor (future)
- Variable interpolation engine (future — currently uses simple inputMapping)
- Connector management (future — currently uses MCP servers directly)
