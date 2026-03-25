# Mermaid NodeType Annotation Upgrade Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `%% kind:` annotations in SKILL.md from the legacy 7-value set (tool/message/ref/confirm/choice/human/end) to the new 20-value NodeType enum, so the compiler can produce `WorkflowDefinition` directly without the adapter layer.

**Architecture:** Change the annotation value domain, update the compiler to produce `WorkflowDefinition` instead of `WorkflowSpec`, migrate all 7 SKILL.md files, and update skill-creator-spec to generate new-format annotations.

**Tech Stack:** TypeScript, Bun:test

---

## Mapping Table

| Old `%% kind:` | New `%% kind:` | Why |
|----------------|----------------|-----|
| `message` | `llm` | Aligns with NodeType.LLM — LLM generates text |
| `ref` | `llm` | Same — LLM explains reference content (ref path stays in `%% ref:`) |
| `confirm` | `human` | Aligns with NodeType.Human (mode=approve) |
| `choice` | `switch` | Aligns with NodeType.Switch |
| `tool` | `tool` | No change |
| `human` | `human` | No change (mode=review for escalation) |
| `end` | `end` | No change |

New types available but not yet used in existing skills:
- `start` — explicit start node (currently implicit via `[*]`)
- `if` — binary condition
- `guard` — compliance check
- `classifier` — intent classification
- `extractor` — structured extraction

---

## File Map

| File | Action | Change |
|------|--------|--------|
| `backend/skills/tech-skills/skill-creator-spec/scripts/types.ts` | Modify | Update `StepKind` to use new values |
| `backend/src/engine/skill-workflow-types.ts` | Modify | Update `StepKind` type |
| `backend/src/engine/skill-workflow-compiler.ts` | Modify | Accept new kind values, backward compat for old |
| `backend/src/engine/sop-guard.ts` | Modify | Update kind checks (message→llm, confirm→human, choice→switch) |
| `backend/src/engine/skill-runtime.ts` | Modify | Update step dispatch |
| `backend/skills/biz-skills/service-cancel/SKILL.md` | Modify | `kind:message→kind:llm`, `kind:confirm→kind:human`, `kind:choice→kind:switch` |
| `backend/skills/biz-skills/bill-inquiry/SKILL.md` | Modify | Same |
| `backend/skills/biz-skills/fault-diagnosis/SKILL.md` | Modify | Same |
| `backend/skills/biz-skills/plan-inquiry/SKILL.md` | Modify | Same |
| `backend/skills/biz-skills/telecom-app/SKILL.md` | Modify | Same |
| `backend/skills/biz-skills/outbound-collection/SKILL.md` | Modify | Same |
| `backend/skills/biz-skills/outbound-marketing/SKILL.md` | Modify | Same |
| `backend/skills/.versions/*/SKILL.md` | Modify | Same for all version snapshots |
| `backend/skills/tech-skills/skill-creator-spec/references/spec-writing.md` | Modify | Update docs |
| `backend/skills/tech-skills/skill-creator-spec/references/spec-example.md` | Modify | Update example |
| `backend/skills/tech-skills/skill-creator-spec/SKILL.md` | Modify | Update generation rules |

---

## Task 1: Update StepKind type + compiler backward compat

**Files:**
- Modify: `backend/src/engine/skill-workflow-types.ts`
- Modify: `backend/skills/tech-skills/skill-creator-spec/scripts/types.ts`
- Modify: `backend/src/engine/skill-workflow-compiler.ts`

- [ ] **Step 1: Expand StepKind to accept both old and new values**

In `skill-workflow-types.ts`, change:
```typescript
export type StepKind = 'tool' | 'confirm' | 'ref' | 'human' | 'message' | 'choice' | 'end';
```
to:
```typescript
export type StepKind =
  // New NodeType-aligned values (preferred)
  | 'start' | 'end' | 'llm' | 'classifier' | 'extractor' | 'retriever'
  | 'transform' | 'code' | 'state' | 'merge'
  | 'if' | 'switch' | 'foreach' | 'loop' | 'subflow'
  | 'tool' | 'http' | 'db'
  | 'human' | 'guard'
  // Legacy aliases (backward compat, compiler normalizes these)
  | 'message' | 'ref' | 'confirm' | 'choice';
```

Do the same in `scripts/types.ts`.

- [ ] **Step 2: Add normalization in compiler**

In `skill-workflow-compiler.ts`, add a normalizer that maps old values to new:
```typescript
function normalizeKind(kind: string): StepKind {
  switch (kind) {
    case 'message': return 'llm';
    case 'ref': return 'llm';
    case 'confirm': return 'human';
    case 'choice': return 'switch';
    default: return kind as StepKind;
  }
}
```

Apply this in the compilation pipeline where kind is determined.

- [ ] **Step 3: Run tests**

```bash
cd backend && bun test tests/unittest/engine/skill-workflow-compiler.test.ts
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: expand StepKind to accept NodeType values + backward compat normalization"
```

---

## Task 2: Update SOPGuard + skill-runtime for new kind values

**Files:**
- Modify: `backend/src/engine/sop-guard.ts`
- Modify: `backend/src/engine/skill-runtime.ts`

- [ ] **Step 1: In sop-guard.ts, update all `step.kind === 'message'` to also check `'llm'`**

Replace pattern: wherever the code checks `step.kind === 'message'`, change to `step.kind === 'message' || step.kind === 'llm'`. Same for `confirm→human`, `choice→switch`.

