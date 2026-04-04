# `knowledge-agent` Prompt、Packet 与检索排序设计

> 为 `ai-bot` 的 `knowledge-agent` 定义一套可落地的检索与证据包设计。目标不是把它做成另一个自由回答机器人，而是把它做成一个受控的补证器: 输入是结构化 `KnowledgeRequest`，输出是结构化 `KnowledgePacket`，中间通过范围受限的检索、排序、压缩和约束检查，给 `triage-agent` 或 `service-agent` 提供可审计、可评测、可缓存的证据包。

**Date**: 2026-04-03  
**Status**: Draft  
**Positioning**: Retrieval + Evidence Packet Spec  
**Related Design**:
- [四 Agent 职责边界与 Handoff Contract 设计](./2026-04-03-four-agent-boundaries-and-handoff-contract.md)
- [四 Agent 数据库表结构与 API Contract 草案](./2026-04-03-four-agent-db-and-api-contract.md)
- [Memory 架构：DB 记忆与 MD 文件共存设计](./2026-04-03-memory-architecture-db-and-md-coexistence.md)
- [四 Agent 评测与可观测性设计](./2026-04-03-four-agent-eval-and-observability-design.md)

**Related Current Code**:
- `km_service/src/services/reply-copilot.ts`
- `km_service/src/services/agent-copilot.ts`
- `km_service/src/routes/retrieval-eval.ts`

---

## 1. 为什么需要单独定义 `knowledge-agent`

当前仓库已经有两类“和知识相关”的能力：

- [reply-copilot.ts](../../../km_service/src/services/reply-copilot.ts): 关键词检索 + hints
- [agent-copilot.ts](../../../km_service/src/services/agent-copilot.ts): 检索片段 + LLM 生成坐席答案

它们已经证明两件事：

1. 仓库里有知识资产和初步检索能力
2. 也已经有 LLM 基于检索片段做结构化输出的先例

但如果把它们直接当作四 Agent 里的 `knowledge-agent`，会有几个明显问题：

1. 当前输出更偏“给人看的建议”，不是“给 Agent 用的证据包”
2. 当前检索范围没有清晰 scope 概念
3. 当前排序仍主要是 tag + keyword overlap，没有和 memory / freshness / trust 统一
4. 当前没有把“有答案”和“有证据”严格区分
5. 当前没有明确 `constraints / unresolved_points / confidence` 的语义边界

所以这份文档的核心目标是：

> 把现有检索能力升级成一个真正的 `knowledge-agent` 契约，而不是推翻重做。

---

## 2. 核心结论

### 2.1 `knowledge-agent` 不是最终回答器

它的核心产物是：

- `answer_brief`
- `evidence_items`
- `constraints`
- `unresolved_points`
- `confidence`

而不是直接对用户说的话。

### 2.2 `knowledge-agent` 是受限检索器，不是全域聊天模型

它必须始终在明确的 `scope` 内工作。

推荐 scope 先只支持：

- `skill_refs`
- `km_assets`
- `workspace_memory`
- `long_term_memory`

不要让它一开始就变成“什么都能搜”的泛搜索器。

### 2.3 先做混合检索，不急着追求复杂 RAG

当前最实用的路线是：

- 关键词 / FTS
- 向量检索
- freshness / trust / scope / recency 重排

先把这条链路做稳定，再考虑更重的生成式检索。

### 2.4 LLM 只负责“证据压缩与约束表达”

检索、排序、范围控制应尽量由确定性逻辑完成。

LLM 在 `knowledge-agent` 里更适合做：

- 多证据压缩
- brief answer 生成
- unresolved points 提炼

而不是决定从整个知识海洋里“搜什么”。

---

## 3. 当前状态与目标差距

## 3.1 当前 `reply-copilot` 的特点

[reply-copilot.ts](../../../km_service/src/services/reply-copilot.ts) 当前主要是：

- 只看 `online` 资产
- 基于 `structured_snapshot_json`
- 用 keyword overlap、title、scene label、tags 打分
- 返回 top-1 或 top-k

优点：

- 简单
- 稳
- 很适合早期 hints

短板：

- 没有 scope 过滤
- 没有 memory 层接入
- 没有 freshness / trust 的统一表达
- 返回的是候选资产，不是 agent 级 packet

## 3.2 当前 `agent-copilot` 的特点

