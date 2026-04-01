/**
 * Mermaid 图表工具函数
 *
 * 提取、高亮 mermaid 图表，支持 sequenceDiagram（rect）和 stateDiagram（classDef）。
 */

const CUSTOMER_GUIDANCE_SECTION_RE = /^##\s+客户引导状态图\s*$/m;

/**
 * Extract the primary mermaid block from SKILL.md content.
 * Prefers the `## 客户引导状态图` section; falls back to the first mermaid block in the document.
 */
export function extractPrimaryMermaidBlock(markdown: string): string | null {
  const sectionMatch = CUSTOMER_GUIDANCE_SECTION_RE.exec(markdown);
  if (sectionMatch) {
    const bodyStart = sectionMatch.index + sectionMatch[0].length;
    const nextHeadingRe = /^##\s+/gm;
    nextHeadingRe.lastIndex = bodyStart;
    const nextHeading = nextHeadingRe.exec(markdown);
    const sectionEnd = nextHeading ? nextHeading.index : markdown.length;
    const sectionBody = markdown.slice(bodyStart, sectionEnd);
    const scoped = sectionBody.match(/```mermaid\s*\r?\n([\s\S]*?)```/);
    if (scoped) return scoped[1];
  }

  const fallback = markdown.match(/```mermaid\s*\r?\n([\s\S]*?)```/);
  return fallback ? fallback[1] : null;
}

/** Extract the first ```mermaid ... ``` block from markdown (with label sanitization). */
export function extractMermaidFromContent(markdown: string): string | null {
  const match = markdown.match(/```mermaid\r?\n([\s\S]*?)```/);
  return match ? sanitizeStateDiagramLabels(match[1].trim()) : null;
}

/** Highlight the line annotated with `%% tool:<toolName>` (yellow). */
export function highlightMermaidTool(rawMermaid: string, toolName: string): string {
  return highlightMermaid(rawMermaid, `%% tool:${toolName}`, 'toolHL', 'fill:#fff3b0,stroke:#ffc800,stroke-width:2px');
}

/** Highlight the line annotated with `%% branch:<branchName>` (green). */
export function highlightMermaidBranch(rawMermaid: string, branchName: string): string {
  return highlightMermaid(rawMermaid, `%% branch:${branchName}`, 'branchHL', 'fill:#d4f5d4,stroke:#64dc78,stroke-width:2px');
}

/**
 * Strip `%% tool:xxx` and `%% branch:xxx` markers from mermaid output.
 * Call AFTER highlighting (which needs the markers) and BEFORE sending to the frontend.
 */
export function stripMermaidMarkers(mermaid: string): string {
  // Remove ALL %% annotations — progress state is now passed as a separate field
  return mermaid.replace(/\s*%%[^\n]*/g, '');
}

/**
 * Extract all state names from a stateDiagram-v2 mermaid block.
 * Collects names from transitions (`A --> B`) and state declarations (`state X`).
 * Excludes pseudo-states like `[*]` and `<<choice>>`.
 */
export function extractStateNames(mermaid: string): string[] {
  if (!isStateDiagram(mermaid)) return [];
  // Collect <<choice>> state names so we can exclude them
  const choiceStates = new Set<string>();
  for (const line of mermaid.split('\n')) {
    const choiceMatch = line.match(/^\s*state\s+(\S+)\s+<<choice>>/);
    if (choiceMatch) choiceStates.add(choiceMatch[1]);
  }
  const names = new Set<string>();
  for (const line of mermaid.split('\n')) {
    // Transition: A --> B  or  A --> B: label
    const transMatch = line.match(/^\s*(\S+)\s*-->\s*([^:\s]+)/);
    if (transMatch) {
      for (const n of [transMatch[1], transMatch[2]]) {
        if (n && n !== '[*]' && !choiceStates.has(n)) names.add(n);
      }
    }
    // State declaration: state X <<choice>>  or  state X {
    const stateMatch = line.match(/^\s*state\s+(\S+)\s/);
    if (stateMatch && !stateMatch[1].startsWith('<<') && !choiceStates.has(stateMatch[1])) {
      names.add(stateMatch[1]);
    }
  }
  return [...names];
}

/**
 * Extract transitions from a stateDiagram-v2 as "A --> B : label" lines.
 * Used to give the progress tracker LLM the full flow structure.
 */
export function extractTransitions(mermaid: string): string[] {
  if (!isStateDiagram(mermaid)) return [];
  const result: string[] = [];
  for (const line of mermaid.split('\n')) {
    const m = line.match(/^\s*(\S+)\s*-->\s*([^:\s]+)\s*(?::\s*(.+?))?(?:\s*%%.*)?$/);
    if (m) {
      const [, from, to, label] = m;
      if (from === '[*]' || to === '[*]') continue;
      result.push(label ? `${from} → ${to}（${label.trim()}）` : `${from} → ${to}`);
    }
  }
  return result;
}

/**
 * Highlight a specific state node by name (blue, for progress tracking).
 * Uses inline :::progressHL syntax on the FIRST transition that targets the state.
 */
export function highlightMermaidProgress(rawMermaid: string, stateName: string): string {
  if (!isStateDiagram(rawMermaid) || !stateName) return rawMermaid;
  const allStates = extractStateNames(rawMermaid);
  if (!allStates.includes(stateName)) return rawMermaid;

  // CJK state names are incompatible with Mermaid's ::: / class syntax in stateDiagram-v2.
  // Append a comment marker instead — the frontend applies highlighting via DOM after SVG render.
  return `${rawMermaid}\n%% progress:${stateName}`;
}

