# Memory 架构：DB 记忆与 MD 文件共存设计

> 为 `ai-bot` 设计一套真正可持续演进的记忆体系。核心目标不是“把所有东西都塞进 prompt”，也不是“把所有知识都写进 Markdown”，而是明确区分：哪些记忆应该结构化存在数据库里，哪些应该作为可编辑的 Markdown 资产存在 workspace 中，以及两者在运行时如何协同工作。

**Date**: 2026-04-03  
**Status**: Draft  
**Positioning**: Memory System Design  
**Related Design**:
- [四 Agent 职责边界与 Handoff Contract 设计](./2026-04-03-four-agent-boundaries-and-handoff-contract.md)
- [四 Agent 数据库表结构与 API Contract 草案](./2026-04-03-four-agent-db-and-api-contract.md)
- [Triage Agent 与请求生命周期设计](./2026-04-03-triage-agent-and-request-lifecycle-design.md)
- [Skill Instance Runtime Design](./2026-03-24-skill-instance-runtime-design.md)

---

## 1. 问题定义

如果 `ai-bot` 要从“会调工具的系统”升级为“真正会积累经验的 Agent”，就必须解决下面 6 个问题：

1. 用户偏好、长期经验、当前会话、SOP、项目知识，到底是不是同一种记忆。
2. 什么信息应该可编辑、可审查、可版本化。
3. 什么信息应该高频写入、可检索、可审计。
4. 长期记忆和运行时事实冲突时，谁优先。
5. 记忆怎样避免污染、过期、重复和自我强化错误。
6. 记忆如何在四个 Agent 之间共享，但又不互相污染。

---

## 2. 结论先行

### 2.1 记忆不是单层，而是四层

推荐把 `ai-bot` 的记忆分成四层：

1. `Control Memory`
2. `Session Memory`
3. `Long-term Semantic Memory`
4. `Workspace Knowledge`

### 2.2 MD 文件不是“全部记忆”，而是控制面记忆

Markdown 文件更适合承载：

- 人格
- 用户画像
- 行为规则
- 工具环境说明
- 可复用 SOP
- 项目知识库

不适合承载：

- 高频写入的会话事件
- 大量原始事实日志
- 细粒度工具结果
- 高频自动更新的记忆条目

### 2.3 DB 才是记忆的数据面

数据库更适合承载：

- session 级摘要
- 事件流
- 记忆候选
- 长期记忆条目
- 检索索引
- 冲突、版本、TTL、审计

### 2.4 运行时加载必须“少量常驻 + 按需检索”

推荐模式：

- 小而稳定的 MD 文件常驻
- 高变化的记忆通过 DB 检索
- 大文档、daily notes、project docs 按需加载

### 2.5 当前阶段应先做 DB 记忆，再做完整 MD 自进化

推荐实施顺序：

1. 先做 `memory_candidates + memory_items + retrieval`
2. 再做 `daily memory` 投影
3. 再做 `SOUL.md / USER.md / AGENTS.md / TOOLS.md / MEMORY.md`
4. 最后再允许 Agent 受控更新一部分 MD 资产

---

## 3. 四层记忆模型

## 3.1 Layer A：Control Memory

### 本质

这是 Agent 的“控制面记忆”，决定它应该怎么做事，而不是记录它经历了什么。

### 典型内容

- `SOUL.md`
- `USER.md`
- `AGENTS.md`
- `TOOLS.md`
- `MEMORY.md`
- `SKILL.md`

### 适合特征

- 低频更新
- 人类可阅读、可编辑
- 高价值、高密度
- 应被版本管理

### 不适合内容

- 每轮对话摘要
- 工具原始 JSON
- 高频事实更新

---

## 3.2 Layer B：Session Memory

### 本质

记录“当前会话正在发生什么”，是短期工作记忆。

### 典型内容

- 当前 active agent
- 当前 active workflow
- 最近消息摘要
- 最近 handoff
- 最近 knowledge packet
- 当前 pending intents

### 适合存放位置

- DB

### 生命周期

- 以 session 为主
- 可在会话结束后过期或压缩

