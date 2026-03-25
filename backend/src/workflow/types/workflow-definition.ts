import { NodeType, PortKind } from './node-types';
import type {
  RetryPolicy, ErrorPolicy,
  StartNodeConfig, EndNodeConfig, LlmNodeConfig, ClassifierNodeConfig,
  ExtractorNodeConfig, RetrieverNodeConfig, TransformNodeConfig, CodeNodeConfig,
  StateNodeConfig, MergeNodeConfig, IfNodeConfig, SwitchNodeConfig,
  ForEachNodeConfig, LoopNodeConfig, SubflowNodeConfig, ToolNodeConfig,
  HttpNodeConfig, DbNodeConfig, HumanNodeConfig, GuardNodeConfig,
} from './node-configs';

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

export type WorkflowNode =
  | BaseNode<NodeType.Start, StartNodeConfig>
  | BaseNode<NodeType.End, EndNodeConfig>
  | BaseNode<NodeType.LLM, LlmNodeConfig>
  | BaseNode<NodeType.Classifier, ClassifierNodeConfig>
  | BaseNode<NodeType.Extractor, ExtractorNodeConfig>
  | BaseNode<NodeType.Retriever, RetrieverNodeConfig>
  | BaseNode<NodeType.Transform, TransformNodeConfig>
  | BaseNode<NodeType.Code, CodeNodeConfig>
  | BaseNode<NodeType.State, StateNodeConfig>
  | BaseNode<NodeType.Merge, MergeNodeConfig>
  | BaseNode<NodeType.If, IfNodeConfig>
  | BaseNode<NodeType.Switch, SwitchNodeConfig>
  | BaseNode<NodeType.ForEach, ForEachNodeConfig>
  | BaseNode<NodeType.Loop, LoopNodeConfig>
  | BaseNode<NodeType.Subflow, SubflowNodeConfig>
  | BaseNode<NodeType.Tool, ToolNodeConfig>
  | BaseNode<NodeType.Http, HttpNodeConfig>
  | BaseNode<NodeType.Db, DbNodeConfig>
  | BaseNode<NodeType.Human, HumanNodeConfig>
  | BaseNode<NodeType.Guard, GuardNodeConfig>;

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
