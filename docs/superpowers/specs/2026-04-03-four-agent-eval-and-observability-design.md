# 四 Agent 评测与可观测性设计

> 为 `ai-bot` 的 `triage-agent / service-agent / knowledge-agent / human-support-agent` 设计一套统一的评测与观测框架。目标不是只评“最后回复好不好”，而是能分层回答：路由是否正确、流程是否走对、知识是否补准、人工桥是否可靠、恢复是否有用，以及出问题时到底坏在了哪一层。

**Date**: 2026-04-03  
**Status**: Draft  
**Positioning**: Eval + Observability Architecture  
**Related Design**:
- [四 Agent 职责边界与 Handoff Contract 设计](./2026-04-03-four-agent-boundaries-and-handoff-contract.md)
- [四 Agent 数据库表结构与 API Contract 草案](./2026-04-03-four-agent-db-and-api-contract.md)
- [Triage Agent 与请求生命周期设计](./2026-04-03-triage-agent-and-request-lifecycle-design.md)
- [`human-support-agent` 落单与人工衔接策略设计](./2026-04-03-human-support-agent-materialization-policy.md)
- [`human-support-agent` 工作台协作与 `resume_context` 回流协议设计](./2026-04-03-human-support-agent-workstation-and-resume-protocol.md)

**Related Current Code**:
- `km_service/src/routes/retrieval-eval.ts`
- `km_service/src/skills/assertion-evaluator.ts`
- `backend/src/tool-runtime/pipeline.ts`
- `packages/shared-db/src/schema/platform.ts`
- `packages/shared-db/src/schema/workorder.ts`

---

## 1. 为什么现在必须做评测层

到这一步，`ai-bot` 的设计已经不是“一个 prompt + 几个工具”了，而是：

- 有路由
- 有 runtime
- 有检索
- 有人工桥
- 有恢复协议

这会带来一个很现实的问题：

> 如果没有统一评测和 trace，系统一旦出错，我们根本不知道是错在意图、路由、知识、工具、人工桥，还是恢复逻辑。

所以评测层的价值不是“做一个 dashboard 很漂亮”，而是：

1. 决定是否值得上多 Agent
2. 决定该优化哪一层
3. 防止看起来成功、实际上链路错误
4. 为灰度上线和回归验证提供最小安全网

---

## 2. 现状判断

## 2.1 当前仓库已经有两块基础能力

### 检索评测

`km_service/src/routes/retrieval-eval.ts` 已经支持：

- 检索试跑
- 评测样例存储
- 人工打标 `citation_ok / answer_ok`

这说明：

- `knowledge-agent` 的评测基座不是零
- 但它现在还是“检索能力评测”，不是“多 Agent 知识补证评测”

### 断言评测

`km_service/src/skills/assertion-evaluator.ts` 已经支持：

- 文本断言
- 工具调用断言
- 技能加载断言
- 顺序断言
- `llm_rubric`

这说明：

- `service-agent` 的技能级断言也有底子
- 但它更偏单技能/单次运行，不是完整 session 级 trajectory 评测

## 2.2 当前也已经有很好的 trace 基础

### `execution_records`

`backend/src/tool-runtime/pipeline.ts` 会为每次工具调用生成：

- `trace_id`
- `tool_name`
- `session_id`
- `skill_name`
- `success / has_data / latency`

并异步落到 `execution_records`。

### `skill_instance_events`

`packages/shared-db/src/schema/platform.ts` 已经有：

- `skill_instances`
- `skill_instance_events`

这意味着：

- `service-agent` 的步骤推进轨迹可审计

## 2.3 当前最大的缺口

还缺 4 样东西：

1. 四 Agent 统一的评测模型
2. `agent_handoffs` 与评测体系的直接关联
3. session 级 `trajectory accuracy`
4. `human-support-agent + resume_context` 的专门指标

一句话：

> 现在是“局部能力可测”，但“多 Agent 闭环不可测”。

---

## 3. 设计目标

这套设计要回答 5 个问题：

1. 一个 session 失败了，错误属于哪一层。
2. 一个 handoff 做了，是否真的有价值。
3. 一次恢复发生了，是否真的帮助闭环。
4. 一个优化上线后，整体成功率是涨了还是只是把错误换了地方。
5. 是否可以在不读全量日志的前提下，快速回放一条失败链路。

---

## 4. 总体结论

推荐把评测和观测拆成三层：

1. `Online Observability`
2. `Offline Eval`
3. `Replay & Regression`

### 4.1 `Online Observability`

解决：

- 线上现在发生了什么
- 哪条链路慢
- 哪个 Agent 频繁失败
- 哪个 handoff 卡住了

