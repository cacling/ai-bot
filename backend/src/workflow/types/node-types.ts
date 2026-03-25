/**
 * node-types.ts — Stable node type primitives for the workflow engine.
 *
 * These are engine-level primitives, not product-level names.
 * Product nodes (e.g., "问题分类器", "参数提取器") map to these primitives.
 */

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

  // governance / human-in-the-loop
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
