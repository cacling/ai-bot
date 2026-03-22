# Implementation Plan: Query Normalizer

**Branch**: `001-query-normalizer` | **Date**: 2026-03-22 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-query-normalizer/spec.md`

## Summary

在用户消息进入主 LLM 之前增加 Input Normalization Layer，采用**规则引擎 + LLM 兜底的混合方案**。规则层处理时间归一化、术语映射、槽位抽取；低置信时调用小模型（Step-3.5-Flash）补全。产出的 NormalizedQuery 作为系统提示补充信息注入，不替代原始消息。

## Technical Context

**Language/Version**: TypeScript strict (Bun runtime)
**Primary Dependencies**: Vercel AI SDK (`generateObject`), Zod (schema validation), `@ai-sdk/openai` (SiliconFlow provider)
**Storage**: N/A（纯运行时，不落库；词典为 JSON 文件）
**Testing**: Bun:test（单元测试）
**Target Platform**: Bun server (backend)
**Project Type**: Backend service module
**Performance Goals**: < 5ms (rules-only), < 500ms p95 (rules+llm), 2s timeout cap
**Constraints**: 不增加主 LLM 调用延迟超过 10ms（高置信场景）；LLM 兜底超时必须有降级
**Scale/Scope**: 5 个词典文件（~100 条 patterns），6 个 Stage 的处理流水线

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. 知行分离 | PASS | Query Normalizer 是输入预处理，不执行业务操作，不触及 MCP/Skill 职责边界 |
| II. 状态图驱动 | N/A | 不涉及 Skill 状态图 |
| III. 并行优先 | PASS | Stage 2 和 Stage 3 无依赖可并行；Stage 5 LLM 兜底有超时降级不阻塞 |
| IV. 安全操作确认 | PASS | Normalizer 不执行任何不可逆操作；rewrite 不扩大业务承诺（FR-013） |
| V. 热更新零停机 | PASS | 词典 JSON 文件支持 fs.watch 热更新 |
| VII. 密钥零硬编码 | PASS | LLM 模型通过 `QUERY_NORMALIZER_MODEL` 环境变量配置 |
| VIII. 接口向后兼容 | PASS | 新增 normalizedContext 为可选参数，不破坏现有 runAgent 签名 |
| XI. 复杂度论证 | See below | |

## Project Structure

### Documentation (this feature)

```text
.specify/specs/001-query-normalizer/
├── spec.md              # 功能规格
└── plan.md              # 本文件（实现方案）
```

### Source Code (repository root)

```text
backend/src/services/query-normalizer/
├── index.ts              # 主编排（normalizeQuery）— Stage 1+6 组装
├── types.ts              # 所有 interface/type 定义
├── preprocess.ts         # Stage 1: 文本清洗 + 标识符提取
├── time-resolver.ts      # Stage 2: 时间归一化（纯规则引擎）
├── telecom-lexicon.ts    # Stage 3: 术语匹配引擎 + 词典加载 + 热更新
├── coverage.ts           # Stage 4: 置信度计算
├── ambiguity-detector.ts # Stage 4: 歧义检测
├── llm-fallback.ts       # Stage 5: LLM 兜底（小模型 structured output）
├── rewrite-builder.ts    # Stage 6: rewrite 文本拼接
├── format.ts             # 系统提示注入格式化
└── dictionaries/         # JSON 词典（热更新）
    ├── billing.json      # 账务类（9 条）
    ├── products.json     # 套餐/产品类（8 条）
    ├── network.json      # 网络/故障类（8 条）
    ├── identity.json     # App/身份/安全类（5 条）
    └── actions.json      # 动作/办理/投诉类（10 条）

tests/unittest/backend/query-normalizer/
├── time-resolver.test.ts
├── telecom-lexicon.test.ts
├── coverage.test.ts
├── ambiguity-detector.test.ts
└── index.test.ts         # 集成测试（全流水线）
```

**Structure Decision**: 作为 `backend/src/services/` 下的子目录模块，和现有的 `keyword-filter.ts`、`hallucination-detector.ts` 同级。选择子目录而非单文件是因为模块内部有 6 个 Stage + 词典文件，单文件会过大。

## Complexity Tracking

| New Complexity | Why Needed | Simpler Alternative Rejected Because |
|----------------|------------|--------------------------------------|
| 新增 services 子目录（10 个文件） | 6 个 Stage 各有独立职责 + 词典文件 | 单文件方案：Stage 逻辑混杂，难以独立测试和维护 |
| LLM 兜底调用 | 规则引擎无法覆盖所有口语变体 | 纯规则方案：长尾覆盖率不足，"我那个啥包好像多扣了"等无法匹配 |
| 词典 JSON 文件 | 运营可直接编辑，热更新无需改代码 | TypeScript 常量方案：每次改词典都要改代码重启 |

## Architecture

### 流水线架构（6 Stage Pipeline）

```
用户原话
  │
  ▼
