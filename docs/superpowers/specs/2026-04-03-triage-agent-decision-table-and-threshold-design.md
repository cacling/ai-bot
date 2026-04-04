# `triage-agent` 决策表与阈值设计

> 在四 Agent 架构下，把 `triage-agent` 从“概念上的前门控制器”继续收敛成“可以直接指导实现的路由规范”。这份文档不再只讲原则，而是明确：输入信号有哪些、硬规则怎么优先、候选动作怎么打分、阈值怎么设、什么时候澄清、什么时候恢复、什么时候请求知识、什么时候转人工，以及它与当前 `chat.ts / skill-router.ts` 的落地关系。

**Date**: 2026-04-03  
**Status**: Draft  
**Positioning**: Runtime-first Router Spec  
**Related Design**:
- [Triage Agent 与请求生命周期设计](./2026-04-03-triage-agent-and-request-lifecycle-design.md)
- [四 Agent 职责边界与 Handoff Contract 设计](./2026-04-03-four-agent-boundaries-and-handoff-contract.md)
- [四 Agent 数据库表结构与 API Contract 草案](./2026-04-03-four-agent-db-and-api-contract.md)
- [`human-support-agent` 工作台协作与 `resume_context` 回流协议设计](./2026-04-03-human-support-agent-workstation-and-resume-protocol.md)
- [四 Agent 评测与可观测性设计](./2026-04-03-four-agent-eval-and-observability-design.md)

**Related Current Code**:
- `backend/src/chat/chat.ts`
- `backend/src/engine/skill-router.ts`
- `backend/src/engine/skill-runtime.ts`

---

## 1. 为什么还需要这份文档

前一份 triage 设计已经回答了：

- `triage-agent` 是前门控制器
- 决策栈是“硬规则 + 状态判断 + LLM + fallback”
- 主要输出有 5 类：
  - `resume_service`
  - `start_service`
  - `request_knowledge`
  - `handoff_human_support`
  - `ask_clarification`

但如果不继续细化成“决策表 + 阈值”，真正实现时仍然会遇到 5 个典型问题：

1. 同一个 `decision_type` 是否一定对应同一个执行动作。
2. `active_human_waiting` 和“再次要求人工”发生冲突时到底怎么处理。
3. `resume_service` 和 `start_service` 的边界怎么稳定判。
4. `request_knowledge` 和 `ask_clarification` 谁更保守、什么时候切换。
5. 当前代码中 `routeSkill(sessionId)` 只会“找 active instance”，怎样升级成真正的 runtime-first router。

因此这份文档要做的不是重复讲方向，而是把这些实现边界钉住。

---

## 2. 当前代码状态与目标差距

## 2.1 当前入口仍然是 legacy-first

当前 [chat.ts](../../../backend/src/chat/chat.ts) 的关键顺序是：

1. 读 session / history
2. 调 `routeSkill(sessionId)`
3. 只有发现 active runtime instance 才走 runtime
4. 否则直接 `runAgent()`
5. 事后再根据 `skill_diagram` 决定是否补建 runtime instance

这意味着：

- `triage-agent` 还不存在为真正的前门
- 新请求默认先进 legacy agent
- runtime 更像“已进入某个 skill 后的恢复器”，不是系统主入口

## 2.2 当前 `skill-router.ts` 本质还是“active instance detector”

当前 [skill-router.ts](../../../backend/src/engine/skill-router.ts) 只回答一个问题：

- 这个 session 有没有 active instance

它并不回答：

- 当前消息是不是新开业务
- 当前消息是不是知识请求
- 当前消息是不是要人工
- 当前消息是不是应该澄清

## 2.3 目标态

目标应该是：

```txt
chat request
-> triage-agent runtime-first router
-> service / knowledge / human-support / clarification
```

而不是：

```txt
chat request
-> legacy runAgent
-> 事后再看看要不要进入 runtime
```

---

## 3. 核心结论

### 3.1 先分清“决策类型”和“执行动作”

推荐在实现层显式区分两个概念：

1. `decision_type`
2. `router_action`

原因：

- 同样是 `handoff_human_support`
- 有时是“新建 handoff”
- 有时是“复用当前 waiting_human 的 handoff，不再新建”

如果不拆开，后面会出现：

- 决策字段对了
- 执行动作却错了

