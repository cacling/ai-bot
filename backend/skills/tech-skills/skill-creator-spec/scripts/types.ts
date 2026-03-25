// skill-creator 校验脚本共享类型定义

export type Severity = 'error' | 'warning' | 'info';

export interface ValidationCheck {
  rule: string;
  severity: Severity;
  message: string;
  location?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationCheck[];
  warnings: ValidationCheck[];
  infos: ValidationCheck[];
}

export interface DraftInput {
  skill_name: string;
  skill_md: string;
  references: Array<{ filename: string }>;
  assets: Array<{ filename: string }>;
  registered_tools?: string[];
}

// ── 状态图解析中间结构 ──

export interface StateTransition {
  from: string;
  to: string;
  label: string;
  annotations: string[];
  line: number;
}

export interface StateNode {
  name: string;
  isChoice: boolean;
  isNested: boolean;
  line: number;
}

export interface MermaidAnnotation {
  type: 'tool' | 'ref' | 'branch' | 'step' | 'kind' | 'guard' | 'output';
  value: string;
  line: number;
  /** 该注释所在转移的目标节点 */
  targetState?: string;
}

export interface ParsedStateDiagram {
  states: StateNode[];
  transitions: StateTransition[];
  annotations: MermaidAnnotation[];
  hasStart: boolean;
  hasEnd: boolean;
}

// ── Frontmatter 解析结构 ──

export const VALID_MODES = ['inbound', 'outbound'] as const;
export const VALID_TRIGGERS = ['user_intent', 'task_dispatch'] as const;
export const VALID_CHANNELS = ['online', 'voice', 'outbound-collection', 'outbound-marketing'] as const;

export type SkillMode = typeof VALID_MODES[number];

export type StepKind =
  // New NodeType-aligned values (preferred)
  | 'start' | 'end' | 'llm' | 'classifier' | 'extractor' | 'retriever'
  | 'transform' | 'code' | 'state' | 'merge'
  | 'if' | 'switch' | 'foreach' | 'loop' | 'subflow'
  | 'tool' | 'http' | 'db'
  | 'human' | 'guard'
  // Legacy aliases (backward compat — compiler normalizes)
  | 'message' | 'ref' | 'confirm' | 'choice';
export type GuardType = 'tool.success' | 'tool.error' | 'tool.no_data' | 'user.confirm' | 'user.cancel' | 'always';

export interface ParsedFrontmatter {
  name?: string;
  description?: string;
  metadata?: {
    version?: string;
    tags?: string[];
    mode?: string;
    trigger?: string;
    channels?: string[];
  };
}

// ── 章节顺序 ──

export const REQUIRED_SECTIONS = [
  '触发条件',
  '工具与分类',
  '客户引导状态图',
  '升级处理',
  '合规规则',
  '回复规范',
] as const;
