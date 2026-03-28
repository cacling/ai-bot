# Skill Clarifier Design

> Upgrade `/api/skill-edit/clarify` from a single-shot completeness check into a phased, low-latency requirements clarifier for skill management.

**Date**: 2026-03-27
**Status**: Draft
**Primary target**: [skill-edit.ts](/Users/chenjun/Documents/obsidian/workspace/ai-bot/backend/src/agent/km/skills/skill-edit.ts)
**Related runtime**: [skill-creator.ts](/Users/chenjun/Documents/obsidian/workspace/ai-bot/backend/src/agent/km/skills/skill-creator.ts)

---

## Problem Statement

Current `/api/skill-edit/clarify` is intentionally light:

- It asks the model to judge whether the request is "complete enough"
- It only checks five broad fields
- It returns either `need_clarify` or `ready`
- It does not explicitly model phase progression
- It does not read the target skill before clarifying
- It does not separate user-stated facts from model inference
- It does not produce a strong "change contract" for the downstream editor

This works for simple wording edits, but it fails open on the harder cases that matter most:

- one request bundles multiple changes
- target skill is ambiguous
- the user wants a capability change, not a local text edit
- a change impacts references, channels, escalation rules, or workflow branches
- the user says what to change, but not what must remain untouched

The result is a frequent false-ready state: the clarifier says "ready", but the edit stage still needs to guess.

---

## Current Reality

