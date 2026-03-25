/**
 * skill-workflow-compiler.ts — Compiles annotated mermaid state diagrams into WorkflowSpec JSON
 *
 * Pipeline:
 * 1. Extract mermaid code block from SKILL.md
 * 2. Parse lines → raw nodes + raw transitions
 * 2a. Flatten nested states (prefix internal nodes with parent name)
 * 2b. Propagate transition-line annotations to target nodes
 * 3. Determine step id (from %% step: or label fallback)
 * 4. Determine kind (from %% kind:, %% tool:, <<choice>>, or default 'message')
 * 5. Determine guard (from %% guard:, heuristic, or 'always')
 * 6. Find startStepId ([*] --> X)
 * 7. Find terminalSteps (X --> [*])
 * 8. Validate (unique ids, choice exits >= 2, etc.)
 * 9. Return CompileResult { spec, errors, warnings }
 */

import {
  type WorkflowSpec,
  type WorkflowStep,
  type WorkflowTransition,
  type StepKind,
  type GuardType,
  type CompileResult,
} from './skill-workflow-types';

// ── Regex patterns (copied from validate_statediagram.ts) ──

const RE_TRANSITION = /^\s*(.+?)\s*-->\s*(.+?)(?:\s*:\s*(.+))?$/;
const RE_CHOICE = /^\s*state\s+(.+?)\s+<<choice>>/;
const RE_NESTED_OPEN = /^\s*state\s+(.+?)\s*\{/;
const RE_NESTED_CLOSE = /^\s*\}\s*$/;

const RE_ANNOTATION_TOOL = /%%\s*tool:(\w+)/g;
const RE_ANNOTATION_REF = /%%\s*ref:([^\s]+)/g;
const RE_ANNOTATION_STEP = /%%\s*step:([\w-]+)/g;
const RE_ANNOTATION_KIND = /%%\s*kind:(\w+)/g;
const RE_ANNOTATION_GUARD = /%%\s*guard:([\w.]+)/g;
const RE_ANNOTATION_OUTPUT = /%%\s*output:(\w+)/g;

const VALID_KINDS: ReadonlySet<string> = new Set<StepKind>([
  // New NodeType-aligned values
  'start', 'end', 'llm', 'classifier', 'extractor', 'retriever',
  'transform', 'code', 'state', 'merge',
  'if', 'switch', 'foreach', 'loop', 'subflow',
  'tool', 'http', 'db',
  'human', 'guard',
  // Legacy aliases
  'message', 'ref', 'confirm', 'choice',
]);

/** Normalize legacy kind values to NodeType-aligned values */
function normalizeKind(kind: string): string {
  switch (kind) {
    case 'message': return 'llm';
    case 'ref': return 'llm';
    case 'confirm': return 'human';
    case 'choice': return 'switch';
    default: return kind;
  }
}

const VALID_GUARDS: ReadonlySet<string> = new Set<GuardType>([
  'tool.success', 'tool.error', 'tool.no_data',
  'user.confirm', 'user.cancel',
  'always',
]);

const GUARD_PATTERNS: ReadonlyArray<[RegExp, GuardType]> = [
  [/成功|正常|有数据|查到|通过/, 'tool.success'],
  [/失败|异常|超时|错误|系统/, 'tool.error'],
  [/未查到|无数据|不存在|为空/, 'tool.no_data'],
  [/确认|同意|办理|是的|好的/, 'user.confirm'],
  [/取消|拒绝|不要|放弃|算了/, 'user.cancel'],
];

// ── Internal types ──

interface RawAnnotation {
  type: 'tool' | 'ref' | 'step' | 'kind' | 'guard' | 'output';
  value: string;
}

interface RawNode {
  name: string;
  isChoice: boolean;
  annotations: RawAnnotation[];
}

interface RawTransition {
  from: string;
  to: string;
  label: string;
  annotations: RawAnnotation[];
}

// ── Helpers ──

function cleanStateName(raw: string): string {
  return raw.trim().replace(/^["']|["']$/g, '');
}

function extractAnnotations(line: string): RawAnnotation[] {
  const anns: RawAnnotation[] = [];
  const extractors: Array<[RegExp, RawAnnotation['type']]> = [
    [RE_ANNOTATION_TOOL, 'tool'],
    [RE_ANNOTATION_REF, 'ref'],
    [RE_ANNOTATION_STEP, 'step'],
    [RE_ANNOTATION_KIND, 'kind'],
    [RE_ANNOTATION_GUARD, 'guard'],
    [RE_ANNOTATION_OUTPUT, 'output'],
  ];
  for (const [re, type] of extractors) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) {
      anns.push({ type, value: m[1] });
    }
  }
  return anns;
}

function extractMermaidBlock(skillMd: string): string | null {
  const m = skillMd.match(/```mermaid\s*\n([\s\S]*?)```/);
  return m ? m[1] : null;
}

function inferGuard(label: string): GuardType {
  for (const [pattern, guard] of GUARD_PATTERNS) {
    if (pattern.test(label)) return guard;
  }
  return 'always';
}

