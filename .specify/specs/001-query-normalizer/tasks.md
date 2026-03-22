# Implementation Tasks: Query Normalizer

**Branch**: `001-query-normalizer` | **Date**: 2026-03-22
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

## Task Dependency Graph

```
T1 (types.ts)
├── T2 (preprocess.ts)
├── T3 (time-resolver.ts)
├── T4 (dictionaries + telecom-lexicon.ts)
├── T5 (coverage.ts + ambiguity-detector.ts)
└── T6 (llm-fallback.ts)
     │
     ▼
T7 (rewrite-builder.ts + format.ts)
     │
     ▼
T8 (index.ts — 主编排)
     │
     ▼
T9 (集成 — runner.ts + chat-ws.ts + 初始化)
     │
     ▼
T10 (集成测试)
```

T2/T3/T4/T5/T6 仅依赖 T1，彼此独立可并行。

---

## T1: 定义类型与接口（types.ts）

**文件**: `backend/src/services/query-normalizer/types.ts`
**依赖**: 无
**预计改动**: 1 个新文件

定义所有共享类型：

```typescript
// 核心输出
export interface NormalizedQuery { ... }
export interface TimeSlot { ... }
export interface Ambiguity { ... }
export interface NormalizedSlots { ... }

// Stage 内部类型
export interface TimeMatch { ... }
export interface TimeResolveResult { ... }
export interface LexiconEntry { ... }
export interface LexiconMatch { ... }
export interface LexiconMatchResult { ... }
export interface IdentifierMatch { ... }
export interface CoverageResult { ... }
export interface AmbiguityRule { ... }
export type AmbiguityTrigger = ...
```

**验收**: 类型文件无编译错误，所有 interface 和 type 与 plan.md 中的定义一致。

---

## T2: Stage 1 — 文本预处理（preprocess.ts）

**文件**: `backend/src/services/query-normalizer/preprocess.ts`
**依赖**: T1
**预计改动**: 1 个新文件 + 1 个测试文件

实现：
1. 全角字符 → 半角（数字、字母、常用标点）
2. 多余空白合并为单空格
3. 首尾 trim
4. 提取标识符：
   - 手机号：`/1[3-9]\d{9}/`
   - 订单号：`/[A-Za-z]?\d{10,20}/`（粗匹配）
5. 返回 `{ cleaned: string, identifiers: IdentifierMatch[] }`

**测试文件**: `tests/unittest/backend/query-normalizer/preprocess.test.ts`

测试用例：
- 全角数字"１３８" → "138"
- 多空格合并
- 提取手机号 "我号码是13800138000" → identifiers[0].value = "13800138000"
- 空字符串 → cleaned = "", identifiers = []

---

## T3: Stage 2 — 时间归一化（time-resolver.ts）

**文件**: `backend/src/services/query-normalizer/time-resolver.ts`
**依赖**: T1
**预计改动**: 1 个新文件 + 1 个测试文件

实现：
1. 中文数字映射工具函数 `parseCnNumber`
2. 8 类正则规则（按优先级从高到低）
3. 区间占用检测（已匹配区间不被低优先级覆盖）
4. `normalized_text` 生成（将匹配到的相对时间替换为标准表达）
5. 模糊时间标记为 ambiguity

**纯函数**: `resolveTime(text: string, now: Date): TimeResolveResult`

**测试文件**: `tests/unittest/backend/query-normalizer/time-resolver.test.ts`

测试用例（至少覆盖）：
- "上个月" (now=2026-03-22) → value="2026-02", source="relative"
- "2026年2月" → value="2026-02", source="explicit"
- "上个月" (now=2026-01-15) → value="2025-12"（跨年）
- "最近三个月" (now=2026-03) → kind="date_range", value="2026-01~2026-03"
- "本期账单" → kind="billing_period", value="current"
- "上期" → kind="billing_period", value="previous"
- "去年12月" (now=2026-03) → value="2025-12"
- "最近话费" → ambiguity (time)
- "2026年2月15日" → kind="specific_date", value="2026-02-15"
- "1月到3月" (now=2026) → kind="date_range", value="2026-01~2026-03"
- 同时出现显式+相对 → 各自独立解析
- 无时间词 → matches=[], ambiguities=[]