### 4.2 `Offline Eval`

解决：

- 模型/规则/Prompt/Skill 改动后，能力是涨还是跌
- 单个 Agent 的关键指标是否回归

### 4.3 `Replay & Regression`

解决：

- 线上真实坏例能否沉淀成回归样本
- 同一个失败是否被反复引入

---

## 5. 统一观测主线

## 5.1 统一用 `trace_id + session_id + handoff_id + instance_id + item_id`

推荐把四 Agent 关键链路统一串起来：

```txt
session_id
  -> trace_id
  -> skill_instance_id
  -> handoff_id
  -> knowledge_packet_id
  -> intake_id / draft_id / item_id
  -> resume_token
```

其中：

- `session_id` 代表用户主线
- `trace_id` 代表一轮或一段执行链
- `instance_id` 代表业务 runtime 主线
- `handoff_id` 代表跨 Agent / 人工桥切换点
- `item_id` 代表人工支持域的正式对象
- `resume_token` 代表恢复闭环

## 5.2 所有评测都不应该脱离这条主线

如果某项评测不能落回这条链路，它就很难用于 debug。

例如：

- “回复看起来不错”但找不到对应 handoff 和 runtime
- “工单创建成功”但找不到来源 session
- “恢复触发了”但找不到来源人工桥

这些都不算生产级评测。

---

## 6. 四 Agent 的分层指标

## 6.1 `triage-agent`

`triage-agent` 不应只看“分类对不对”，还要看“owner 选得对不对”。

推荐核心指标：

- `intent_accuracy`
- `owner_routing_accuracy`
- `resume_vs_start_accuracy`
- `handoff_trigger_accuracy`
- `clarification_precision`
- `topic_switch_precision`
- `topic_switch_recall`
- `over_handoff_rate`
- `under_handoff_rate`

### 指标解释

#### `owner_routing_accuracy`

是否把本轮交给了正确 owner：

- `service-agent`
- `knowledge-agent`
- `human-support-agent`
- `ask_clarification`

这比单纯意图分类更重要。

#### `resume_vs_start_accuracy`

用户输入来时，到底该：

- 恢复已有流程
- 新开流程
- 还是不该进业务流程

这是 `triage-agent` 的核心难点指标。

#### `over_handoff_rate`

本可继续自动处理，却过早转人工的比例。

#### `under_handoff_rate`

本应及时转人工，却继续让 AI 硬顶的比例。

---

## 6.2 `service-agent`

`service-agent` 的核心不是“回复是否自然”，而是“轨迹是否正确”。

推荐核心指标：

- `trajectory_accuracy`
- `step_progression_accuracy`
- `tool_selection_accuracy`
- `tool_argument_precision`
- `branch_decision_accuracy`
- `confirmation_handling_accuracy`
- `policy_violation_rate`
- `tool_failure_recovery_rate`
- `false_success_rate`

### 指标解释

#### `trajectory_accuracy`

从进入 `service-agent` 到退出，整条路径是否正确。

这是最重要的生产指标。

#### `tool_argument_precision`

不只是看有没有调对工具，还要看参数是否够准。

例如：

- 账期错一个月
- 号码没带全
- channel/context 丢了

都应算失败。

#### `false_success_rate`

系统看起来返回成功，但其实：

- 该确认没确认
- 该落单没落单
- 该转人工没转

这是多 Agent 系统里很容易被忽略的假阳性指标。

---

## 6.3 `knowledge-agent`

`knowledge-agent` 的输出是证据包，不是最终答复，所以指标也应围绕“补证是否靠谱”。

推荐核心指标：

- `retrieval_precision_at_k`
- `retrieval_recall_at_k`
- `citation_correctness`
- `evidence_support_rate`
- `constraint_respect_rate`
- `unresolved_point_accuracy`
- `knowledge_packet_usefulness`
- `stale_knowledge_rate`

### 指标解释

#### `knowledge_packet_usefulness`

拿到这个 packet 后：

- 是否真的帮助上游 Agent 做出更好决定
- 还是只是找了一堆相关但无决策价值的材料

这个指标比纯 `P@K` 更贴业务。

#### `constraint_respect_rate`

例如：

- 要最新资料却返回过期资料
- 要有引用却无来源
- 要限定 skill ref 却混入无关文档

---

## 6.4 `human-support-agent`

这是当前最容易被忽略、但对真实闭环非常关键的一层。

推荐核心指标：