/**
 * Determine which mermaid branch to highlight based on diagnostic_steps returned by diagnose_network.
 * Returns a branch name matching the `%% branch:<name>` markers in SKILL.md.
 */
export function determineBranch(
  diagnosticSteps: Array<{ step: string; status: 'ok' | 'warning' | 'error' }>
): string {
  for (const s of diagnosticSteps) {
    if (s.status === 'ok') continue;
    const name = s.step;
    if (name === '账号状态检查' || name === 'Account Status') return 'account_error';
    if ((name === '流量余额检查' || name === 'Data Balance') && s.status === 'error') return 'data_exhausted';
    if (name === 'APN 配置检查' || name === 'APN Configuration') return 'apn_warning';
    if (name === '基站信号检测' || name === 'Base Station Signal') return 'signal_weak';
    if (name === '网络拥塞检测' || name === 'Network Congestion') return 'congestion';
  }
  return 'all_ok';
}

import type { WorkflowSpec } from './skill-workflow-types';

/**
 * Build a map of node label → node type (kind) from a compiled WorkflowSpec.
 * Used by frontend to color-code diagram nodes by type.
 */
export function buildNodeTypeMap(spec: WorkflowSpec): Record<string, string> {
  const map: Record<string, string> = {};
  for (const step of Object.values(spec.steps)) {
    if (!step.label) continue;
    map[step.label] = step.kind;
    // Also add short name (without nested prefix) for SVG ID matching
    // e.g., "账单查询流程.确认身份" → also add "确认身份"
    const dotIdx = step.label.lastIndexOf('.');
    if (dotIdx !== -1) {
      const shortName = step.label.substring(dotIdx + 1);
      if (!map[shortName]) map[shortName] = step.kind;
    }
  }
  return map;
}

// ── 内部函数 ──────────────────────────────────────────────────────────────────

/**
 * Extract the target state name from a stateDiagram transition line.
 * E.g. "    系统诊断 --> 分析诊断结果: some label %% tool:xxx" → "分析诊断结果"
 */
function extractTargetState(line: string): string | null {
  const m = line.match(/-->\s*([^:\s]+)/);
  return m ? m[1] : null;
}

/** Detect whether a mermaid block is a stateDiagram. */
function isStateDiagram(rawMermaid: string): boolean {
  return rawMermaid.trimStart().startsWith('stateDiagram');
}

/**
 * Sanitize stateDiagram transition labels to avoid Mermaid parser errors.
 * In stateDiagram-v2, `/` is reserved (UML event/action separator) and `→` can
 * cause lexical errors when used inside transition labels (text after `:`).
 */
function sanitizeStateDiagramLabels(rawMermaid: string): string {
  if (!isStateDiagram(rawMermaid)) return rawMermaid;
  return rawMermaid.split('\n').map(line => {
    // Only process transition lines (containing `-->` and `:`)
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1 || !line.includes('-->')) return line;
    const prefix = line.slice(0, colonIdx + 1);
    const label  = line.slice(colonIdx + 1);
    // Replace `/` and `→` in labels only (preserve %% comments)
    const commentIdx = label.indexOf('%%');
    const textPart    = commentIdx >= 0 ? label.slice(0, commentIdx) : label;
    const commentPart = commentIdx >= 0 ? label.slice(commentIdx)    : '';
    const sanitized = textPart.replace(/\//g, '、').replace(/→/g, '▸');
    return prefix + sanitized + commentPart;
  }).join('\n');
}

/**
 * Core highlight logic that supports both sequenceDiagram (rect) and stateDiagram (classDef).
 */
function highlightMermaid(rawMermaid: string, marker: string, className: string, classStyle: string): string {
  const lines = rawMermaid.split('\n');
  if (!lines.some((l) => l.includes(marker))) return rawMermaid;

  if (isStateDiagram(rawMermaid)) {
    // Check if any marked lines have a valid target state
    let hasTarget = false;
    for (const line of lines) {
      if (line.includes(marker) && extractTargetState(line)) { hasTarget = true; break; }
    }
    if (!hasTarget) return rawMermaid;

    const firstLine = lines[0];
    const classDef = `    classDef ${className} ${classStyle}`;
    // Use inline :::className syntax on marked transition lines
    // (the `class stateName className` syntax fails with non-ASCII state names)
    const modifiedLines = lines.slice(1).map(line => {
      if (!line.includes(marker)) return line;
      // Add space after :::className to separate from the : label (Mermaid requires it)
      return line.replace(/-->\s*([^:\s]+)(\s*:)?/, (_, stateName, colon) =>
        colon ? `--> ${stateName}:::${className} :` : `--> ${stateName}:::${className}`
      );
    });
    return `${firstLine}\n${classDef}\n${modifiedLines.join('\n')}`;
  }

  // sequenceDiagram: wrap matched lines in rect block
  const color = className === 'toolHL' ? 'rgba(255, 200, 0, 0.35)' : 'rgba(100, 220, 120, 0.4)';
  return lines
    .map((line) => {
      if (!line.includes(marker)) return line;
      const indent = line.match(/^(\s*)/)?.[1] ?? '';
      return `${indent}rect ${color}\n${indent}  ${line.trimStart()}\n${indent}end`;
    })
    .join('\n');
}
