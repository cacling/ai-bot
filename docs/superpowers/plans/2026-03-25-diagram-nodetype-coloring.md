# Diagram NodeType Coloring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render workflow diagram nodes in different colors based on their NodeType — tool=blue, llm=green, human=yellow, switch=purple, end=gray, guard=red. Uses DOM post-processing on rendered SVG (same approach as existing progress highlighting).

**Architecture:** Backend compiles WorkflowSpec and extracts a `nodeTypeMap` (nodeLabel → nodeType), sends it alongside the mermaid text in WS/HTTP events. Frontend applies colors to SVG nodes after mermaid rendering, in the same lifecycle as progress highlighting.

**Tech Stack:** TypeScript, React, Mermaid.js, SVG DOM manipulation

---

## Color Scheme

| NodeType | Color | Fill | Stroke | Semantic |
|----------|-------|------|--------|----------|
| `tool` | Blue | `#dbeafe` | `#3b82f6` | External action / MCP call |
| `llm` | Green | `#dcfce7` | `#22c55e` | AI text generation |
| `human` | Amber | `#fef3c7` | `#f59e0b` | Human confirm / escalation |
| `switch` | Purple | `#f3e8ff` | `#a855f7` | Branch / decision |
| `guard` | Red | `#fef2f2` | `#ef4444` | Compliance check |
| `end` | Gray | `#f1f5f9` | `#94a3b8` | Terminal |
| `start` | Teal | `#ccfbf1` | `#14b8a6` | Entry point |
| default | — | unchanged | unchanged | No coloring |

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `backend/src/services/mermaid.ts` | Modify | Add `buildNodeTypeMap(spec)` helper |
| `backend/src/engine/runner.ts` | Modify | Include `nodeTypeMap` in diagram update callback |
| `backend/src/engine/skill-runtime.ts` | Modify | Include `nodeTypeMap` in turn result |
| `backend/src/chat/chat-ws.ts` | Modify | Pass `nodeTypeMap` in WS `skill_diagram_update` event |
| `frontend/src/shared/MermaidRenderer.tsx` | Modify | Add `applyNodeTypeColors()` + accept `nodeTypeMap` prop |
| `frontend/src/shared/DiagramPanel.tsx` | Modify | Pass `nodeTypeMap` to MermaidRenderer |
| `frontend/src/agent/cards/contents/DiagramContent.tsx` | Modify | Pass `nodeTypeMap` to MermaidRenderer |
| `frontend/src/chat/api.ts` | Modify | Add `nodeTypeMap` to WS event type |

---

## Task 1: Backend — build nodeTypeMap from WorkflowSpec

**Files:**
- Modify: `backend/src/services/mermaid.ts`

- [ ] **Step 1: Add buildNodeTypeMap function**

```typescript
import type { WorkflowSpec } from '../engine/skill-workflow-types';

/**
 * Build a map of node label → node type (kind) from a compiled WorkflowSpec.
 * Used by frontend to color-code diagram nodes by type.
 */
export function buildNodeTypeMap(spec: WorkflowSpec): Record<string, string> {
  const map: Record<string, string> = {};
  for (const step of Object.values(spec.steps)) {
    map[step.label] = step.kind;
  }
  return map;
}
```

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: add buildNodeTypeMap for diagram coloring"
```

---

## Task 2: Backend — include nodeTypeMap in diagram events

**Files:**
- Modify: `backend/src/engine/runner.ts`
- Modify: `backend/src/chat/chat-ws.ts`

- [ ] **Step 1: In runner.ts, when pushing diagram updates in onStepFinish, include nodeTypeMap**

Find the `onDiagramUpdate` callback call. When a skill diagram is pushed, also load the WorkflowSpec and build nodeTypeMap:

```typescript
// In the onDiagramUpdate callback section:
if (onDiagramUpdate) {
  // ... existing diagram push logic ...
  // After getting rawMermaid, also get nodeTypeMap:
  const spec = findPublishedSpec(skillName);
  const nodeTypeMap = spec ? buildNodeTypeMap(JSON.parse(spec.spec_json)) : undefined;
  onDiagramUpdate(skillName, stripMermaidMarkers(rawMermaid), nodeTypeMap);
}
```

This requires changing the `DiagramUpdateCallback` type:
```typescript
export type DiagramUpdateCallback = (skillName: string, mermaid: string, nodeTypeMap?: Record<string, string>) => void;
```

- [ ] **Step 2: In chat-ws.ts, pass nodeTypeMap in WS event**

Find where `skill_diagram_update` events are sent. Add `nodeTypeMap`:

```typescript
ws.send(JSON.stringify({
  source: 'user', type: 'skill_diagram_update',
  skill_name: skillName, mermaid,
  nodeTypeMap,  // NEW
  msg_id,
}));
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: include nodeTypeMap in diagram update events"
```

---

## Task 3: Frontend — add applyNodeTypeColors to MermaidRenderer

**Files:**
- Modify: `frontend/src/shared/MermaidRenderer.tsx`

- [ ] **Step 1: Add color mapping constant and DOM coloring function**

```typescript
const NODE_TYPE_COLORS: Record<string, { fill: string; stroke: string }> = {
  tool:       { fill: '#dbeafe', stroke: '#3b82f6' },
  llm:        { fill: '#dcfce7', stroke: '#22c55e' },
  human:      { fill: '#fef3c7', stroke: '#f59e0b' },
  switch:     { fill: '#f3e8ff', stroke: '#a855f7' },
  guard:      { fill: '#fef2f2', stroke: '#ef4444' },
  end:        { fill: '#f1f5f9', stroke: '#94a3b8' },
  start:      { fill: '#ccfbf1', stroke: '#14b8a6' },
  // Legacy aliases
  message:    { fill: '#dcfce7', stroke: '#22c55e' },
  ref:        { fill: '#dcfce7', stroke: '#22c55e' },
  confirm:    { fill: '#fef3c7', stroke: '#f59e0b' },
  choice:     { fill: '#f3e8ff', stroke: '#a855f7' },
};