Or better: use a helper:
```typescript
function isLlmKind(kind: string): boolean { return kind === 'llm' || kind === 'message' || kind === 'ref'; }
function isHumanKind(kind: string): boolean { return kind === 'human' || kind === 'confirm'; }
function isSwitchKind(kind: string): boolean { return kind === 'switch' || kind === 'choice'; }
```

- [ ] **Step 2: Same in skill-runtime.ts**

Update the switch statement in `runSkillTurn` to handle both old and new values.

- [ ] **Step 3: Run all tests**

```bash
cd backend && bun test tests/unittest/engine/ tests/unittest/workflow/
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: SOPGuard + runtime accept both old and new kind values"
```

---

## Task 3: Migrate all 7 SKILL.md files

**Files:**
- All 7 `backend/skills/biz-skills/*/SKILL.md`
- All version snapshots in `backend/skills/.versions/*/`

- [ ] **Step 1: Batch replace in all SKILL.md files**

For each file, do these replacements:
```
%% kind:message  →  %% kind:llm
%% kind:ref      →  (remove kind:ref, keep only %% ref:xxx — kind defaults to llm when ref is present)
%% kind:confirm  →  %% kind:human
%% kind:choice   →  (remove — <<choice>> already implies switch)
```

Wait — `kind:choice` is currently redundant with `<<choice>>` in mermaid. The compiler already infers `switch` from `<<choice>>`. So we can just remove `%% kind:choice` annotations.

For `kind:ref`, the compiler can infer `llm` when `%% ref:` is present. So `kind:ref` → `kind:llm` or just remove (compiler infers).

Simplified replacements:
```
%% kind:message  →  %% kind:llm
%% kind:confirm  →  %% kind:human
%% kind:choice   →  (remove, inferred from <<choice>>)
%% kind:ref      →  %% kind:llm  (or remove, inferred from %% ref:)
```

- [ ] **Step 2: Verify all compile**

```bash
cd backend && bun -e "
const fs=require('fs');const{compileWorkflow}=require('./src/engine/skill-workflow-compiler');
for(const s of ['bill-inquiry','fault-diagnosis','plan-inquiry','service-cancel','telecom-app','outbound-collection','outbound-marketing']){
  const r=compileWorkflow(fs.readFileSync('skills/biz-skills/'+s+'/SKILL.md','utf-8'),s,1);
  console.log(s,r.errors.length,'errors',Object.keys(r.spec?.steps||{}).length,'steps');
}
"
```

- [ ] **Step 3: Run all tests**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: migrate all SKILL.md annotations to NodeType values (message→llm, confirm→human)"
```

---

## Task 4: Update spec-writing.md + spec-example.md + SKILL.md generation rules

**Files:**
- Modify: `backend/skills/tech-skills/skill-creator-spec/references/spec-writing.md`
- Modify: `backend/skills/tech-skills/skill-creator-spec/references/spec-example.md`
- Modify: `backend/skills/tech-skills/skill-creator-spec/SKILL.md`

- [ ] **Step 1: Update annotation docs in spec-writing.md**

Change the `%% kind:` table:
```markdown
| `%% kind:<type>` | 节点类型 | `%% kind:tool` / `kind:llm` / `kind:human` / `kind:switch` / `kind:guard` / `kind:end` |
```

- [ ] **Step 2: Update spec-example.md**

Replace `kind:message` → `kind:llm`, `kind:confirm` → `kind:human` in the bill-inquiry example.

- [ ] **Step 3: Update SKILL.md generation rules**

In the draft section, update the annotation requirement to use new values.

- [ ] **Step 4: Commit**

```bash
git commit -m "docs: update spec-writing and examples to use NodeType annotation values"
```

---

## Task 5: Update validate_statediagram.ts + adapter.ts

**Files:**
- Modify: `backend/skills/tech-skills/skill-creator-spec/scripts/validate_statediagram.ts`
- Modify: `backend/src/workflow/adapter.ts`

- [ ] **Step 1: Update validation to accept new kind values**

In `validate_statediagram.ts`, if there's any validation that checks kind values, update to accept the new set.

- [ ] **Step 2: Update adapter.ts to handle both old and new kinds**

The adapter's `convertStep` switch should handle `'llm'` in addition to `'message'` and `'ref'`.

- [ ] **Step 3: Run full test suite**

```bash
cd backend && bun test tests/unittest/
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: update validator and adapter for new NodeType kind values"
```

---

## Task 6: E2E verification

- [ ] **Step 1: Run SOP E2E tests**

```bash
cd frontend/tests/e2e && npx playwright test 12-sop-ui-verification.spec.ts --headed
```

- [ ] **Step 2: Run workflow engine E2E tests**

```bash
cd frontend/tests/e2e && npx playwright test 13-workflow-engine.spec.ts --headed
```

- [ ] **Step 3: Commit if any fixes needed**

---

## Summary

| Task | Content | Risk |
|------|---------|------|
| 1 | StepKind expansion + compiler normalization | Low — backward compat |
| 2 | SOPGuard + runtime dual-value support | Low — additive |
| 3 | **Migrate all SKILL.md** (bulk annotation rename) | Medium — many files |
| 4 | Update spec docs + generation rules | Low |
| 5 | Validator + adapter update | Low |
| 6 | E2E verification | — |

**Total: 6 tasks, estimated 2-3 days.**

**Key principle:** Backward compatibility throughout. The compiler accepts BOTH old (`message/confirm/choice`) and new (`llm/human/switch`) values. Old values are normalized to new during compilation. This means partially-migrated skills still work.