### 3.2 `triage-agent` 的输出不应只是一句分类结果

推荐输出至少包含：

- 决策类型
- 目标 Agent
- 置信度
- 原因码
- 是否需要新建 handoff / 复用 handoff
- 是否恢复 active instance
- 是否新建 service 流程
- 是否发澄清问题

### 3.3 当前阶段推荐“偏保守”阈值

推荐 triage 的默认路线是：

- 有明确主线时坚决执行
- 有冲突时优先澄清
- 不为追求自动化去强行 start / resume

一句话：

> 前门最重要的不是“聪明”，而是“别把活交错人”。

---

## 4. 推荐的输入信号集合

## 4.1 Session 状态信号

```ts
interface TriageSessionSignals {
  session_id: string;
  active_agent?: 'triage-agent' | 'service-agent' | 'knowledge-agent' | 'human-support-agent' | null;
  route_status?: 'idle' | 'routing' | 'executing' | 'waiting_knowledge' | 'waiting_human' | 'paused' | null;
  active_skill_id?: string | null;
  active_instance_id?: string | null;
  active_handoff_id?: string | null;
  latest_intent?: string | null;
  latest_summary?: string | null;
}
```

## 4.2 Runtime 状态信号

```ts
interface TriageRuntimeSignals {
  active_workflow: {
    exists: boolean;
    instance_id?: string | null;
    skill_id?: string | null;
    current_step_id?: string | null;
    pending_confirm?: boolean;
    finished?: boolean;
  };
}
```

## 4.3 Handoff / Resume 信号

```ts
interface TriageHumanBridgeSignals {
  latest_handoff_status?: 'none' | 'created' | 'accepted' | 'waiting_human' | 'resume_ready' | 'completed';
  active_handoff_id?: string | null;
  resume_token_present: boolean;
  resume_context_present: boolean;
  resume_context_expired?: boolean;
}
```

## 4.4 消息语义信号

```ts
interface TriageMessageSignals {
  user_message: string;
  explicit_human_request: boolean;
  explicit_cancel: boolean;
  explicit_confirm: boolean;
  explicit_topic_switch: boolean;
  explicit_new_request: boolean;
  pure_information_request: boolean;
  likely_service_intent: boolean;
  likely_multi_intent: boolean;
  asr_noise_risk: 'low' | 'medium' | 'high';
}
```

## 4.5 语义相似度与上下文关系信号

```ts
interface TriageRelationSignals {
  same_topic_score: number;       // 0-100
  new_topic_score: number;        // 0-100
  active_workflow_relevance: number; // 0-100
  knowledge_need_score: number;   // 0-100
  service_start_score: number;    // 0-100
  handoff_need_score: number;     // 0-100
}
```

这些可以来自：

- 规则特征
- 轻量分类器
- LLM 结构化输出

---

## 5. 决策类型与执行动作

## 5.1 决策类型

保持之前定义的 5 类不变：

```ts
type TriageDecisionType =
  | 'resume_service'
  | 'start_service'
  | 'request_knowledge'
  | 'handoff_human_support'
  | 'ask_clarification';
```

## 5.2 执行动作

推荐新增一层更接近 runtime 的动作：

```ts
type TriageRouterAction =
  | 'resume_active_instance'
  | 'start_new_service_flow'
  | 'dispatch_knowledge_request'
  | 'create_handoff'
  | 'reuse_waiting_handoff'
  | 'emit_clarification';
```

## 5.3 为什么必须分两层

例如：

### 场景 A

用户说：“我要人工。”

输出可能是：

- `decision_type = handoff_human_support`
- `router_action = create_handoff`

### 场景 B

当前已经 `waiting_human`，用户又说：“你快点转人工啊。”

输出更合理的是：

- `decision_type = handoff_human_support`
- `router_action = reuse_waiting_handoff`

如果没有 `router_action`，系统很容易重复建单、重复建 handoff。

---

## 6. Layer 0：硬规则决策表

这层不需要 LLM，直接裁决。

## 6.1 硬规则表