[agent-copilot.ts](../../../km_service/src/services/agent-copilot.ts) 当前会：

- 取 top-3 片段
- 拼接 prompt
- 让模型给出 `direct_answer / customer_facing_answer / cautions`

优点：

- 已有“检索后再结构化生成”的先例

短板：

- 输出面向人工坐席，不是面向多 Agent
- 没有 `constraints / unresolved_points / packet cache`

## 3.3 目标态

目标应该是：

```txt
KnowledgeRequest
-> retrieve within scope
-> score + rerank + dedupe + compress
-> KnowledgePacket
```

而不是：

```txt
user question
-> retrieve snippets
-> generate free answer
```

---

## 4. 设计目标

这套设计要解决 5 件事：

1. 让上游 Agent 明确知道 `knowledge-agent` 查了什么范围。
2. 让检索结果可以压缩成统一结构，而不是每个场景各拼各的。
3. 让“不足以回答”的情况可以被正式表达，而不是模型硬编。
4. 让 `knowledge_packet` 能缓存、复用、过期、评测。
5. 让当前 keyword 检索可以自然升级到 hybrid retrieval，而不推翻现有资产体系。

---

## 5. 输入契约

继续沿用前面定义的 `KnowledgeRequest` 主体，但补一些细节约束。

```ts
interface KnowledgeRequest {
  request_id: string;
  session_id: string;
  requester: 'triage-agent' | 'service-agent';
  query: string;
  intent: string;
  scope: Array<'skill_refs' | 'km_assets' | 'workspace_memory' | 'long_term_memory'>;
  skill_id?: string | null;
  constraints?: {
    top_k?: number;
    freshness_days?: number | null;
    require_sources?: boolean;
    max_snippet_chars?: number | null;
    answer_style?: 'brief' | 'decision_support';
  };
}
```

### 关键约束

- `query` 应是标准化检索请求，不应直接等于原始整段聊天
- `scope` 不能为空
- `top_k` 推荐上限 `8`
- `max_snippet_chars` 推荐上限 `500`

---

## 6. 输出契约

## 6.1 主 packet

```ts
interface KnowledgePacket {
  packet_id: string;
  request_id: string;
  query: string;
  intent: string;
  answer_brief: string;
  evidence_items: Array<{
    source_type: 'skill_ref' | 'km_asset' | 'memory' | 'doc';
    source_id: string;
    title: string;
    snippet: string;
    confidence: number;
    freshness?: string | null;
    trust_level?: 'high' | 'medium' | 'low';
  }>;
  constraints: string[];
  unresolved_points: string[];
  confidence: number;
}
```

## 6.2 字段语义

### `answer_brief`

给上游 Agent 的简短结论，不是给最终用户的成稿。

它应回答：

- 基于当前证据，大致可以怎么理解这个问题

它不应承担：

- 最终客服话术
- 业务承诺

### `evidence_items`

是 packet 的核心。

如果没有足够证据，就不应强行给高置信 `answer_brief`。

### `constraints`

用于告诉上游：

- 哪些前提成立才可以用这个结论
- 哪些使用边界不能越过

示例：

- `仅适用于在线渠道`
- `资料存在时效性，请以最新规则为准`
- `未核验用户当前套餐状态`

### `unresolved_points`

这是 `knowledge-agent` 最重要的自我克制字段。

它用于明确表达：

- 还缺什么
- 哪些问题目前不能被证据支持

### `confidence`

表示“当前 packet 对上游决策的可用性”，不是“模型自信程度”。

---

## 7. 检索范围设计

## 7.1 `skill_refs`

含义：

- 当前 skill 相关的 reference / SOP / 旁注

适用：

- 当前问题高度贴近某个 skill
- 需要“这个 skill 下怎么解释”而不是全域问答

优先级建议：

- 当 `skill_id` 明确时，这个 scope 的 trust 默认较高

## 7.2 `km_assets`

含义：

- 在线知识资产

适用：

- 常规知识检索
- 通用规则解释

## 7.3 `workspace_memory`

含义：

- 当前 workspace 的 project docs / daily memory / projection docs

适用：

- 项目型、团队型、本工作区特有知识

注意：

- 这类结果常常 freshness 很高，但 trust 未必总高

## 7.4 `long_term_memory`

含义：