---

## T4: Stage 3 — 术语映射（dictionaries + telecom-lexicon.ts）

**文件**:
- `backend/src/services/query-normalizer/dictionaries/billing.json`
- `backend/src/services/query-normalizer/dictionaries/products.json`
- `backend/src/services/query-normalizer/dictionaries/network.json`
- `backend/src/services/query-normalizer/dictionaries/identity.json`
- `backend/src/services/query-normalizer/dictionaries/actions.json`
- `backend/src/services/query-normalizer/telecom-lexicon.ts`

**依赖**: T1
**预计改动**: 6 个新文件 + 1 个测试文件

实现：
1. 5 个 JSON 词典文件（内容见 plan.md）
2. `loadLexicons(dictDir)` — 初始加载 + fs.watch 热更新
3. `rebuildIndex()` — 所有 patterns 按长度降序排列
4. `matchLexicon(text)` — 扫描匹配，长词优先 + priority 优先 + 区间不重叠
5. JSON 解析失败时保留旧词典 + logger.error

**测试文件**: `tests/unittest/backend/query-normalizer/telecom-lexicon.test.ts`

测试用例：
- "乱扣费" → term="unexpected_charge", intent_hint="bill_dispute"
- "视频包" → term="value_added_service.video"
- "收不到验证码" 优先于 "验证码"（长词优先）
- "没网还打不了电话" → 两个独立匹配
- "退订视频包" → cancel_service + value_added_service.video
- "销户" 不被 "退订" 吞掉（priority 更高）
- 无匹配词 → matches=[]

---

## T5: Stage 4 — 置信度计算 + 歧义检测

**文件**:
- `backend/src/services/query-normalizer/coverage.ts`
- `backend/src/services/query-normalizer/ambiguity-detector.ts`

**依赖**: T1
**预计改动**: 2 个新文件 + 1 个测试文件

### coverage.ts

实现：
1. 停用词表（约 30 个）
2. 合并所有已识别区间（time + lexicon + identifier）
3. 去除停用词后计算 coverage
4. `should_fallback_llm = coverage < 0.7`

### ambiguity-detector.ts

实现：
1. 5 条内置歧义规则（停机/锁了/取消/没网/话费）
2. `detectAmbiguities(matches, timeResult)` — 规则触发时填入 original_text
3. terms_absent 类型：检查 cancel_service 出现但无产品 term 时触发

**测试文件**: `tests/unittest/backend/query-normalizer/coverage.test.ts`

测试用例：
- "查下上个月话费" → coverage=1.0, should_fallback=false
- "我那个啥包好像多扣了" → coverage<0.7, should_fallback=true
- "停机" → ambiguity: account_state
- "退订"（无产品上下文） → ambiguity: service_subtype
- 空字符串 → coverage=0, should_fallback=true

---

## T6: Stage 5 — LLM 兜底（llm-fallback.ts）

**文件**: `backend/src/services/query-normalizer/llm-fallback.ts`
**依赖**: T1
**预计改动**: 1 个新文件 + 1 个测试文件

实现：
1. 模型初始化：`siliconflow(process.env.QUERY_NORMALIZER_MODEL ?? 'stepfun-ai/Step-3.5-Flash')`
2. Zod schema 定义 `LlmNormalizeSchema`
3. Prompt 构建：原话 + 规则层已提取部分
4. `generateObject` 调用 + Promise.race 2s 超时
5. 超时/异常 → 返回 null（降级）
6. 日志记录（成功/超时/异常）

**测试文件**: `tests/unittest/backend/query-normalizer/llm-fallback.test.ts`

测试用例：
- prompt 构建正确性（snapshot test）
- 超时降级返回 null
- Zod schema 校验（给定 mock 输出验证解析）

注意：单元测试中 mock LLM 调用，不实际请求外部 API。

---

## T7: Stage 6 — Rewrite 拼接 + 系统提示格式化

**文件**:
- `backend/src/services/query-normalizer/rewrite-builder.ts`
- `backend/src/services/query-normalizer/format.ts`

**依赖**: T1, T3, T4（使用其输出类型）
**预计改动**: 2 个新文件

