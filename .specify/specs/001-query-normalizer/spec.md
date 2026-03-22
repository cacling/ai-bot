# 功能规格说明：Query Normalizer（用户输入标准化层）

**功能分支**: `001-query-normalizer`
**创建日期**: 2026-03-22
**状态**: Draft
**输入**: 用户描述："智能机器人经常识别不准用户的问句里的词（尤其在语音客服），需要做一个 query 重写/标准化方案"

## 系统概述

在用户消息进入 LLM 之前，增加一个 **Input Normalization Layer（Query Normalizer）**，将口语化的用户输入转换为稳定、可执行、可审计的中间表示。后续 Skill / Tool 只消费标准化结果。

该层同时完成：
- 口语改写（rewrite）
- 时间归一化（time normalization）
- 专业术语映射（term mapping）
- 槽位抽取（slot extraction）
- 歧义标记（ambiguity flagging）

**设计方案**：规则引擎 + LLM 兜底的混合方案（方案 C）。高频场景走规则（快 + 确定性），长尾场景有 LLM 兜底（准确），时间归一化永远走规则。

## 用户场景与测试

### User Story 1 — 时间归一化（Priority: P1）

用户使用口语化的时间表达（"上个月"、"本期"、"最近三个月"）查询账单或业务，系统将相对时间归一化为绝对时间，避免 LLM 自己推算日期出错。

**Why this priority**: 时间误判是当前最高频的识别错误，直接导致查错月份的账单。

**Independent Test**: 发送"查下上个月话费"（当前日期 2026-03-22），验证 normalized_slots.time.value 为 "2026-02"。

**Acceptance Scenarios**:

1. **Given** 当前日期为 2026-03-22, **When** 用户说"上个月账单", **Then** time.value = "2026-02", time.source = "relative"
2. **Given** 当前日期为 2026-03-22, **When** 用户说"2026年2月账单", **Then** time.value = "2026-02", time.source = "explicit"
3. **Given** 当前日期为 2026-01-15, **When** 用户说"上个月", **Then** time.value = "2025-12"（正确跨年）
4. **Given** 用户说"本期账单", **When** 系统解析, **Then** time.kind = "billing_period", time.value = "current"
5. **Given** 用户说"最近三个月"（当前 2026-03）, **When** 系统解析, **Then** time.kind = "date_range", time.value = "2026-01~2026-03"
6. **Given** 用户说"最近话费不对", **When** 系统解析, **Then** ambiguities 包含 time 歧义

---

### User Story 2 — 术语映射与意图提示（Priority: P1）

用户使用口语化的电信术语（"乱扣费"、"没网"、"视频包"），系统将其映射为标准化术语和意图提示，辅助 LLM 更准确地理解用户需求。

**Why this priority**: 术语歧义是第二高频的识别错误，尤其语音转写场景。

**Independent Test**: 发送"帮我看看视频包能不能退"，验证 service_subtype = "value_added_service.video", action_type = "cancel_service"。

**Acceptance Scenarios**:

1. **Given** 用户说"乱扣费", **When** 系统匹配, **Then** issue_type = "unexpected_charge", intent_hints 包含 "bill_dispute"
2. **Given** 用户说"没网还打不了电话", **When** 系统匹配, **Then** 同时识别 data_service_issue 和 voice_service_issue（多症状）
3. **Given** 用户说"套餐"和"流量包"同时出现, **When** 系统匹配, **Then** 拆成两个独立产品对象
4. **Given** 用户说"退订", **When** 无具体产品上下文, **Then** ambiguities 标记 service_subtype 歧义

---

### User Story 3 — 低置信 LLM 兜底（Priority: P2）

当用户输入过于口语化或模糊，规则引擎无法覆盖时（coverage < 0.7），系统自动调用小模型补全槽位和改写。

**Why this priority**: 长尾场景的覆盖保障，确保不会因为词典不全而完全失效。

**Independent Test**: 发送"我那个啥包好像多扣了"，验证 source = "rules+llm"，且 rewritten_query 包含业务含义。

**Acceptance Scenarios**:

1. **Given** 用户说"我那个啥包好像多扣了", **When** 规则层 coverage < 0.7, **Then** 触发 LLM 兜底, source = "rules+llm"
2. **Given** LLM 调用超时（> 2s）, **When** 系统降级, **Then** 使用规则层部分结果, 不阻塞主流程
3. **Given** 用户说"查下上个月话费"（高置信）, **When** coverage ≥ 0.7, **Then** 不触发 LLM, source = "rules"