- 从 `memory_items` 中提炼出来的长期语义记忆

适用：

- 术语映射
- 用户偏好
- 稳定流程提示

注意：

- 这不是官方知识来源
- 不应用于替代正式规则或政策文档

---

## 8. 推荐的检索流水线

## 8.1 Step 1: Scope Filter

先按 `scope` 过滤，不要先全局搜再回头裁。

原因：

- 成本低
- 结果更可控
- 更符合“受限检索器”的定位

## 8.2 Step 2: Candidate Retrieval

针对每个 scope 分别取候选：

- `skill_refs`: path / title / tag / ref text
- `km_assets`: title / label / retrieval_tags / variants / q
- `workspace_memory`: filename / heading / chunk / tags
- `long_term_memory`: content / memory_type / scope_key

## 8.3 Step 3: Hybrid Scoring

推荐总分由以下部分组成：

```txt
final_score =
  lexical_score * 0.35 +
  semantic_score * 0.35 +
  scope_prior_score * 0.10 +
  freshness_score * 0.10 +
  trust_score * 0.10
```

### `lexical_score`

当前 `reply-copilot` 的 overlap scoring 可以直接成为 v1 基础。

### `semantic_score`

中期接入：

- sqlite-vec
- 或其他向量索引

### `scope_prior_score`

用于表达：

- 当前 skill 相关 ref
- 比随机全域文档更值得信

### `freshness_score`

对于时效性知识应显式影响排序。

### `trust_score`

推荐默认：

- `skill_ref / official km_asset`: 高
- `workspace_memory`: 中
- `long_term_memory`: 中低

---

## 9. 排序与去重策略

## 9.1 先按 source_type 去重

避免一个资产的多个相近片段把 top-k 占满。

## 9.2 再做 MMR 或 diversity rerank

目标不是返回 5 条最像的话，而是：

- 返回最有互补价值的几条证据

推荐目标：

- top-3 到 top-5 证据尽量覆盖不同来源或不同论点

## 9.3 对低分尾部做硬截断

建议：

- 低于阈值的候选直接丢弃
- 不要为了凑 `top_k` 把无关项塞进 packet

---

## 10. LLM 的角色

## 10.1 LLM 只在检索后工作

不推荐：

- 先让 LLM 决定搜什么文档
- 再做自由式检索

推荐：

- 检索层先产出候选证据
- LLM 再做：
  - `answer_brief`
  - `constraints`
  - `unresolved_points`

## 10.2 推荐的 prompt 目标

System prompt 核心应类似：

```txt
你是 ai-bot 的 knowledge-agent。
你的职责是基于提供的候选证据，产出结构化知识包。
你不是最终客服回答器，不要编造证据，不要做业务承诺。
如果证据不足，请降低 confidence，并在 unresolved_points 中明确写出缺口。
只输出符合 schema 的 JSON。
```

## 10.3 推荐的输入

给模型的输入应包含：

- 原始 `KnowledgeRequest`
- top candidate evidence
- 每条 evidence 的 source_type / title / snippet / freshness / trust

而不是只给一个拼接大文本。

---

## 11. Packet 生成不变量

推荐加入这些强检查：

1. `evidence_items.length = 0` 时，`confidence` 不得高于 `40`
2. `confidence >= 80` 时，至少应有 `2` 条高可信证据，除非单条证据权威性极高
3. 若存在 `unresolved_points`，则 `confidence` 不应过高
4. 若 `require_sources = true`，则 `evidence_items` 不能为空
5. `answer_brief` 不得引入 evidence 中没有支持的具体事实

---

## 12. 缓存与 TTL

## 12.1 `knowledge_packets` 就是输出缓存

前面的 DB 草案已经定义了：

- `knowledge_packets`
- `knowledge_packet_items`

推荐把 packet cache 看成：

- 对同一 `request_id`
- 或同一 `session + query + scope`
- 的短期缓存

## 12.2 默认 TTL 建议

- `skill_refs`: `1d - 7d`
- `km_assets`: `7d - 30d`
- `workspace_memory`: `1d - 7d`
- `long_term_memory`: `7d - 30d`

并非所有 packet 都要一样长。

---

## 13. 失败与回退策略

## 13.1 没检到足够证据

推荐：

- 仍返回 packet
- 但 `answer_brief` 明确为低置信
- `unresolved_points` 说明缺口