| 优先级 | 条件 | `decision_type` | `router_action` | 说明 |
| --- | --- | --- | --- | --- |
| P0 | `resume_token_present = true` 且未过期 | `resume_service` | `resume_active_instance` | 人工回流信号优先于一般自然语言判断 |
| P1 | `route_status = waiting_human` 且 `latest_handoff_status in {created, accepted, waiting_human}` | `handoff_human_support` | `reuse_waiting_handoff` | 避免重复转人工 |
| P2 | `explicit_human_request = true` 且不在 waiting_human | `handoff_human_support` | `create_handoff` | 用户明确要求人工 |
| P3 | 存在强安全/合规阻断 | `handoff_human_support` | `create_handoff` | 不继续自动化 |
| P4 | `active_workflow.exists = true` 且 `pending_confirm = true` 且 `explicit_confirm or explicit_cancel` | `resume_service` | `resume_active_instance` | 确认/取消优先恢复原流程 |
| P5 | `active_workflow.exists = true` 且消息是同话题补充 | `resume_service` | `resume_active_instance` | 默认恢复，而非新开 |

## 6.2 这层的实现原则

- 命中即返回
- 不进入 LLM 裁决
- 必须可解释
- 必须可单测

---

## 7. Layer 1：候选动作打分

如果 Layer 0 没命中，则进入打分。

## 7.1 推荐维护 5 个候选分数

```ts
interface TriageCandidateScores {
  resume_service: number;         // 0-100
  start_service: number;          // 0-100
  request_knowledge: number;      // 0-100
  handoff_human_support: number;  // 0-100
  ask_clarification: number;      // 0-100
}
```

## 7.2 推荐的加权信号

### `resume_service`

推荐加分项：

- 有 active workflow：`+30`
- `same_topic_score >= 70`：`+30`
- `active_workflow_relevance >= 70`：`+20`
- 用户是确认/取消/补充：`+15`

推荐减分项：

- `explicit_topic_switch = true`：`-40`
- `new_topic_score >= 75`：`-30`
- `explicit_human_request = true`：`-100`

### `start_service`

推荐加分项：

- `likely_service_intent = true`：`+35`
- `service_start_score >= 70`：`+25`
- 无 active workflow：`+10`
- `explicit_new_request = true`：`+20`

推荐减分项：

- `pure_information_request = true`：`-30`
- `explicit_human_request = true`：`-100`

### `request_knowledge`

推荐加分项：

- `pure_information_request = true`：`+35`
- `knowledge_need_score >= 70`：`+25`
- 当前没有 active workflow：`+10`
- 问题明显要求规则/解释/依据：`+20`

推荐减分项：

- 当前已是明确业务办理：`-30`
- 用户明确要求人工：`-100`

### `handoff_human_support`

推荐加分项：

- `handoff_need_score >= 70`：`+30`
- 用户明确要求人工：`+60`
- 工具或 policy 阻断：`+25`
- 当前已多轮澄清仍失败：`+20`

推荐减分项：

- 明确只是纯知识问答：`-20`

### `ask_clarification`

推荐加分项：

- `likely_multi_intent = true`：`+25`
- `asr_noise_risk = high`：`+20`
- `same_topic_score` 与 `new_topic_score` 接近：`+25`
- top1 与 top2 候选差距太小：`+20`

推荐减分项：

- 存在非常清晰的单一路径：`-30`

## 7.3 一个简单但够用的原则

当前阶段不追求特别复杂的模型。

最实用的实现顺序是：

1. 规则特征先出基础分
2. LLM 输出 5 类概率或 0-100 分数
3. 合并后做阈值裁决

---

## 8. LLM 裁决输出格式

推荐把 LLM 约束成非常窄的结构化输出：

```ts
interface TriageModelOutput {
  primary_intent: string;
  topic_relation: 'same_topic' | 'possible_switch' | 'clear_switch';
  candidate_scores: {
    resume_service: number;
    start_service: number;
    request_knowledge: number;
    handoff_human_support: number;
    ask_clarification: number;
  };
  reason_codes: string[];
  clarification_question?: string | null;
  knowledge_query?: string | null;
}
```

LLM 不应该输出：

- 最终客服回复
- 路由执行副作用
- 工单字段
- 技能内部步骤

---

## 9. 阈值裁决规则

## 9.1 推荐的主阈值