---

## 3.3 Layer C：Long-term Semantic Memory

### 本质

从会话与反馈中提炼出的、可以跨 session 复用的高价值经验。

### 典型内容

- 用户偏好
- 常见术语映射
- 某业务场景的非显然纠错规则
- 某工具的真实使用坑
- 某 Agent 的稳定路由偏好

### 适合存放位置

- DB 主存
- 检索索引辅助

### 生命周期

- 按 scope 存在
- 可 revision
- 可 TTL
- 可失效

---

## 3.4 Layer D：Workspace Knowledge

### 本质

不一定是“记忆”，但它是 Agent 工作时会依赖的外部知识组织系统。

### 典型内容

- 项目文档
- 模板库
- 联系人说明
- 业务参考文档
- 专项 SOP

### 适合存放位置

- Markdown 文件和目录结构

### 特征

- 文档量大
- 需要层级组织
- 不适合直接常驻 prompt

---

## 4. MD 文件与 DB 的职责切分

## 4.1 适合放在 MD 的

### `SOUL.md`

放：

- 人格
- 语气
- 价值观
- 回答风格
- 不变的高层行为原则

不放：

- 最近 7 天学到的业务细节
- 当前用户这轮会话状态

### `USER.md`

放：

- 用户身份背景
- 常见沟通偏好
- 时区
- 固定习惯

不放：

- 高频变动的最近任务状态
- 具体某轮对话事实

### `AGENTS.md`

放：

- 多 Agent 的边界规则
- 常犯错误
- handoff 纪律
- 反模式与约束

不放：

- 临时 bug 列表
- 某次单独会话的偶发问题

### `TOOLS.md`

放：

- 常用工具说明
- 关键环境路径
- 命名约定
- 典型参数坑

不放：

- 每次工具调用结果
- 某工具的原始响应历史

### `MEMORY.md`

放：

- 长期稳定、高价值的提炼记忆摘要
- 常驻加载的 10-30 条核心记忆

不放：

- 所有长期记忆原文全集

### `SKILL.md`

放：

- 流程定义
- SOP
- tool 使用规范
- reference 路径

不放：

- 用户个人化偏好

---

## 4.2 适合放在 DB 的

### `memory_candidates`

放：

- 每轮结束后新发现的候选记忆
- 等待审核或自动判定的提议

### `memory_items`

放：

- 已接受的长期记忆条目
- scope、revision、TTL、状态

### `session_agent_state`

放：

- 当前 session 的 owner
- route_status
- 当前 active workflow 指针

### `agent_handoffs`

放：

- Agent 间所有结构化交接

### `knowledge_packets`

放：

- 知识检索结果缓存

### `skill_instance_events / execution_records`

放：

- 可审计的运行时事实

---

## 5. 推荐的 MD 目录结构

当前阶段建议不要让 `.agents/` 目录无限发散，先约束成一个小而稳定的骨架。

```txt
workspace/
└── .agents/
    ├── core/
    │   ├── SOUL.md
    │   ├── USER.md
    │   ├── AGENTS.md
    │   ├── TOOLS.md
    │   └── MEMORY.md
    ├── skills/
    │   ├── triage-agent/
    │   │   └── SKILL.md
    │   ├── service-agent/
    │   │   └── SKILL.md
    │   ├── knowledge-agent/
    │   │   └── SKILL.md
    │   └── human-support-agent/
    │       └── SKILL.md
    ├── memory/
    │   ├── daily/
    │   │   └── 2026-04-03.md
    │   ├── projections/
    │   │   ├── user-profile.md
    │   │   ├── tool-hints.md
    │   │   └── workflow-hints.md
    │   └── archive/
    ├── projects/
    └── references/
```

### 说明

- `core/` 放常驻小文件
- `skills/` 放 Agent 专属操作规范
- `memory/daily/` 放按日归档的会话摘要投影
- `memory/projections/` 放从 DB 聚合出来的“可读投影”
- `projects/` 和 `references/` 放工作知识，不直接当长期记忆

---

## 6. 为什么不能只用 MD