- `handoff_accept_latency`
- `handoff_summary_completeness`
- `materialization_mode_accuracy`
- `draft_needed_miss_rate`
- `false_direct_materialization_rate`
- `duplicate_item_rate`
- `append_or_reopen_hit_rate`
- `queue_routing_accuracy`
- `resume_context_usefulness`
- `resume_success_rate`
- `resume_regret_rate`

### 指标解释

#### `materialization_mode_accuracy`

是否选对了：

- `intake_only`
- `intake_then_draft`
- `intake_then_direct_materialize`
- `append_or_reopen_existing`

#### `false_direct_materialization_rate`

本应走 `draft` 或只留 `intake`，却被过早直建正式单的比例。

#### `resume_regret_rate`

已经恢复 AI，但很快又：

- 再次转人工
- 走错流程
- 需要人工重新解释

这说明 `resume_context` 虽然生成了，但质量不够。

---

## 7. Session 级总指标

多 Agent 系统最终还是要落回 session 级结果。

推荐核心 session 指标：

- `end_to_end_resolution_rate`
- `end_to_end_containment_rate`
- `median_turns_to_resolution`
- `escalation_rate`
- `re_escalation_rate`
- `session_reopen_rate`
- `handoff_loop_rate`
- `time_to_first_meaningful_action`
- `user_visible_error_rate`

### 特别建议

不要只看：

- 最终是否 resolved

还要看：

- 是 AI 自己闭环
- 还是人工闭环
- 还是 AI -> 人工 -> AI 才闭环

因为这三种成功的成本结构完全不同。

---

## 8. 推荐的评测样本分层

## 8.1 `golden_cases`

小而高质量的金标样本。

用途：

- 每次改动都必须过
- 作为核心回归线

内容建议覆盖：

- `resume_service`
- `start_service`
- `request_knowledge`
- `handoff_human_support`
- `human_resume_ready`

## 8.2 `shadow_cases`

来自线上真实日志，但尚未人工精修的样本。

用途：

- 发现新问题
- 辅助趋势观察

## 8.3 `stress_cases`

故意设计的边界/混淆样本。

例如：

- 多意图
- 模糊切题
- 可能 topic switch
- 低置信工具返回
- 人工回流信息不完整

## 8.4 `counterfactual_cases`

同一事实，换不同表述。

用途：

- 测系统是否只会记套路词

---

## 9. 推荐的评测对象建模

## 9.1 不只评“回答”，还要评“决策对象”

推荐把一次 eval 样本拆成：

```ts
interface FourAgentEvalCase {
  id: string;
  scenario: string;
  layer:
    | 'triage'
    | 'service'
    | 'knowledge'
    | 'human_support'
    | 'session';
  input: {
    session_snapshot?: Record<string, unknown>;
    user_message?: string;
    handoff_request?: Record<string, unknown>;
    knowledge_request?: Record<string, unknown>;
    resume_context?: Record<string, unknown>;
  };
  expected: {
    decision?: Record<string, unknown>;
    tool_sequence?: string[];
    handoff?: Record<string, unknown>;
    packet?: Record<string, unknown>;
    materialization_mode?: string;
    resume_target?: Record<string, unknown>;
    final_outcome?: string;
  };
  labels: string[];
  risk_level: 'low' | 'medium' | 'high';
}
```

## 9.2 评测结果也应分层返回

```ts
interface FourAgentEvalResult {
  case_id: string;
  layer: string;
  status: 'passed' | 'failed' | 'partial' | 'infra_error';
  score: number;
  metric_results: Array<{
    metric: string;
    passed: boolean;
    score?: number;
    detail: string;
  }>;
  trace_refs: {
    session_id?: string | null;
    trace_id?: string | null;
    instance_id?: string | null;
    handoff_id?: string | null;
    item_id?: string | null;
  };
}
```

---

## 10. 评测执行方式

## 10.1 离线规则评测

适合：

- 路由决策
- 工具顺序
- 强约束字段

来源：

- 规则断言
- 顺序断言
- 精确匹配

当前 `assertion-evaluator.ts` 已经能承接一部分。

## 10.2 `LLM-as-Judge`

适合：

- 摘要完整性
- 知识包有用性
- `resume_context` 是否够恢复

但应只用于：

- 语义难以硬编码的部分

不应拿它判断：

- 是否调了正确工具
- 是否写了正确字段

## 10.3 人工审查评测

适合：

- 高风险 handoff
- 真正上线前的采样复核
- `resume_regret` 案例

推荐做法：

- 机器先筛坏例
- 人工只看高价值样本

---

## 11. 可观测性面板建议

## 11.1 实时运营面板

面向：

- 值班
- 产品
- 运营

建议看：