| 条件 | 处理方式 |
| --- | --- |
| `top1 >= 85` 且 `top1 - top2 >= 15` | 直接执行 |
| `70 <= top1 < 85` 且 `top1 - top2 >= 10` | 结合状态做 guard 后执行 |
| `60 <= top1 < 70` | 优先澄清，除非是 `resume_service` 且 active workflow 很强 |
| `top1 < 60` | `ask_clarification` |
| `top1 - top2 < 10` | `ask_clarification` |

## 9.2 `resume_service` 的特判

即使 `resume_service` 分数不算极高，如果同时满足：

- active workflow 存在
- `same_topic_score >= 75`
- `explicit_topic_switch = false`

也可以直接放行。

这是因为：

- 恢复原流程往往比新开更保守
- 特别是在用户只是补一句或确认一句时

## 9.3 `handoff_human_support` 的特判

只要：

- 用户明确要求人工
或
- 存在强合规阻断

就不需要再看普通阈值。

## 9.4 `request_knowledge` 的保守条件

只有当以下条件同时较强时，才单独走 `knowledge-agent`：

- `pure_information_request = true`
- `knowledge_need_score >= 70`
- 当前没有更强的 active workflow 恢复需求

否则宁可：

- `start_service`
或
- `ask_clarification`

也不要把业务办理误打成“纯知识问答”。

---

## 10. `same_topic / possible_switch / clear_switch` 的落地规则

## 10.1 推荐三分类继续保留

```ts
type TopicRelation = 'same_topic' | 'possible_switch' | 'clear_switch';
```

## 10.2 推荐判定信号

### `same_topic`

典型信号：

- 只是在补充信息
- 在回答确认/取消
- 在问当前流程的后续、时效、条件

### `possible_switch`

典型信号：

- 出现“顺便问下”
- 看起来像另一个问题，但仍与当前业务相关
- 问的是规则解释，不一定要切走

### `clear_switch`

典型信号：

- “先不办这个了”
- “另外我还想查账单”
- “我想转人工”

## 10.3 映射到决策

| `topic_relation` | 有 active workflow | 推荐行为 |
| --- | --- | --- |
| `same_topic` | 是 | 优先 `resume_service` |
| `possible_switch` | 是 | 优先 `ask_clarification`，少数低风险场景可先补知识 |
| `clear_switch` | 是 | 不直接 resume，重新比较 `start / knowledge / handoff` |
| `same_topic` | 否 | 由 `start / knowledge` 竞争 |

---

## 11. 推荐的最终路由表

## 11.1 运行时路由决策表

| 输入特征组合 | 最终 `decision_type` | `router_action` | 备注 |
| --- | --- | --- | --- |
| 有 `resume_token` | `resume_service` | `resume_active_instance` | 回流优先 |
| `waiting_human` 且用户再次催人工 | `handoff_human_support` | `reuse_waiting_handoff` | 不重复新建 |
| 用户明确要求人工 | `handoff_human_support` | `create_handoff` | 直接命中 |
| active workflow + 确认/取消 | `resume_service` | `resume_active_instance` | 标准恢复 |
| active workflow + same_topic | `resume_service` | `resume_active_instance` | 标准恢复 |
| 无 active workflow + 明确业务办理 | `start_service` | `start_new_service_flow` | 新开主流程 |
| 纯规则/依据/说明型问题 | `request_knowledge` | `dispatch_knowledge_request` | 纯补证 |
| 多意图 / topic 冲突 / ASR 噪声高 | `ask_clarification` | `emit_clarification` | 保守优先 |

## 11.2 当前阶段最值得强约束的 3 条

如果要非常克制地先做一版，我会先把这 3 条钉死：

1. 有 active workflow 时，不要轻易 `start_service`
2. 用户明确要人工时，不要继续自动化
3. top1 与 top2 差距小于 10 时，不要猜，先澄清

---

## 12. 典型示例

## 12.1 恢复原流程

用户前面在办停机保号，当前说：

> “可以，帮我继续。”

建议：

- `decision_type = resume_service`
- `router_action = resume_active_instance`
- `confidence >= 90`

## 12.2 明确新开业务

当前没有 active workflow，用户说：

> “帮我查一下上个月账单。”

建议：

- `decision_type = start_service`
- `router_action = start_new_service_flow`

## 12.3 纯知识请求

用户说：

> “停机保号一般最长能办多久？”

且当前没有 active workflow。

建议：

- `decision_type = request_knowledge`
- `router_action = dispatch_knowledge_request`

