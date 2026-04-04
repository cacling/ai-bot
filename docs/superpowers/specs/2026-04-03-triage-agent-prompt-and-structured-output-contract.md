# `triage-agent` Prompt 与 Structured Output Contract 设计

> 为 `ai-bot` 的 `triage-agent` 定义一套可落地的 prompt 和结构化输出协议。目标不是再写一个“会路由的 prompt”，而是把 `triage-agent` 变成一个受控的语义判定器：模型只负责给出有限集合内的结构化判断，最终路由、副作用、阈值裁决和 fallback 仍由确定性逻辑收口。

**Date**: 2026-04-03  
**Status**: Draft  
**Positioning**: Prompt + Contract Spec  
**Related Design**:
- [Triage Agent 与请求生命周期设计](./2026-04-03-triage-agent-and-request-lifecycle-design.md)
- [`triage-agent` 决策表与阈值设计](./2026-04-03-triage-agent-decision-table-and-threshold-design.md)
- [四 Agent 职责边界与 Handoff Contract 设计](./2026-04-03-four-agent-boundaries-and-handoff-contract.md)
- [四 Agent 评测与可观测性设计](./2026-04-03-four-agent-eval-and-observability-design.md)

**Related Current Code**:
- `backend/src/engine/runner.ts`
- `backend/src/engine/llm.ts`
- `backend/src/services/query-normalizer/llm-fallback.ts`

---

## 1. 为什么还需要单独定义 Prompt 与 Contract

前面的文档已经把 `triage-agent` 的：

- 决策类型
- 候选分数
- 阈值
- 硬规则
- 执行动作

基本定义清楚了。

但如果不把 prompt 和输出 contract 单独钉住，真实实现时仍然很容易退化成以下坏模式：

1. 模型输出自由文本解释，后端再从文本里猜决策。
2. 模型直接决定副作用，比如“新建 handoff”或“恢复 runtime”。
3. prompt 越堆越长，把所有路由策略都塞进自然语言里。
4. schema 不稳定，导致线上解析失败只能 fallback 到老路由。
5. 多轮后文越带越多，`triage-agent` 变成另一个大上下文聊天机器人。

所以这份文档要明确一个原则：

> `triage-agent` 的模型层只负责“语义判断”，不负责“系统动作执行”。

---

## 2. 核心结论

### 2.1 模型输出的是“判定对象”，不是“执行计划”

推荐 `triage-agent` 的模型层只输出：

- 当前主意图
- 当前与 active workflow 的关系
- 5 类候选动作分数
- 原因码
- 可选的澄清问题
- 可选的知识查询串

不输出：

- 直接调用哪个后端函数
- 是否创建 handoff 记录
- 是否复用当前 handoff
- 是否恢复某个 instance

这些应该由后端根据：

- 硬规则
- 状态机
- 阈值
- `router_action` 映射

来决定。

### 2.2 Prompt 要短、稳、约束强

`triage-agent` 不是最终回答模型，所以 prompt 不需要：

- 客服话术
- 大量业务知识
- 工具说明

它只需要知道：

- 自己是什么角色
- 允许输出什么
- 哪些情况要保守
- 哪些情况不能猜

### 2.3 结构化输出优先使用 `generateObject` / schema 约束

仓库里已经有成熟先例：

- [llm-fallback.ts](../../../backend/src/services/query-normalizer/llm-fallback.ts) 使用 `generateObject + zod`
- [runner.ts](../../../backend/src/engine/runner.ts) 里也在用 `jsonSchema(...)`

所以 `triage-agent` 最自然的实现路线就是：

- `generateObject`
- `zod schema`
- timeout + fallback

---

## 3. 职责切分

## 3.1 模型层负责什么

模型层负责：

- 读当前消息
- 结合少量结构化状态判断语义关系
- 给出候选动作分数
- 提供理由码和少量辅助字段

## 3.2 确定性路由层负责什么

确定性层负责：

- Layer 0 硬规则优先命中
- 合并模型分数与规则分数
- 应用阈值
- 产出最终 `decision_type`
- 计算最终 `router_action`
- 调度 `service / knowledge / human-support / clarification`

## 3.3 为什么要这样切

因为如果让模型同时做：

- 语义理解
- 状态机判断
- 系统动作执行

那么后果通常就是：

- 好解释的部分变得不好测试
- 不该猜的部分开始乱猜
- 出错后无法定位到底是理解错还是执行错

---

## 4. 推荐的 Prompt 输入形态

## 4.1 不要直接拼整段聊天历史

`triage-agent` 的 prompt 输入应尽量短。