---

### User Story 4 — 多意图识别（Priority: P2）

用户在一句话中包含多个意图（"帮我查上个月账单，顺便看看视频包能不能退"），系统能同时识别多个 intent_hints。

**Why this priority**: 多意图是电信客服常见场景，硬压成单意图会漏掉用户的部分需求。

**Independent Test**: 发送上述多意图句子，验证 intent_hints 同时包含 "bill_inquiry" 和 "service_cancel"。

**Acceptance Scenarios**:

1. **Given** 用户说"查账单顺便退视频包", **When** 系统解析, **Then** intent_hints = ["bill_inquiry", "service_cancel"]
2. **Given** 用户说"没网了还打不了电话", **When** 系统解析, **Then** 产出两个 network_issue_type slot

---

### User Story 5 — 词典热更新（Priority: P3）

运营人员修改 dictionaries/ 目录下的 JSON 词典文件后，系统自动重新加载，无需重启服务。

**Why this priority**: 和 Skills 热更新保持一致的运维体验，但初期词典变更频率低。

**Independent Test**: 在 billing.json 中新增一条 pattern，不重启服务，验证新 pattern 能被匹配。

**Acceptance Scenarios**:

1. **Given** 服务运行中, **When** 修改 billing.json 新增 pattern, **Then** 下次请求自动生效
2. **Given** 词典文件 JSON 格式错误, **When** 系统尝试加载, **Then** 保留旧词典, 日志报错

---

### Edge Cases

- 用户输入为空字符串或纯标点符号 → 返回空 NormalizedQuery，confidence = 0
- 用户输入纯英文 → 规则层跳过（词典为中文），交给 LLM 兜底或透传
- 极长输入（> 500 字）→ 截断到前 200 字做归一化，避免性能问题
- 同时出现显式时间和相对时间指向同一月份 → 去重，保留 explicit
- "退订"不能被 rewrite 成"立即退订并退款" → rewrite 不扩大业务承诺

## Requirements

### Functional Requirements

- **FR-001**: 系统 MUST 在用户消息进入 LLM 之前执行 normalizeQuery，产出 NormalizedQuery JSON
- **FR-002**: 系统 MUST 将相对时间（"上个月"）归一化为绝对时间（"2026-02"），基于当前日期计算
- **FR-003**: 系统 MUST 区分自然月（"本月"）和账期（"本期"）两种时间语义
- **FR-004**: 系统 MUST 将电信口语术语映射为标准化术语（内部 term）和中文标签（外部 label）
- **FR-005**: 系统 MUST 支持一条输入匹配多个术语和多个意图（不硬压成单意图）
- **FR-006**: 系统 MUST 在规则层覆盖率 < 0.7 时触发 LLM 兜底，补全槽位和改写
- **FR-007**: 系统 MUST 对有歧义的字段输出 ambiguities 数组，由下游 Skill 决定是否追问
- **FR-008**: 系统 MUST 保留用户原话（original_query），rewrite 只在内部使用
- **FR-009**: 系统 MUST 记录每次归一化的结构化日志（原话、置信度、来源、耗时）
- **FR-010**: NormalizedQuery 以系统提示补充信息注入 LLM，不替代原始消息
- **FR-011**: 词典文件（JSON）MUST 支持热更新，修改后无需重启
- **FR-012**: LLM 兜底 MUST 有 2s 超时，超时后降级使用规则层结果
- **FR-013**: Rewrite 不得扩大用户请求范围或添加业务承诺

### Key Entities

- **NormalizedQuery**: 归一化结果的完整结构（original_query, rewritten_query, intent_hints, normalized_slots, ambiguities, confidence, source, latency_ms）
- **TimeSlot**: 时间槽位（kind, value, source）
- **LexiconEntry**: 词典条目（patterns, term, label, category, slot_field, intent_hint, priority）
- **Ambiguity**: 歧义标记（field, candidates, original_text）

## Success Criteria

### Measurable Outcomes

- **SC-001**: 高频场景（时间 + 术语覆盖的请求）归一化延迟 < 5ms（p99）
- **SC-002**: LLM 兜底场景归一化延迟 < 500ms（p95），2s 封顶
- **SC-003**: 规则层对 Top 50 高频用户问句的覆盖率 ≥ 80%（confidence ≥ 0.7）
- **SC-004**: 时间归一化准确率 100%（规则引擎，确定性逻辑）
- **SC-005**: 首字响应时间增加不超过 10ms（高置信场景）