## 12.4 用户明确要人工

用户说：

> “我不想和机器人说了，转人工。”

建议：

- `decision_type = handoff_human_support`
- `router_action = create_handoff`

## 12.5 已在等人工，又再次催促

当前 `waiting_human`，用户说：

> “怎么还没人接？”

建议：

- `decision_type = handoff_human_support`
- `router_action = reuse_waiting_handoff`

不建议：

- 再建一次 handoff
- 再建一次工单

## 12.6 active workflow 下的可能切题

当前正在跑业务流程，用户说：

> “顺便问一下这个多久生效？”

建议：

- 若明显属于当前流程：`resume_service`
- 若有歧义：`ask_clarification`

默认不要直接新开业务。

---

## 13. 与 `service-agent / knowledge-agent / human-support-agent` 的接口约束

## 13.1 发给 `service-agent`

只有两类：

- `resume`
- `start`

推荐保持：

```ts
trigger_type: 'resume' | 'start';
```

## 13.2 发给 `knowledge-agent`

只有在 triage 明确认为这是“先补证据再决策”时才发。

不要把所有 FAQ 都默认发到 `knowledge-agent`。

## 13.3 发给 `human-support-agent`

triage 层只决定：

- 要不要送过去
- 是新建还是复用当前 handoff

不负责决定：

- `intake_only`
- `intake_then_draft`
- `intake_then_direct_materialize`

那是 `human-support-agent` 的职责。

---

## 14. 当前代码的迁移建议

## 14.1 目标接口形态

推荐把当前：

```ts
routeSkill(sessionId): { mode: 'runtime' | 'legacy'; spec?: WorkflowSpec; resuming: boolean }
```

升级为更接近真正 triage 的接口：

```ts
routeTurn(input): {
  decision_type: TriageDecisionType;
  router_action: TriageRouterAction;
  confidence: number;
  reason_codes: string[];
  service_target?: { mode: 'resume' | 'start'; skill_id?: string | null; spec?: WorkflowSpec };
  knowledge_request?: { query: string; intent: string } | null;
  handoff_request?: { reuse: boolean } | null;
  clarification_question?: string | null;
}
```

## 14.2 `chat.ts` 的目标顺序

当前顺序：

```txt
load session/history
-> routeSkill(sessionId)
-> runSkillTurn or runAgent
```

目标顺序：

```txt
load session/history/state
-> triage-agent
-> resume/start service
   or request knowledge
   or handoff human support
   or clarification
```

## 14.3 当前阶段不急着做的

不急着在第一版就做：

- 特别复杂的学习型打分模型
- 多个 active workflow 并发路由
- 自动 skill 选择器的精细优化

第一版更重要的是：

- 行为可解释
- 路由可复盘
- 规则和阈值可调

---

## 15. 评测建议

结合前面的评测文档，`triage-agent` 这一层最值得先单独盯的指标是：

- `owner_routing_accuracy`
- `resume_vs_start_accuracy`
- `handoff_trigger_accuracy`
- `topic_switch_precision`
- `clarification_precision`

如果这 5 个指标没有单独站稳，后面的 `service / knowledge / human-support` 再强也会被前门误路由抵消掉。

---

## 16. 当前阶段的默认建议

如果现在就要给 `ai-bot` 做一版真正可落地的前门规范，我的主张是：

1. 先把 `decision_type` 和 `router_action` 分开
2. 先做 Layer 0 硬规则和一版轻量分数融合
3. 先采用偏保守阈值
4. 有冲突优先 `ask_clarification`
5. 有 active workflow 时默认优先 `resume_service`
6. 用户明确要人工时默认优先 `handoff_human_support`

一句话：

> `triage-agent` 第一版最重要的不是“覆盖所有情况”，而是“把最容易走错的几条路先守住”。

---

## 17. 最终结论

`triage-agent` 要真正成为前门，不够只定义 5 个输出类别，还必须把：

- 输入信号
- 硬规则
- 候选分数
- 阈值裁决
- 执行动作

全部明确下来。

这样它才不是“另一个大 prompt”，而是一个真正可实现、可评测、可回放的 runtime-first router。

一句话总结：

> 先把“怎么判”写成表，再把“怎么走”写成动作，`triage-agent` 才会从概念变成系统。 