而不是：

- 返回自由文本“查不到”

## 13.2 LLM 压缩失败

推荐：

- 回退到 deterministic packet
- `answer_brief` 用 top-1 snippet 的保守摘要
- `constraints` 写成通用保护语

## 13.3 source 冲突

当不同来源给出冲突信息时：

- 不强行统一
- 在 `constraints` 或 `unresolved_points` 中显式写出冲突

---

## 14. 示例

## 14.1 请求

```json
{
  "request_id": "kr_001",
  "session_id": "sess_001",
  "requester": "service-agent",
  "query": "停机保号最长可以办理多久，线上是否可办",
  "intent": "temporary_service_suspension",
  "scope": ["skill_refs", "km_assets"],
  "skill_id": "service-suspend",
  "constraints": {
    "top_k": 4,
    "freshness_days": 30,
    "require_sources": true,
    "answer_style": "decision_support"
  }
}
```

## 14.2 推荐输出

```json
{
  "packet_id": "kp_001",
  "request_id": "kr_001",
  "query": "停机保号最长可以办理多久，线上是否可办",
  "intent": "temporary_service_suspension",
  "answer_brief": "当前证据表明，停机保号的办理时长存在上限，且线上办理是否支持与当前渠道及用户状态有关，不能直接对所有用户统一承诺。",
  "evidence_items": [
    {
      "source_type": "skill_ref",
      "source_id": "service-suspend/ref-01",
      "title": "停机保号参考说明",
      "snippet": "线上可办理需满足指定条件，超出条件时需人工或线下渠道处理。",
      "confidence": 0.91,
      "freshness": "2026-04-01",
      "trust_level": "high"
    },
    {
      "source_type": "km_asset",
      "source_id": "asset_123",
      "title": "停开机业务规则",
      "snippet": "保号时长以现网规则为准，部分用户状态不支持在线直接办理。",
      "confidence": 0.86,
      "freshness": "2026-03-28",
      "trust_level": "high"
    }
  ],
  "constraints": [
    "是否可线上办理取决于当前用户状态和渠道条件",
    "不要对具体上限做无来源承诺"
  ],
  "unresolved_points": [
    "尚未核验该用户当前账户状态"
  ],
  "confidence": 78
}
```

---

## 15. 与当前能力的迁移建议

## 15.1 先复用 `reply-copilot` 的 keyword scoring

不建议推翻。

推荐：

- 把它作为 `lexical_score` 的 v1 基础

## 15.2 逐步把 `agent-copilot` 的 JSON 生成能力迁移到 packet 生成

也就是：

- 保留“检索后让模型生成结构化结果”的思路
- 但把输出从坐席文案换成 `KnowledgePacket`

## 15.3 与 memory 系统的接入顺序

推荐：

1. `km_assets`
2. `skill_refs`
3. `long_term_memory`
4. `workspace_memory`

原因：

- 先让高信任来源站稳
- 再逐步引入更灵活、但更容易污染的来源

---

## 16. 评测建议

对 `knowledge-agent`，当前阶段最值得先盯的指标是：

- `retrieval_precision_at_k`
- `citation_correctness`
- `constraint_respect_rate`
- `knowledge_packet_usefulness`
- `stale_knowledge_rate`

其中最重要的不是纯检索分数，而是：

> 这个 packet 有没有真的帮助上游 Agent 做出更稳的决策。

---

## 17. 当前阶段的默认建议

如果现在就要给 `ai-bot` 上一版 `knowledge-agent`，我的主张是：

1. 先逻辑独立，不急着拆独立服务
2. 先做 `KnowledgeRequest -> KnowledgePacket`
3. 先用 `scope + hybrid retrieval + compression`
4. 先让高信任来源优先
5. 不足证据时宁可保守，也不硬编结论

一句话：

> `knowledge-agent` 第一版最重要的不是“什么都能答”，而是“答得有证据、知道自己哪里没证据”。 

---

## 18. 最终结论

`knowledge-agent` 的本质不是一个更会说话的问答模型，而是一层证据编排器。

它真正要做好的事是：

- 查得准
- 排得稳
- 压得短
- 说得克制
- 缓得住

一句话总结：

> 让 `knowledge-agent` 输出证据包，而不是输出幻觉，四 Agent 架构里的知识层才算真正成立。 