The current clarifier prompt lives in [skill-edit.ts](/Users/chenjun/Documents/obsidian/workspace/ai-bot/backend/src/agent/km/skills/skill-edit.ts#L48).

Current behavior:

1. load skill index summary only
2. pass chat history + latest instruction to the model
3. ask for:
   - target skill
   - change content
   - change type
   - exception handling
   - related docs
4. return:
   - `status: ready` + `parsed_intent`
   - or `status: need_clarify` + one question

This is a good baseline, but still a classifier, not a controller.

---

## Design Goals

1. Reduce false-ready cases without turning clarification into a heavy workflow
2. Ask at most one blocking question per turn
3. Detect and split bundled requests before editing starts
4. Read the current skill when that improves question quality
5. Distinguish explicit user facts from inferred assumptions
6. Produce a structured handoff package for `/api/skill-edit`
7. Preserve low latency and avoid subagent orchestration

## Non-Goals

1. No code-generation or diff-generation inside clarify
2. No reviewer subagent loop
3. No full spec/plan workflow like `skill-creator`
4. No requirement to read every related file before each question

---

## Solution Overview

Replace the current binary clarifier with a **phased controller**:

```text
scope_check
  -> target_confirm
  -> change_confirm
  -> impact_confirm
  -> ready

At any point:
  -> blocked (needs human choice / capability boundary / too many bundled changes)
```

Core Superpowers-inspired mechanisms to borrow:

- explicit phase machine
- one-question-at-a-time
- scope split before detail collection
- hard gates for advancement
- "stated vs inferred" separation
- minimal-change contract
- risk-based clarification depth
- structured ready package

Not borrowed:

- heavy subagent reviewer orchestration
- separate plan-writing phase

---

## Proposed Phases

### 1. `scope_check`

Purpose:

- detect whether the request is actually one change packet
- decide whether this is:
  - local wording/config edit
  - workflow branch change
  - capability boundary change
  - multi-skill bundled request

Advance only if:

- one dominant target area is identified
- bundled requests are either split or explicitly prioritized

If not:

- ask a forced-choice question
- or return `blocked` when user must choose a direction first

Example output:

```json
{
  "status": "need_clarify",
  "phase": "scope_check",
  "question": "你这次是想先改话术，还是先改流程分支？这两类改动最好分开处理。",
  "options": [
    { "id": "wording", "label": "先改话术" },
    { "id": "flow", "label": "先改流程" }
  ]
}
```

### 2. `target_confirm`

Purpose:

- lock the target skill
- identify the likely touched file set:
  - `SKILL.md`
  - one or more `references/*.md`
  - optionally assets

Mechanism:

- start with the skill index
- if one or two candidate skills are likely, call `read_skill`
- if the request mentions a known reference or policy, optionally call `read_reference`

Advance only if:

- target skill is explicit or strongly grounded by repo evidence

### 3. `change_confirm`

Purpose:

- define the exact change packet
- separate:
  - what changes
  - what stays unchanged
  - what behavior is expected after the change

This is the most important phase.

Required slots:

- `target_skill`
- `change_type`
- `change_summary`
- `affected_area`
- `unchanged_area`
- `acceptance_signal`

Advance only if:

- there is a concrete change target
- there is a concrete desired outcome
- unchanged areas are stated or confidently bounded

### 4. `impact_confirm`

Purpose:

- verify downstream impact and risk

Checks:

- does the change affect reference docs
- does it affect multiple channels
- does it affect escalation / transfer-to-human logic
- does it introduce a new branch or only adjust wording
- does it imply a new runtime capability rather than a text edit

Advance only if:

- all impact-bearing unknowns are resolved
- or explicitly marked out of scope

### 5. `ready`

Purpose:

- output a structured change contract for `/api/skill-edit`

This is not just "complete enough".
It is "safe enough to edit without guessing".

### 6. `blocked`

Use when:

- the request is really a product/capability change, not a skill edit
- the user must choose among multiple unrelated change packets
- the target skill cannot be resolved safely
- repo evidence and user intent still conflict after clarification

This prevents the current failure mode where the system pretends to be ready.

---

## Hard Gates

The clarifier must not return `ready` unless all of the following are true:

1. exactly one target skill is selected
2. the requested change is narrowed to one dominant change packet
3. the changed area is explicit
4. the unchanged area is explicit or bounded
5. related document impact has been checked
6. the change is still within "skill edit" scope rather than "new capability" scope
7. at least one acceptance signal is present

If any gate fails, stay in clarification.

---

## Output Schema

Keep the existing `status` contract for frontend compatibility, but expand the payload.

```json
{
  "status": "need_clarify | ready | blocked",
  "phase": "scope_check | target_confirm | change_confirm | impact_confirm | ready | blocked",
  "question": "one blocking question for the user",
  "options": [
    { "id": "string", "label": "string", "description": "string" }
  ],
  "missing": ["string"],
  "summary": {
    "target_skill": "string | null",
    "change_type": "wording | param | flow | branch | new_step | capability_boundary",
    "change_summary": "string",
    "affected_area": ["string"],
    "unchanged_area": ["string"],
    "related_docs": ["string"],
    "acceptance_signal": "string",
    "risk_level": "low | medium | high"
  },
  "evidence": {
    "explicit": ["facts directly stated by user"],
    "inferred": ["facts inferred from context or repo"],
    "repo_observations": ["facts learned from read_skill/read_reference"]
  },
  "impact": {
    "needs_reference_update": true,
    "needs_workflow_change": false,
    "needs_channel_review": false,
    "needs_human_escalation_review": false,
    "out_of_scope_reason": ""
  },
  "handoff": {
    "ready_for_edit": false,
    "target_files": ["skills/biz-skills/x/SKILL.md"],
    "edit_invariants": ["Do not rewrite escalation table", "Keep channels unchanged"]
  }
}
```

### Compatibility rule

Frontend can keep using:

- `status`
- `question`
- `missing`

while newer clients consume:

- `phase`
- `summary`
- `evidence`
- `impact`
- `handoff`

---

## Prompting Strategy

The system prompt should stop acting like a generic completeness judge and become a controller.

New prompt rules:

1. Ask at most one blocking question per turn
2. Prefer forced-choice over open-ended questions
3. Split bundled changes before asking detail questions
4. Do not claim `ready` while still relying on inference for target skill or scope
5. Keep explicit facts separate from inferred assumptions
6. When risk is high, ask for unchanged-area confirmation before `ready`
7. If the request implies new runtime capability, return `blocked`, not `ready`

---

## Tooling Changes

Current `/clarify` only gets the skill index summary.

Add these tools:

1. `read_skill(skill_name)`
2. `read_reference(skill_name, ref_name)`
3. `list_skill_references(skill_name)`

Rule:

- do not read the whole repo by default
- only read a skill when it materially improves question quality
- prefer targeted reads once a likely target skill exists

This is the clarifier version of Superpowers' "don't trust descriptions alone; inspect the artifact".

---

## Risk Model

Reuse the current `risk_level`, but make it operational.

### `low`

Typical cases:

- wording update
- single parameter tweak
- local reference correction

Clarification depth:

- one or two turns may be enough

### `medium`

Typical cases:

- add/remove branch
- adjust transfer-to-human condition
- update both SKILL and one reference

Clarification depth:

- must confirm unchanged areas and related-doc impact

### `high`

Typical cases:

- new workflow step
- escalation policy change
- cross-channel effect
- request that sounds like a new tool/capability

Clarification depth:

- must confirm impact
- may return `blocked` if the change is actually beyond skill-edit scope

---

## Ready Handoff Contract

When the clarifier returns `ready`, it should hand off a package that the edit stage can use with minimal guessing.

Minimum handoff:

```json
{
  "target_skill": "telecom-app",
  "change_type": "flow",
  "change_summary": "将 App 登录异常场景下的‘建议重装’改为先检查版本与网络，再决定是否转人工",
  "affected_area": [
    "SKILL.md: 登录异常分支",
    "references/app-troubleshooting.md"
  ],
  "unchanged_area": [
    "账单相关流程不变",
    "营销推荐逻辑不变"
  ],
  "related_docs": ["app-troubleshooting.md"],
  "acceptance_signal": "用户遇到登录异常时，AI 会先排查版本/网络，再决定是否转人工",
  "risk_level": "medium",
  "edit_invariants": [
    "不要改动其他触发条件",
    "不要新增自动办理动作"
  ]
}
```

This becomes the edit-stage equivalent of a spec summary.

---

## Integration With `/api/skill-edit`

Current `/api/skill-edit` directly asks the model to locate and replace text.
That is acceptable for v1, but it should start consuming the clarifier's handoff package.

Recommended integration order:

1. clarify produces structured `handoff`
2. edit uses `target_skill`, `affected_area`, `edit_invariants`, `related_docs`
3. edit reads only the necessary files
4. edit returns diff + explanation + touched files

This reduces old-fragment hallucination and "wrong file, right idea" failures.

---

## Failure Handling

### Case A — ambiguous target skill

Return `need_clarify` with 2-3 candidate options.

### Case B — bundled request

Return `need_clarify` and force the user to choose one packet first.

### Case C — capability boundary change

Return `blocked` with explanation:

- "这更像新增系统能力，而不是编辑现有技能文本"

### Case D — repo evidence conflicts with user wording

Return `need_clarify` and explicitly separate:

- what exists in the repo now
- what the user seems to want changed

---

## Suggested Implementation Order

### Phase 1 — Schema and prompt only

- add `phase`, `summary`, `evidence`, `impact`, `handoff`
- keep current endpoint shape backward compatible
- enforce one-question-per-turn

### Phase 2 — Add clarifier tools

- `read_skill`
- `read_reference`
- `list_skill_references`

### Phase 3 — Gate `/api/skill-edit`

- encourage clients to call `/clarify` first
- optionally reject edit when no ready handoff exists

### Phase 4 — Add edit-stage review gate

- verify touched files stay within `handoff.target_files`
- verify diff does not violate `edit_invariants`

---

## Testing Plan

Add coverage for:

1. bundled request splits into forced-choice clarification
2. ambiguous target skill returns candidate options
3. wording-only edit reaches `ready` in 1-2 turns
4. workflow change forces impact confirmation
5. capability-boundary request returns `blocked`
6. clarifier distinguishes explicit vs inferred facts
7. ready output includes unchanged-area and acceptance signal

---

## Recommendation

The highest-ROI version is:

- phased controller
- one-question-per-turn
- skill-aware targeted reads
- structured ready handoff

This keeps the clarifier lightweight, but upgrades it from a passive classifier into a reliable edit controller.
