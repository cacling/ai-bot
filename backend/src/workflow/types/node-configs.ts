/**
 * node-configs.ts — Configuration interfaces for each node type.
 *
 * Each NodeType has a corresponding config interface that defines
 * how that node behaves at runtime.
 */

// Shared utility type
export type JsonSchema = Record<string, unknown>;

// ── Execution policies (node attributes, not node types) ──────────

export interface RetryPolicy {
  enabled: boolean;
  maxAttempts?: number;
  backoffMs?: number;
  strategy?: "fixed" | "linear" | "exponential";
}

export interface ErrorPolicy {
  mode: "fail" | "continue" | "route";
  routeToPortId?: string;
}

// ── Lifecycle nodes ───────────────────────────────────────────────

export interface StartNodeConfig {
  triggerType: "manual" | "chat" | "webhook" | "schedule" | "subflow";
  inputSchema?: JsonSchema;
  defaults?: Record<string, unknown>;
}

export interface EndNodeConfig {
  outputMode: "object" | "text" | "chat_message" | "none";
  outputTemplate?: string;
  outputMapping?: Record<string, string>;
}

// ── AI nodes ──────────────────────────────────────────────────────

export interface LlmNodeConfig {
  provider?: string;
  model: string;
  systemPrompt?: string;
  userPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  inputMapping?: Record<string, string>;
  outputKey?: string;
  responseFormat?: "text" | "json";
  jsonSchema?: JsonSchema;
  tools?: string[];
}

export interface ClassifierNodeConfig {
  mode: "rule" | "llm" | "embedding";
  inputKey: string;
  classes: Array<{
    id: string;
    label: string;
    description?: string;
    rule?: string;
  }>;
  outputKey?: string;
}

export interface ExtractorNodeConfig {
  mode: "llm" | "regex" | "schema";
  inputKey: string;
  schema?: JsonSchema;
  examples?: Array<Record<string, unknown>>;
  outputKey?: string;
}

export interface RetrieverNodeConfig {
  sourceType: "knowledge" | "vector" | "search" | "document";
  sourceRef: string;
  queryKey: string;
  topK?: number;
  scoreThreshold?: number;
  outputKey?: string;
}

// ── Data processing nodes ─────────────────────────────────────────

export interface TransformNodeConfig {
  mode: "map" | "template" | "jsonata" | "filter" | "flatten" | "pick";
  inputMapping?: Record<string, string>;
  template?: string;
  expression?: string;
  outputKey?: string;
}

export interface CodeNodeConfig {
  runtime: "javascript" | "python";
  source: string;
  inputMapping?: Record<string, string>;
  outputKey?: string;
}

export interface StateNodeConfig {
  operations: Array<{
    key: string;
    op: "set" | "append" | "delete" | "increment";
    value?: unknown;
    from?: string;
  }>;
}

export interface MergeNodeConfig {
  mode: "all" | "any" | "concat" | "object_merge";
  outputKey?: string;
}

// ── Control flow nodes ────────────────────────────────────────────

export interface IfNodeConfig {
  expression: string;
}

export interface SwitchNodeConfig {
  expression: string;
  cases: Array<{
    id: string;
    label: string;
    match: string;
  }>;
  defaultPortId?: string;
}

export interface ForEachNodeConfig {
  itemsPath: string;
  itemName?: string;
  indexName?: string;
  parallel?: boolean;
  maxConcurrency?: number;
}

export interface LoopNodeConfig {
  initState?: Record<string, unknown>;
  condition: string;
  maxIterations?: number;
}

export interface SubflowNodeConfig {
  workflowId: string;
  version?: string;
  inputMapping?: Record<string, string>;
  outputKey?: string;
}

// ── External action nodes ─────────────────────────────────────────

export interface ToolNodeConfig {
  toolRef: string;
  connectorRef?: string;
  inputMapping?: Record<string, string>;
  outputKey?: string;
}

export interface HttpNodeConfig {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  bodyTemplate?: string;
  connectorRef?: string;
  outputKey?: string;
}

export interface DbNodeConfig {
  operation: "query" | "execute" | "insert" | "update" | "delete";
  connectorRef: string;
  statement: string;
  params?: Record<string, string>;
  outputKey?: string;
}

// ── Governance nodes ──────────────────────────────────────────────

export interface HumanNodeConfig {
  mode: "approve" | "review" | "input";
  formSchema?: JsonSchema;
  timeoutMs?: number;
  outputKey?: string;
}

export interface GuardNodeConfig {
  mode: "rule" | "policy" | "risk";
  expression?: string;
  policyRef?: string;
  failMessage?: string;
}