### rewrite-builder.ts

实现：
1. `buildRewrite(timeResult, lexiconResult)` — 规则层 rewrite 拼接
2. 有动作 + 对象 → 标准句式（"2026年2月 视频类增值业务 退订"）
3. 无法拼出结构 → 返回时间替换后的原文

### format.ts

实现：
1. `formatNormalizedContext(nc: NormalizedQuery): string` — 系统提示注入文本
2. 只输出非空槽位
3. 歧义提醒格式化
4. 置信度和来源标注

无独立测试文件，在 T10 集成测试中覆盖。

---

## T8: 主编排（index.ts）

**文件**: `backend/src/services/query-normalizer/index.ts`
**依赖**: T2, T3, T4, T5, T6, T7
**预计改动**: 1 个新文件

实现：
1. `normalizeQuery(userMessage, context?)` — 编排 Stage 1-6
2. 调用顺序：preprocess → resolveTime → matchLexicon → evaluateCoverage + detectAmbiguities → (llmFallback) → assemble
3. 合并 slots（mergeSlots）：time + lexicon + identifiers + llm additional
4. 去重 intent_hints 和 ambiguities
5. 组装 NormalizedQuery + 计算 latency_ms
6. 结构化日志
7. 导出 `loadLexicons`（供 index.ts 初始化调用）

---

## T9: 集成接入

**文件**:
- `backend/src/engine/runner.ts` — RunAgentOptions 扩展 + 系统提示注入
- `backend/src/chat/chat-ws.ts` — 调用 normalizeQuery
- `backend/src/chat/voice.ts` — 调用 normalizeQuery（语音转文字后）
- `backend/src/chat/outbound.ts` — 调用 normalizeQuery
- `backend/src/index.ts` — 服务启动时 loadLexicons

**依赖**: T8
**预计改动**: 5 个文件修改（均为小改动）

步骤：
1. `runner.ts`：RunAgentOptions 新增 `normalizedContext?: NormalizedQuery`（可选），buildSystemPrompt 后追加 `formatNormalizedContext()`
2. `chat-ws.ts`：onMessage 中，`runAgent` 调用前加 `normalizeQuery(message, { currentDate, phone, lang })`
3. `voice.ts`：ASR 转文字后加 normalizeQuery
4. `outbound.ts`：同上
5. `index.ts`：服务启动时调用 `loadLexicons(dictDir)`

**验收**: 服务正常启动，发送消息后日志中出现 `query-normalizer normalized` 记录。

---

## T10: 集成测试

**文件**: `tests/unittest/backend/query-normalizer/index.test.ts`
**依赖**: T8, T9
**预计改动**: 1 个新文件

端到端测试 normalizeQuery 全流水线：

| 输入 | 预期 confidence | 预期 source | 关键断言 |
|------|----------------|-------------|---------|
| "查下上个月话费" | ≥ 0.7 | rules | time.value="2026-02", intent_hints含"bill_inquiry" |
| "帮我看看视频包能不能退" | ≥ 0.7 | rules | service_subtype="value_added_service.video", action_type="cancel_service" |
| "今天突然没网了还打不了电话" | ≥ 0.7 | rules | 两个 network_issue_type match |
| "我上个月那个视频包是不是乱扣了" | ≥ 0.7 | rules | time + video + unexpected_charge |
| "查账单顺便退视频包" | ≥ 0.7 | rules | intent_hints 含 bill_inquiry + service_cancel |
| "" | 0 | rules | 空结果 |
| "你们这个系统是不是有问题啊" | < 0.7 | rules+llm | LLM 兜底触发（mock） |

rewrite 格式检查：
- 不含英文 term（只用中文 label）
- 不扩大业务承诺

format.ts 输出检查：
- 系统提示包含"用户输入分析"标题
- 非空槽位正确列出
- 歧义提醒格式正确

---

## 实施顺序建议

```
Phase 1（可并行）: T1 → T2 + T3 + T4 + T5 + T6
Phase 2:           T7
Phase 3:           T8
Phase 4:           T9
Phase 5:           T10
```

T2-T6 互相独立，可由多个 agent 并行开发。T7 之后的任务需要串行。