/**
 * Apply color-coding to SVG nodes based on their NodeType.
 * Matches nodes by text content (same approach as progress highlighting).
 */
export function applyNodeTypeColors(container: HTMLElement, nodeTypeMap: Record<string, string>): void {
  const candidates = container.querySelectorAll<Element>('.nodeLabel, text, tspan, foreignObject span, foreignObject div');
  const allTexts = Array.from(candidates).map(el => ({ el, text: el.textContent?.trim() ?? '' }));

  for (const [label, nodeType] of Object.entries(nodeTypeMap)) {
    const colors = NODE_TYPE_COLORS[nodeType];
    if (!colors) continue;

    for (const { el, text } of allTexts) {
      if (text !== label) continue;
      // Walk up to find the outer state node group
      let node: Element | null = el;
      for (let depth = 0; depth < 8; depth++) {
        node = node?.parentElement ?? null;
        if (!node) break;
        const cls = node.getAttribute('class') ?? '';
        const id = node.id ?? '';
        if (cls.includes('node') || cls.includes('statediagram') || id.includes('state-')) {
          const rect = node.querySelector(':scope > rect, :scope > path, :scope > polygon');
          if (rect) {
            (rect as SVGElement).style.fill = colors.fill;
            (rect as SVGElement).style.stroke = colors.stroke;
            (rect as SVGElement).style.strokeWidth = '2px';
            break;
          }
        }
      }
      break; // Found matching text, move to next label
    }
  }
}
```

- [ ] **Step 2: Add nodeTypeMap prop to MermaidRendererProps**

```typescript
export interface MermaidRendererProps {
  mermaid: string | null;
  nodeTypeMap?: Record<string, string>;  // NEW: label → nodeType for coloring
  zoom?: boolean;
  autoFocus?: boolean;
  height?: string;
  emptyText?: string;
  loadingText?: string;
  errorText?: string;
}
```

- [ ] **Step 3: Apply colors in the useEffect after SVG mounts**

In the `useEffect` that runs after `svgHtml` is set (the one that does progress highlighting), add nodeTypeMap coloring BEFORE progress highlighting (so progress highlight overrides node type color for the current step):

```typescript
// Apply node type coloring (before progress highlighting)
if (nodeTypeMap && Object.keys(nodeTypeMap).length > 0) {
  applyNodeTypeColors(wrap, nodeTypeMap);
}

// Apply DOM-based progress highlighting (overwrites node type color for current step)
if (progressRef.current) {
  applyProgressHighlightDOM(wrap, progressRef.current);
}
```

Where `nodeTypeMap` comes from props — store it in a ref so the effect can access it.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: add NodeType color-coding to MermaidRenderer"
```

---

## Task 4: Frontend — wire nodeTypeMap through DiagramPanel and DiagramContent

**Files:**
- Modify: `frontend/src/shared/DiagramPanel.tsx`
- Modify: `frontend/src/agent/cards/contents/DiagramContent.tsx`
- Modify: `frontend/src/chat/api.ts` (or wherever WS event types are defined)

- [ ] **Step 1: Update WS event type to include nodeTypeMap**

In the chat API or WS handler, add `nodeTypeMap` to the diagram event type:

```typescript
interface SkillDiagramEvent {
  skill_name: string;
  mermaid: string;
  nodeTypeMap?: Record<string, string>;
  active_step_id?: string;
}
```

- [ ] **Step 2: Pass nodeTypeMap through DiagramPanel to MermaidRenderer**

DiagramPanel receives diagram data and passes it to MermaidRenderer. Add the prop:

```typescript
<MermaidRenderer
  mermaid={diagramData.mermaid}
  nodeTypeMap={diagramData.nodeTypeMap}
  // ... other props
/>
```

- [ ] **Step 3: Same for DiagramContent (agent workstation)**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: wire nodeTypeMap through frontend diagram components"
```

---

## Task 5: E2E verification

- [ ] **Step 1: Restart services**

```bash
./start.sh --reset
```

- [ ] **Step 2: Open browser, send a service-cancel message, verify diagram has colored nodes**

Manual visual verification: nodes should have different colors based on type.

- [ ] **Step 3: Run existing E2E tests to verify no regression**

```bash
cd frontend/tests/e2e && npx playwright test 12-sop-ui-verification.spec.ts 13-workflow-engine.spec.ts --reporter=list
```

- [ ] **Step 4: Commit any fixes**

---

## Summary

| Task | Content | Risk |
|------|---------|------|
| 1 | `buildNodeTypeMap` helper | Zero |
| 2 | Backend events include nodeTypeMap | Low |
| 3 | **MermaidRenderer coloring** (core) | Medium — DOM matching |
| 4 | Wire through frontend components | Low |
| 5 | E2E verification | — |

**Total: 5 tasks, estimated 1-2 days.**

**Key design:** Colors are applied via DOM post-processing (same as progress highlighting). Progress highlight takes precedence — current step stays yellow regardless of node type color. This means the two systems compose cleanly.