┌──────────────────────────────────────────────┐
│ Stage 1: preprocess.ts                       │
│ - 全角→半角，去多余空白                       │
│ - 提取标识符（手机号、订单号）                 │
│ 输出: cleaned text + identifiers             │
└──────────────────┬───────────────────────────┘
                   ▼
┌──────────────────────────────────────────────┐
│ Stage 2: time-resolver.ts（纯规则，必走）     │
│ - 正则匹配 8 类时间表达式（优先级从高到低）    │
│ - 显式时间 > 相对自然月 > 账期 > 模糊时间     │
│ - 纯函数 resolveTime(text, now)              │
│ 输出: TimeMatch[] + ambiguities + normalized_text │
└──────────────────┬───────────────────────────┘
                   ▼
┌──────────────────────────────────────────────┐
│ Stage 3: telecom-lexicon.ts（词典匹配，必走） │
│ - 加载 5 个 JSON 词典，构建按长度降序的索引    │
│ - 长词优先 + priority 优先 + 区间不重叠        │
│ - fs.watch 监听变化，自动重新加载              │
│ 输出: LexiconMatch[] + intent_hints + slots   │
└──────────────────┬───────────────────────────┘
                   ▼
┌──────────────────────────────────────────────┐
│ Stage 4: coverage.ts + ambiguity-detector.ts │
│ - 合并已识别区间，去除停用词，计算 coverage   │
│ - 内置歧义规则检测（停机/锁了/话费/取消/没网）│
│ - coverage ≥ 0.7 → 高置信 → 跳过 LLM        │
│ - coverage < 0.7 → 低置信 → 进入 Stage 5     │
└──────────────────┬───────────────────────────┘
                   ▼ (仅低置信)
┌──────────────────────────────────────────────┐
│ Stage 5: llm-fallback.ts                     │
│ - 模型: Step-3.5-Flash (env: QUERY_NORMALIZER_MODEL) │
│ - Vercel AI SDK generateObject + Zod schema  │
│ - 输入: 原话 + 规则层已提取的部分结果         │
│ - 超时: 2s，失败降级用规则层结果              │
│ 输出: rewritten_query + additional_slots + ambiguities │
└──────────────────┬───────────────────────────┘
                   ▼
┌──────────────────────────────────────────────┐
│ Stage 6: index.ts + rewrite-builder.ts       │
│ - 合并所有 Stage 结果 → NormalizedQuery JSON  │
│ - 规则层 rewrite: 时间替换 + label 拼接       │
│ - 结构化日志记录                              │
│ 输出: NormalizedQuery                         │
└──────────────────────────────────────────────┘
```

### 核心数据结构

```typescript
interface NormalizedQuery {
  original_query: string;
  rewritten_query: string;
  intent_hints: string[];
  normalized_slots: {
    time?: TimeSlot;
    msisdn?: string;
    customer_id?: string;
    service_category?: string;
    service_subtype?: string;
    issue_type?: string;
    action_type?: string;
    network_issue_type?: string;
    account_state?: string;
  };
  ambiguities: Ambiguity[];
  confidence: number;
  source: 'rules' | 'rules+llm';
  latency_ms: number;
}

interface TimeSlot {
  kind: 'natural_month' | 'billing_period' | 'date_range' | 'specific_date';
  value: string;
  source: 'explicit' | 'relative';
}

interface Ambiguity {
  field: string;
  candidates: string[];
  original_text: string;
}

interface LexiconEntry {
  patterns: string[];
  term: string;
  label: string;
  category: string;
  slot_field: string;
  intent_hint?: string;
  priority?: number;
}
```

### 集成方式

**接入点**: chat-ws.ts / voice.ts / outbound.ts，在调用 `runAgent()` 之前执行 `normalizeQuery()`。

**runAgent 改动**: `RunAgentOptions` 新增可选字段 `normalizedContext?: NormalizedQuery`，注入系统提示。

**系统提示注入格式**（format.ts）:

```
## 用户输入分析（系统自动生成，仅供参考）