推荐只给：

- 当前用户消息
- 当前 session 的轻量状态摘要
- active workflow 摘要
- human bridge / resume 状态
- 最近意图与 summary

不建议给：

- 全量历史消息
- 工具原始结果
- 全量工单 timeline

## 4.2 推荐的输入对象

```ts
interface TriagePromptInput {
  session: {
    session_id: string;
    active_agent?: string | null;
    route_status?: string | null;
    latest_intent?: string | null;
    latest_summary?: string | null;
  };
  workflow: {
    exists: boolean;
    instance_id?: string | null;
    skill_id?: string | null;
    current_step_id?: string | null;
    pending_confirm?: boolean;
    finished?: boolean;
  };
  human_bridge: {
    latest_handoff_status?: 'none' | 'created' | 'accepted' | 'waiting_human' | 'resume_ready' | 'completed';
    active_handoff_id?: string | null;
    resume_token_present: boolean;
    resume_context_present: boolean;
    resume_context_expired?: boolean;
  };
  hints: {
    recent_intents?: string[];
    memory_hints?: string[];
  };
  message: {
    channel: 'online' | 'voice' | 'outbound';
    user_message: string;
    lang: 'zh' | 'en';
  };
}
```

## 4.3 prompt 上下文应是“结构化状态”，不是“自然语言摘要大杂烩”

推荐把上面的输入对象直接 JSON 化给模型。

原因：

- schema 更稳定
- 更易做 replay
- 更易做 case-based eval

---

## 5. 推荐的 System Prompt 骨架

下面是一版建议骨架，定位是“控制器”，不是“客服”。

```txt
你是 ai-bot 的 triage-agent。

你的唯一职责是判断当前用户输入应该进入哪条处理路径：
- resume_service
- start_service
- request_knowledge
- handoff_human_support
- ask_clarification

你不是业务执行器，不是知识回答器，也不是工单创建器。

你必须遵守这些规则：
1. 只输出结构化 JSON，严格符合给定 schema。
2. 不要输出最终客服回复。
3. 不要决定系统副作用，例如创建 handoff、恢复实例、调用工具。
4. 如果不确定，不要猜；通过 candidate_scores 降低分数，并在必要时倾向 ask_clarification。
5. 如果用户明确要求人工，handoff_human_support 必须明显高于其他选项。
6. 如果已有 active workflow 且用户输入明显属于同一话题，resume_service 应优先。
7. 如果输入像纯规则/解释/依据请求，request_knowledge 可以升高，但不要把明显业务办理误判成纯知识请求。
8. 当两个高分候选相近时，优先保守，倾向 ask_clarification。

你要输出：
- primary_intent
- topic_relation
- candidate_scores
- reason_codes
- optional clarification_question
- optional knowledge_query

不要添加 schema 之外的字段。
```

## 5.1 这个 Prompt 故意不包含什么

故意不包含：

- 具体业务规则
- 具体工具名
- 工单字段解释
- 回复用户的话术

因为这些都不是 `triage-agent` 的职责。

---

## 6. 推荐的 Structured Output Contract

## 6.1 推荐主 schema

```ts
const TriageModelSchema = z.object({
  primary_intent: z.string().describe('当前主意图，如 bill_inquiry, temporary_service_suspension, human_request'),

  topic_relation: z.enum(['same_topic', 'possible_switch', 'clear_switch'])
    .describe('当前消息与 active workflow 的关系'),

  candidate_scores: z.object({
    resume_service: z.number().int().min(0).max(100),
    start_service: z.number().int().min(0).max(100),
    request_knowledge: z.number().int().min(0).max(100),
    handoff_human_support: z.number().int().min(0).max(100),
    ask_clarification: z.number().int().min(0).max(100),
  }).describe('5 个候选动作分数'),

  reason_codes: z.array(z.string()).max(8)
    .describe('简短理由码，如 explicit_human_request, active_workflow_same_topic'),

  slot_hints: z.record(z.string()).default({})
    .describe('可选槽位提示，只放高置信小字段，例如 month=上个月'),

  clarification_question: z.string().nullable()
    .describe('仅在 ask_clarification 候选较高时填写'),

  knowledge_query: z.string().nullable()
    .describe('仅在 request_knowledge 候选较高时填写，作为知识检索查询串'),
});
```

## 6.2 字段约束

### `primary_intent`

要求：

- 可以是规范意图码
- 也可以是较稳定的业务语义标签
- 不要求百分之百枚举固定，但应尽量落在可统计范围内

### `topic_relation`

要求：