function labelToStepId(label: string): string {
  // Convert Chinese/mixed label to a usable step id
  return label
    .replace(/\s+/g, '_')
    .replace(/[^\w\u4e00-\u9fff-]/g, '')
    .toLowerCase();
}

// ── Parser ──

interface ParseResult {
  nodes: Map<string, RawNode>;
  transitions: RawTransition[];
  startTarget: string | null;
  terminalSources: string[];
}

function parseMermaid(mermaid: string): ParseResult {
  const nodes = new Map<string, RawNode>();
  const transitions: RawTransition[] = [];
  let startTarget: string | null = null;
  const terminalSources: string[] = [];

  const nestStack: string[] = [];

  const ensureNode = (name: string): RawNode => {
    if (!nodes.has(name)) {
      nodes.set(name, { name, isChoice: false, annotations: [] });
    }
    return nodes.get(name)!;
  };

  const prefixName = (name: string): string => {
    if (name === '[*]') return name;
    return nestStack.length > 0 ? `${nestStack[nestStack.length - 1]}.${name}` : name;
  };

  // Track first internal state per nested group for entry rewriting
  const nestedFirstChild = new Map<string, string>();

  const lines = mermaid.split('\n');
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    // Skip empty, diagram declaration, pure comment lines (unless they contain annotations on same line as transitions)
    if (!trimmed || trimmed === 'stateDiagram-v2') continue;
    if (trimmed.startsWith('%%') && !trimmed.includes('-->')) continue;

    // Nested close
    if (RE_NESTED_CLOSE.test(trimmed)) {
      nestStack.pop();
      continue;
    }

    // Choice declaration
    const choiceMatch = trimmed.match(RE_CHOICE);
    if (choiceMatch) {
      const name = prefixName(cleanStateName(choiceMatch[1]));
      const node = ensureNode(name);
      node.isChoice = true;
      continue;
    }

    // Nested open
    const nestedMatch = trimmed.match(RE_NESTED_OPEN);
    if (nestedMatch) {
      const parentName = prefixName(cleanStateName(nestedMatch[1]));
      ensureNode(parentName);
      nestStack.push(parentName);
      continue;
    }

    // Transition
    const transMatch = trimmed.match(RE_TRANSITION);
    if (transMatch) {
      const rawFrom = cleanStateName(transMatch[1].replace(/%%.*$/, '').trim());
      const rawTo = cleanStateName(transMatch[2].replace(/%%.*$/, '').trim());
      const labelPart = (transMatch[3] ?? '').replace(/%%.*$/, '').trim();
      const lineAnnotations = extractAnnotations(trimmed);

      const from = prefixName(rawFrom);
      const to = prefixName(rawTo);

      if (from !== '[*]') ensureNode(from);
      if (to !== '[*]') ensureNode(to);

      // Track first child in nested group
      if (nestStack.length > 0) {
        const parent = nestStack[nestStack.length - 1];
        if (!nestedFirstChild.has(parent)) {
          nestedFirstChild.set(parent, from === '[*]' ? to : from);
        }
      }

      if (from === '[*]') {
        startTarget = to;
      }
      if (to === '[*]') {
        terminalSources.push(from);
      }

      // Propagate annotations to target node
      if (to !== '[*]') {
        const targetNode = ensureNode(to);
        for (const ann of lineAnnotations) {
          if (ann.type !== 'guard') {
            targetNode.annotations.push(ann);
          }
        }
      }

      transitions.push({
        from,
        to,
        label: labelPart,
        annotations: lineAnnotations,
      });
      continue;
    }

    // Standalone annotation lines — attach to nothing (could be general comments)
  }

  // Rewrite transitions that target a composite state to target its first child
  for (const trans of transitions) {
    if (nestedFirstChild.has(trans.to)) {
      trans.to = nestedFirstChild.get(trans.to)!;
    }
    if (nestedFirstChild.has(trans.from)) {
      // If a composite state has outgoing transitions, rewrite from its last internal state
      // Actually, for simplicity, we leave from as-is since composite states
      // should have internal [*] --> X transitions
    }
  }

  // Update startTarget if it was rewritten
  if (startTarget && nestedFirstChild.has(startTarget)) {
    startTarget = nestedFirstChild.get(startTarget)!;
  }

  return { nodes, transitions, startTarget, terminalSources };
}

// ── Compiler ──