- 每个 Agent 的请求量
- handoff 量
- 直建率 / draft 率 / intake-only 率
- 平均工具时延
- 平均人工接单时延
- resume 触发量
- resume 成功率

## 11.2 质量面板

面向：

- 架构
- 算法
- Prompt / runtime 优化

建议看：

- `owner_routing_accuracy`
- `trajectory_accuracy`
- `citation_correctness`
- `materialization_mode_accuracy`
- `resume_context_usefulness`

## 11.3 回放面板

面向：

- debug
- 复盘

建议能按：

- `session_id`
- `trace_id`
- `handoff_id`
- `instance_id`
- `item_id`

反查整条链路。

---

## 12. 建议新增的评测/观测表

当前不一定立刻实现，但设计上建议预留。

## 12.1 `agent_eval_cases`

存四 Agent 级样本。

```ts
agent_eval_cases
- id
- layer
- scenario
- input_json
- expected_json
- labels_json
- risk_level
- source_kind
- active
- created_at
- updated_at
```

## 12.2 `agent_eval_runs`

存每次批量运行。

```ts
agent_eval_runs
- id
- suite_name
- git_sha
- model_config_json
- runtime_config_json
- total_cases
- passed_cases
- failed_cases
- started_at
- finished_at
```

## 12.3 `agent_eval_results`

存 case 级结果。

```ts
agent_eval_results
- id
- run_id
- case_id
- layer
- status
- score
- metric_results_json
- trace_refs_json
- raw_output_json
- created_at
```

## 12.4 `trajectory_failures`

专门沉淀线上坏链路。

```ts
trajectory_failures
- id
- session_id
- trace_id
- layer
- failure_type
- summary
- root_cause_json
- replay_case_id
- created_at
```

---

## 13. 线上坏例到回归样本的飞轮

推荐形成一个固定闭环：

1. 线上通过 trace 发现坏例
2. 标注 root cause
3. 抽取成 `agent_eval_case`
4. 加入 `golden` 或 `shadow` 套件
5. 后续每次改动都回归

如果没有这一步，多 Agent 系统只会越来越复杂，但不会越来越稳。

---

## 14. 与现有能力的对接建议

## 14.1 复用 `retrieval-eval`

不要推翻。

推荐升级为：

- `knowledge-agent` 的子评测入口
- 增加 `packet usefulness` 和 `constraints` 维度

## 14.2 复用 `assertion-evaluator`

不要推翻。

推荐扩展为：

- 支持 `triage decision`
- 支持 `handoff emitted`
- 支持 `resume target`
- 支持 `materialization mode`

也就是从“技能断言器”升级成“Agent 行为断言器”。

## 14.3 复用 `execution_records + skill_instance_events`

这两张表已经非常有价值。

推荐只是把：

- `agent_handoffs`
- `knowledge_packets`
- `resume_context`

也纳入同一条 trace 主线。

---

## 15. 当前阶段最值得先落地的 8 个指标

如果要非常克制地先做一版，我建议先盯这 8 个：

1. `owner_routing_accuracy`
2. `trajectory_accuracy`
3. `tool_argument_precision`
4. `citation_correctness`
5. `materialization_mode_accuracy`
6. `duplicate_item_rate`
7. `resume_success_rate`
8. `resume_regret_rate`

这 8 个基本能覆盖四 Agent 最关键的风险面。

---

## 16. 当前阶段的默认建议

如果现在就要给 `ai-bot` 定一版实施顺序，我建议：

### Phase 1

- 统一 trace 主线
- 给 `agent_handoffs` 接上 eval 视角
- 补 `owner_routing_accuracy`
- 补 `trajectory_accuracy`

### Phase 2

- 把 `retrieval-eval` 升级成 `knowledge-agent` 子评测
- 补 `materialization_mode_accuracy`
- 补 `duplicate_item_rate`

### Phase 3

- 补 `resume_context_usefulness`
- 补 `resume_success_rate / regret_rate`
- 建坏例回放与回归样本飞轮

---

## 17. 最终结论

对四 Agent 系统来说，真正重要的不是“每个 Agent 看起来都挺聪明”，而是：

- 路由有没有把活交对人
- runtime 有没有把事走对路
- 检索有没有拿到真正有用的证据
- 人工桥有没有接住并且不炸单
- 恢复有没有真的帮系统闭环

所以这套评测设计的核心不是“评回答”，而是：

> 评决策、评轨迹、评交接、评恢复。

一句话总结：

> 多 Agent 没有 eval，就只有复杂度；有了分层 eval 和 trace，复杂度才会开始转化为能力。