- 只能三选一
- 若无 active workflow，也必须输出一个值
- 无 active workflow 时通常输出 `clear_switch` 或 `same_topic` 都可，但建议通过系统说明倾向 `clear_switch`

### `candidate_scores`

要求：

- 五个字段必须都给
- 分数不是概率，不要求总和 100
- 允许多个高分，但应体现相对倾向

### `reason_codes`

要求：

- 用短 code，不用长句子
- 便于日志、eval、dashboard 聚合

建议示例：

- `explicit_human_request`
- `active_workflow_same_topic`
- `active_workflow_pending_confirm`
- `clear_new_service_request`
- `pure_information_request`
- `multi_intent_conflict`
- `low_confidence_needs_clarification`
- `resume_context_present`

### `slot_hints`

要求：

- 只放高置信简单槽位
- 不要放复杂业务承诺

### `clarification_question`

要求：

- 最多一句
- 面向用户、可直接显示
- 若非澄清主候选，应返回 `null`

### `knowledge_query`

要求：

- 不要照搬用户整段原话
- 应是较标准化的检索句或关键词串
- 若非知识候选，应返回 `null`

---

## 7. 推荐的输出不变量

为了让后端更容易信任模型结果，推荐加这些不变量检查：

1. `candidate_scores` 五项都必须在 `0..100`
2. `reason_codes.length >= 1`
3. 如果 `handoff_human_support >= 90`，`reason_codes` 至少包含一条人工相关理由
4. 如果 `clarification_question != null`，则 `ask_clarification >= 60`
5. 如果 `knowledge_query != null`，则 `request_knowledge >= 60`
6. 如果 `topic_relation = same_topic` 且 active workflow 存在，则 `resume_service` 不应极低

这些检查不一定都要阻断，但至少应记录 warning。

---

## 8. 建议的 Prompt 组装方式

## 8.1 推荐分成三段

### 段 1：系统角色与硬约束

放：

- 角色定义
- 输出限制
- 不允许做的事

### 段 2：当前结构化上下文

放：

- `TriagePromptInput` 的 JSON

### 段 3：用户任务说明

例如：

```txt
请根据上述上下文，输出符合 schema 的 triage 判定结果。
不要输出解释性 prose，不要输出 markdown，不要输出 schema 之外字段。
```

## 8.2 不建议把状态信息写成大量自然语言

不推荐：

```txt
当前会话好像在办理停机保号，可能还在等待人工，但也不确定……
```

推荐：

```json
{
  "workflow": { "exists": true, "skill_id": "service-suspend", "pending_confirm": false },
  "human_bridge": { "latest_handoff_status": "waiting_human" }
}
```

---

## 9. 运行时调用建议

## 9.1 推荐调用方式

最自然的实现方式是：

```ts
const result = await generateObject({
  model: TRIAGE_MODEL,
  schema: TriageModelSchema,
  prompt: buildTriagePrompt(input),
});
```

## 9.2 推荐使用轻量但稳定的模型

`triage-agent` 的需求不是深推理，而是：

- 低延迟
- 结构化输出稳定
- 分类边界稳定

因此它通常不需要和 `service-agent` 共用最强模型。

更适合：

- 一个较快的小模型或中模型
- timeout 严格

## 9.3 推荐超时

建议：

- 正常 timeout：`1500ms - 2500ms`
- 超时后 fallback：不阻塞整条链路

原因：

- triage 是前门
- 前门不能因为一个慢模型把整条会话卡住

---

## 10. 失败与回退策略

## 10.1 schema 解析失败

推荐：

1. 记录 warning
2. 若 Layer 0 或规则分已有强结论，则走规则结论
3. 否则回退 `ask_clarification`

不建议：

- 因 schema 失败直接退回 legacy agent 自由聊天

## 10.2 模型超时

推荐：

- 优先走规则路径
- 无规则强结论时，默认 `ask_clarification`

## 10.3 明显不可信输出

例如：

- 五项全 100
- `knowledge_query` 填了，但 `request_knowledge` 只有 10
- 明显缺少 reason codes

推荐：

- 视为低置信
- 回退 `ask_clarification`

---

## 11. 示例

## 11.1 用户明确要求人工

### 输入摘要

```json
{
  "workflow": { "exists": false },
  "human_bridge": { "latest_handoff_status": "none", "resume_token_present": false, "resume_context_present": false },
  "message": { "user_message": "我不想和机器人说了，转人工。", "channel": "online", "lang": "zh" }
}
```

### 推荐输出