export function compileWorkflow(
  skillMd: string,
  skillId: string,
  version: number,
): CompileResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Step 1: Extract mermaid block
  const mermaid = extractMermaidBlock(skillMd);
  if (!mermaid) {
    errors.push('No mermaid code block found in skill markdown');
    return { spec: null, errors, warnings };
  }

  // Step 2: Parse
  const { nodes, transitions, startTarget, terminalSources } = parseMermaid(mermaid);

  // Step 6: Find startStepId
  if (!startTarget) {
    errors.push('No start transition found ([*] --> ...)');
    return { spec: null, errors, warnings };
  }

  // Step 7: Find terminal steps
  if (terminalSources.length === 0) {
    warnings.push('No terminal transitions found (... --> [*])');
  }

  // Build steps
  const steps: Record<string, WorkflowStep> = {};
  const stepIdSet = new Set<string>();

  // Determine step id for each node
  const nodeToStepId = new Map<string, string>();
  for (const [nodeName, node] of nodes) {
    const stepAnn = node.annotations.find(a => a.type === 'step');
    const stepId = stepAnn ? stepAnn.value : labelToStepId(nodeName);
    if (!stepId) {
      warnings.push(`Node "${nodeName}" could not derive a step id`);
      continue;
    }
    if (stepIdSet.has(stepId)) {
      errors.push(`Duplicate step id "${stepId}" from node "${nodeName}"`);
      continue;
    }
    stepIdSet.add(stepId);
    nodeToStepId.set(nodeName, stepId);
  }

  // Determine kind for each node
  const resolveKind = (node: RawNode, nodeName: string): StepKind => {
    // Priority: %% kind: > %% tool: (→ tool) > <<choice>> (→ switch) > terminal (→ end) > default llm
    const kindAnn = node.annotations.find(a => a.type === 'kind');
    if (kindAnn) {
      if (VALID_KINDS.has(kindAnn.value)) return normalizeKind(kindAnn.value) as StepKind;
      warnings.push(`Unknown kind "${kindAnn.value}" on node "${nodeName}", defaulting to llm`);
    }
    const toolAnn = node.annotations.find(a => a.type === 'tool');
    if (toolAnn) return 'tool';
    if (node.isChoice) return 'switch';
    if (terminalSources.includes(nodeName)) return 'end';
    return 'llm';
  };

  // Build WorkflowStep for each node
  for (const [nodeName, node] of nodes) {
    const stepId = nodeToStepId.get(nodeName);
    if (!stepId) continue;

    const kind = resolveKind(node, nodeName);
    const toolAnn = node.annotations.find(a => a.type === 'tool');
    const refAnn = node.annotations.find(a => a.type === 'ref');
    const outputAnn = node.annotations.find(a => a.type === 'output');

    // Build transitions for this node
    const nodeTransitions: WorkflowTransition[] = [];
    const outgoing = transitions.filter(t => t.from === nodeName && t.to !== '[*]');

    for (const trans of outgoing) {
      const targetStepId = nodeToStepId.get(trans.to);
      if (!targetStepId) {
        warnings.push(`Transition from "${nodeName}" targets unknown node "${trans.to}"`);
        continue;
      }

      // Determine guard
      const guardAnn = trans.annotations.find(a => a.type === 'guard');
      let guard: GuardType;
      if (guardAnn && VALID_GUARDS.has(guardAnn.value)) {
        guard = guardAnn.value as GuardType;
      } else if (guardAnn) {
        warnings.push(`Unknown guard "${guardAnn.value}" on transition "${nodeName}" -> "${trans.to}", using heuristic`);
        guard = trans.label ? inferGuard(trans.label) : 'always';
      } else if (trans.label) {
        guard = inferGuard(trans.label);
      } else {
        guard = 'always';
      }

      nodeTransitions.push({
        target: targetStepId,
        guard,
        ...(trans.label ? { label: trans.label } : {}),
      });
    }

    // Add terminal transition for nodes that go to [*]
    const toTerminal = transitions.some(t => t.from === nodeName && t.to === '[*]');
    // (terminal transitions are not added as WorkflowTransition — they're captured in terminalSteps)

    steps[stepId] = {
      id: stepId,
      label: nodeName,
      kind,
      ...(toolAnn ? { tool: toolAnn.value } : {}),
      ...(refAnn ? { ref: refAnn.value } : {}),
      ...(outputAnn ? { output: outputAnn.value } : {}),
      transitions: nodeTransitions,
    };
  }

  // Validation: choice nodes must have >= 2 exits
  for (const [nodeName, node] of nodes) {
    if (node.isChoice) {
      const stepId = nodeToStepId.get(nodeName);
      if (!stepId) continue;
      const step = steps[stepId];
      if (step && step.transitions.length < 2) {
        errors.push(`Choice node "${nodeName}" (step "${stepId}") has fewer than 2 exits (found ${step.transitions.length})`);
      }
    }
  }

  // Resolve startStepId
  const startStepId = nodeToStepId.get(startTarget);
  if (!startStepId) {
    errors.push(`Start target node "${startTarget}" has no step id`);
    return { spec: null, errors, warnings };
  }

  // Resolve terminalSteps
  const terminalSteps: string[] = [];
  for (const src of terminalSources) {
    const stepId = nodeToStepId.get(src);
    if (stepId) terminalSteps.push(stepId);
  }

  if (errors.length > 0) {
    return { spec: null, errors, warnings };
  }

  const spec: WorkflowSpec = {
    skillId,
    version,
    startStepId,
    steps,
    terminalSteps,
  };

  return { spec, errors, warnings };
}