- 标准化改写：2026年2月视频类增值业务异常扣费查询
- 意图提示：bill_inquiry、bill_dispute
- 时间：2026-02（根据相对时间推算）
- 业务子类：value_added_service.video
- 问题类型：unexpected_charge
- 分析置信度：95%（来源：rules）
```

**不改什么**:
- `messages` 数组中的 `userMessage` 不变（主 LLM 需要原话）
- Skill 匹配逻辑不变（仍由 LLM 决定）
- 合规检查（keyword-filter）不变（管输出，normalizer 管输入）
- 前端展示不变（永远显示原话）
- DB 存储不变（messages 表存原话）

### 初始化

```typescript
// backend/src/index.ts
import { loadLexicons } from './services/query-normalizer';
loadLexicons(join(REPO_ROOT, 'backend/src/services/query-normalizer/dictionaries'));
```

### 模型配置

```bash
# .env
# Query Normalizer LLM（用户输入标准化：口语改写、时间归一化、术语映射、槽位抽取、歧义标记）
# 仅在规则引擎低置信时触发，要求低延迟，默认 Step-3.5-Flash
#QUERY_NORMALIZER_MODEL=stepfun-ai/Step-3.5-Flash
```

代码中通过 `siliconflow(process.env.QUERY_NORMALIZER_MODEL ?? 'stepfun-ai/Step-3.5-Flash')` 使用，复用现有 SiliconFlow provider。

### 词典设计

5 个 JSON 文件，MVP 共约 40 条 entries：

| 文件 | 条目数 | 覆盖范围 |
|------|--------|---------|
| billing.json | 9 | 话费/月租/欠费/余额/充值/发票/调账/销账/乱扣费 |
| products.json | 8 | 套餐/流量包/视频包/增值业务/宽带/副卡/家庭套餐/漫游包 |
| network.json | 8 | 没网/信号差/网速慢/打不了电话/掉线/短信/漫游/5G降4G |
| identity.json | 5 | 验证码/收不到验证码/登录失败/账号锁定/闪退 |
| actions.json | 10 | 退订/销户/换套餐/停机/复机/开通/补卡/转人工/投诉/拒绝外呼 |

### 时间归一化规则

正则优先级从高到低：

```
1. 显式完整日期    /(\d{4})[年\-.](\d{1,2})[月\-.](\d{1,2})[日号]?/
2. 显式年月        /(\d{2,4})[年\-.](\d{1,2})月?/
3. 显式月份范围    /(\d{1,2})月?\s*[到至~\-]\s*(\d{1,2})月/
4. 去年X月         /去年(\d{1,2})月/
5. 相对自然月      /(本|这个?|当)月/  /(上|前)(一个?)?月/  /(下|后)(一个?)?月/
6. 最近N个月       /最近\s*([两三四五六\d]+)\s*个?月/
7. 账期关键词      /(本|当|这)(一?)(期|账期)/  /(上|前)(一?)(期|账期)/
8. 模糊时间        /最近/  /之前|以前/  /那个月/
```

中文数字映射：一=1, 二=2, 两=2, 三=3 ... 十二=12。

### 置信度计算

```
coverage = 已识别字符数 / (总字符数 - 停用词字符数)
should_fallback_llm = coverage < 0.7
```

停用词：的、了、吗、呢、帮我、查下、看看、一下、是不是、能不能 等约 30 个高频虚词。

### 歧义规则（内置 5 条）

| 触发词 | 歧义 field | candidates |
|--------|-----------|------------|
| 停机 | account_state | arrears_suspended / voluntary_suspended / network_issue |
| 锁了 | account_state | account_locked / device_risk_control |
| 取消（无产品上下文） | service_subtype | value_added_service / data_add_on / plan |
| 没网 | network_issue_type | data_service_issue / arrears_suspended / area_outage |
| 话费 | issue_type | total_bill / plan_monthly_fee / overage_charge |

### LLM 兜底 Prompt

```
你是电信客服系统的输入标准化助手。用户原话如下：
"{original}"

规则引擎已识别的部分：
{已提取 slots JSON}

请补全：rewritten_query, intent_hints, additional_slots, ambiguities。
要求：不扩大请求范围，不添加业务承诺，不确定则放入 ambiguities。
```

使用 Vercel AI SDK `generateObject` + Zod schema 获取 structured output。

### 性能预期

| 场景 | 耗时 | 说明 |
|------|------|------|
| 高置信（纯规则） | < 3ms | Stage 1-4 纯字符串操作 |
| 低置信（规则 + LLM） | 200-500ms | 主要是 LLM 调用 |
| LLM 超时降级 | 2000ms 封顶 | 降级后用规则层结果 |

### 日志

```typescript
logger.info('query-normalizer', 'normalized', {
  original, rewritten, confidence, source, intent_hints, latency_ms, has_ambiguities
});
```

低置信日志可定期导出，用于扩充词典 patterns。