```json
{
  "primary_intent": "human_request",
  "topic_relation": "clear_switch",
  "candidate_scores": {
    "resume_service": 0,
    "start_service": 5,
    "request_knowledge": 0,
    "handoff_human_support": 98,
    "ask_clarification": 5
  },
  "reason_codes": ["explicit_human_request"],
  "slot_hints": {},
  "clarification_question": null,
  "knowledge_query": null
}
```

## 11.2 active workflow 下的继续办理

### 输入摘要

```json
{
  "workflow": { "exists": true, "skill_id": "service-suspend", "current_step_id": "confirm_duration", "pending_confirm": true },
  "message": { "user_message": "可以，就按三个月办。", "channel": "online", "lang": "zh" }
}
```

### 推荐输出

```json
{
  "primary_intent": "temporary_service_suspension",
  "topic_relation": "same_topic",
  "candidate_scores": {
    "resume_service": 95,
    "start_service": 5,
    "request_knowledge": 0,
    "handoff_human_support": 0,
    "ask_clarification": 3
  },
  "reason_codes": ["active_workflow_same_topic", "pending_confirm_resolved"],
  "slot_hints": { "duration": "3个月" },
  "clarification_question": null,
  "knowledge_query": null
}
```

## 11.3 模糊多意图

### 输入摘要

```json
{
  "workflow": { "exists": true, "skill_id": "bill-inquiry", "current_step_id": "show_summary", "pending_confirm": false },
  "message": { "user_message": "另外我还想问停机保号怎么办，顺便这个费用怎么算？", "channel": "online", "lang": "zh" }
}
```

### 推荐输出

```json
{
  "primary_intent": "multi_intent_mixed",
  "topic_relation": "possible_switch",
  "candidate_scores": {
    "resume_service": 40,
    "start_service": 48,
    "request_knowledge": 35,
    "handoff_human_support": 5,
    "ask_clarification": 76
  },
  "reason_codes": ["multi_intent_conflict", "possible_topic_switch"],
  "slot_hints": {},
  "clarification_question": "您是想先继续看当前费用，还是先了解停机保号？",
  "knowledge_query": null
}
```

---

## 12. 明确的反模式

## 12.1 让模型直接输出 `router_action`

不推荐。

原因：

- 它会把语义判定和系统副作用耦合在一起
- 也更容易重复建 handoff、重复 resume

## 12.2 让模型直接写用户回复

不推荐。

这是 `service-agent` 或 clarification 响应层的职责，不是 triage 层。

## 12.3 把大量业务知识塞进 triage prompt

不推荐。

triage 不是业务专家，它是前门控制器。

## 12.4 为了“看起来更智能”而放松 schema

不推荐。

对 triage 来说，格式稳定比措辞漂亮重要得多。

---

## 13. 与后端接口的衔接建议

## 13.1 模型输出到最终路由的转换

推荐形态：

```txt
model output
-> invariant checks
-> merge with Layer 0 / rule scores
-> threshold resolution
-> decision_type
-> router_action
```

## 13.2 当前阶段最适合返回给上层的对象

```ts
interface TriageResolvedDecision {
  decision_type: 'resume_service' | 'start_service' | 'request_knowledge' | 'handoff_human_support' | 'ask_clarification';
  router_action: 'resume_active_instance' | 'start_new_service_flow' | 'dispatch_knowledge_request' | 'create_handoff' | 'reuse_waiting_handoff' | 'emit_clarification';
  primary_intent: string;
  confidence: number;
  reason_codes: string[];
  slot_hints: Record<string, string>;
  clarification_question?: string | null;
  knowledge_query?: string | null;
}
```

这正好衔接前一份 `decision table` 文档。

---

## 14. 当前阶段的默认建议

如果现在就要给 `ai-bot` 上一版 `triage-agent`，我的建议是：

1. 模型层用 `generateObject + zod`
2. prompt 只保留路由角色与硬约束，不带业务大知识
3. 模型只输出候选分数和理由码
4. 最终 `decision_type / router_action` 由后端确定
5. schema 失败、超时、输出异常时，一律走保守 fallback

一句话：

> 让模型做“判定器”，不要让模型做“调度器”。

---

## 15. 最终结论

`triage-agent` 想真正稳定，关键不是 prompt 写得多像人，而是：

- prompt 足够窄
- schema 足够硬
- 模型只负责语义
- 系统动作由确定性代码执行

这样它才会从“会说路由理由的模型”变成“可实现、可评测、可回放的前门判定器”。

一句话总结：

> `triage-agent` 的 prompt 应该收窄到只负责判断，越少承担副作用，整个系统越稳。 