只用 Markdown 会遇到 6 个问题：

1. 高频写入冲突
2. 很难做 scope 过滤
3. 很难做 TTL 和版本失效
4. 很难做结构化检索与打分
5. 很难做审计和事件追溯
6. 很容易把历史噪音不断堆进常驻上下文

Markdown 适合“资产”，不适合“流水”。

---

## 7. 为什么不能只用 DB

只用数据库也会遇到 5 个问题：

1. 人类难以直接维护人格和规则
2. 难以版本控制
3. 很难用自然语言直接改行为规范
4. 很难形成可读的项目知识组织
5. 业务方和运营方很难参与编辑

所以：

> MD 负责“可读、可改、可版本化的控制资产”，DB 负责“高频、结构化、可检索的数据资产”。

---

## 8. 运行时加载顺序

推荐运行时遵循 5 层加载顺序：

## 8.1 Layer 0：固定常驻

常驻加载：

- `SOUL.md`
- `USER.md`
- `AGENTS.md`
- `TOOLS.md`
- `MEMORY.md`

要求：

- 单文件尽量控制在 5-20KB
- 总常驻控制在可预测上限

## 8.2 Layer 1：当前会话状态

从 DB 读取：

- `session_agent_state`
- active workflow
- recent handoffs
- recent summaries

## 8.3 Layer 2：相关长期记忆

基于当前意图和 agent scope 检索：

- `memory_items`
- `knowledge_packets`

## 8.4 Layer 3：当前 skill / references

按需加载：

- 相关 `SKILL.md`
- 相关 reference

## 8.5 Layer 4：实时事实

最后加入：

- tool 结果
- 当前用户最新消息
- runtime 生成的结构化状态

---

## 9. 检索策略

推荐统一 memory retrieval pipeline：

1. scope filter
2. memory type filter
3. BM25 / FTS5 检索
4. vector similarity
5. recency / freshness 加权
6. trust / source 加权
7. 去重与 compaction

### 推荐打分思路

```txt
final_score =
  0.35 * vector_score +
  0.25 * bm25_score +
  0.15 * recency_score +
  0.15 * scope_priority +
  0.10 * trust_score
```

这只是起点，不是最终定值。

### scope 优先级建议

按默认顺序：

1. `agent_user`
2. `user`
3. `agent`
4. `workspace`
5. `global`

### 为什么这样排

因为越贴当前用户与当前 Agent 的记忆，越有概率是最相关的。

---

## 10. 写回流程

推荐把记忆写回拆成 6 步：

1. `capture`
2. `propose`
3. `dedupe`
4. `decide`
5. `materialize`
6. `project`

## 10.1 capture

从以下来源捕获候选：

- 用户纠正
- 工具使用反馈
- 人工处理结果
- 业务规则冲突后的正确解
- 用户明确表达偏好

## 10.2 propose

写入 `memory_candidates`

候选必须结构化：

- `scope_type`
- `memory_type`
- `candidate_text`
- `evidence_json`

## 10.3 dedupe

与已有 `memory_items` 做：

- 文本相似去重
- 同 scope + 同 type 去重
- 冲突检测

## 10.4 decide

按类型决定是否自动接受：

### 可自动接受

- 明确用户偏好
- 明确工具使用坑
- 非敏感术语映射

### 需要审核或确认

- 影响业务规则的“经验”
- 可能跨用户泛化的结论
- 敏感个人信息
- 高风险流程偏好

## 10.5 materialize

通过后写入 `memory_items`

## 10.6 project

把高价值条目投影到：

- `MEMORY.md`
- `memory/projections/*.md`
- `daily/YYYY-MM-DD.md`

注意：

- `project` 是投影，不是主存
- 主存仍然是 DB

---

## 11. `daily memory` 的角色

`daily memory` 不应该是系统真实主记忆，而应该是：

- 可读归档
- 检视材料
- 离线提炼输入

### 推荐来源

由 DB 事件流和 session summary 自动生成。

### 推荐内容

- 当日重要会话摘要
- 新增候选记忆
- 冲突与修正
- 工具失败热点
- 人工升级热点

### 不建议

- 把 `daily memory` 当作唯一检索源

因为它天然冗长、稀疏、噪音高。

---

## 12. `MEMORY.md` 的角色

`MEMORY.md` 应该是：

- 常驻小摘要
- 只保留最稳定、最高价值的长期记忆

它像“长期记忆首页”，不是完整记忆库。

### 推荐上限

- 10-30 条核心记忆
- 1-3 屏可读完

### 推荐分类

- 用户偏好
- 业务规则警示
- tool 使用注意
- 术语映射
- 当前项目的长期方向

---

## 13. 让 Agent 自动改 MD 的边界

当前阶段不建议让 Agent 自由改所有 MD 文件。

### Phase 1：只读

- `SOUL.md`
- `USER.md`
- `AGENTS.md`
- `TOOLS.md`
- `MEMORY.md`

### Phase 2：受控投影

允许系统自动更新：

- `memory/daily/*.md`
- `memory/projections/*.md`

### Phase 3：半自动建议

允许 Agent 产出 patch 建议，但不自动落盘：

- `USER.md`
- `TOOLS.md`
- `MEMORY.md`

### Phase 4：严格审批后写入

仅对低风险文件开放自动合并。

### 当前明确不建议自动写

- `SOUL.md`
- `AGENTS.md`

原因：

- 这是系统行为底座
- 一旦自我漂移，代价极高

---

## 14. 四个 Agent 与记忆的关系

## 14.1 `triage-agent`

最需要：

- 用户偏好
- 最近意图摘要
- topic switch 历史
- 人工升级相关偏好

不需要：

- 大量业务 reference

## 14.2 `service-agent`

最需要：

- 当前 skill 的 workflow 经验
- 工具使用坑
- 用户当前相关的业务偏好

不需要：

- 大量无关项目知识

## 14.3 `knowledge-agent`

最需要：

- 术语映射
- 文档来源偏好
- 历史证据有效性

不需要：

- 会话控制层状态

## 14.4 `human-support-agent`

最需要：

- 队列与工单模板偏好
- 常用 handoff 摘要模式
- 人工恢复规则

不需要：

- 细粒度业务执行步骤记忆

---

## 15. 冲突与污染处理

记忆系统最危险的不是“记不住”，而是“记错了还不断复用”。

## 15.1 冲突来源

- 用户说法与工具结果冲突
- 长期记忆与最新规则冲突
- 某 Agent 的经验污染另一个 Agent
- 旧规则没有失效

## 15.2 优先级建议

运行时优先级从高到低：

1. 实时工具事实
2. 当前 workflow 约束
3. 最新人工处理结果
4. 知识证据包
5. 长期记忆
6. `MEMORY.md`
7. 其他老旧 daily notes

### 关键原则

> 长期记忆永远不能压过实时事实。

## 15.3 失效机制

建议支持：

- `active=false`
- `revision`
- `freshness_ttl_days`
- `superseded_by`

---

## 16. 当前阶段的推荐实施顺序

### Phase 1

- 建 `memory_candidates`
- 建 `memory_items`
- 做 scope 和 retrieval

### Phase 2

- 基于 DB 自动生成 `daily memory`
- 生成 `memory/projections/*.md`

### Phase 3

- 引入 `.agents/core/` 五个基础 MD 文件
- 让 `MEMORY.md` 成为高价值摘要页

### Phase 4

- 再讨论受控更新 `USER.md / TOOLS.md / MEMORY.md`

---

## 17. 对当前 `ai-bot` 的明确建议

如果只选一句最重要的建议，那就是：

> 不要把“MD 文件即知识”直接等同于“MD 文件即全部记忆”。

对当前 `ai-bot`，更合适的范式是：

> `DB 负责主记忆，MD 负责控制面与可读投影。`

换句话说：

- 真正检索、去重、TTL、scope、审计，放 DB
- 真正人格、规则、SOP、可读摘要，放 MD

这是比“全 Markdown”更稳、也比“全数据库”更可运营的一条中间道路。

