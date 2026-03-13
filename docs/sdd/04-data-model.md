# 04 - 数据模型

---

## 1. 用户对象（Subscriber）

**来源：** `backend/src/db/schema.ts`（Drizzle ORM）— SQLite 持久化，`backend/data/telecom.db`

```typescript
interface Subscriber {
  phone:           string;   // 手机号，主键
  name:            string;   // 用户姓名
  id_type:         string;   // 证件类型："id_card" | "passport"
  plan:            string;   // 套餐名称（人类可读）
  plan_id:         string;   // 套餐 ID，如 "enjoy_50g"
  status:          string;   // 账号状态："active" | "suspended" | "cancelled"
  balance:         number;   // 账户余额（元），负值表示欠费
  data_used_gb:    number;   // 本月已用流量（GB）
  data_total_gb:   number;   // 套餐总流量（GB），-1 表示不限量
  voice_used_min:  number;   // 本月已用语音（分钟）
  voice_total_min: number;   // 套餐总语音（分钟），-1 表示不限量
  activated_at:    string;   // 开户日期（YYYY-MM-DD）
  subscriptions:   string[]; // 已订增值业务 ID 列表
}
```

**三个测试用户：**

| 手机号 | 姓名 | 套餐 | 状态 | 余额 | 流量用量 |
|--------|------|------|------|------|---------|
| `13800000001` | 张三 | 畅享 50G（¥50/月） | active | ¥45.8 | 32.5/50GB |
| `13800000002` | 李四 | 无限流量（¥128/月） | active | ¥128.0 | 89.2GB |
| `13800000003` | 王五 | 基础 10G（¥19/月） | suspended | ¥-23.5（欠费） | 10/10GB |

---

## 2. 账单对象（Bill）

**来源：** `query_bill()` 返回值

```typescript
interface Bill {
  month:           string;  // 账单月份，格式 "YYYY-MM"
  total:           number;  // 应缴总额（元）
  plan_fee:        number;  // 套餐月租费
  data_fee:        number;  // 超出套餐的流量费
  voice_fee:       number;  // 超出套餐的语音费
  value_added_fee: number;  // 增值业务费用
  tax:             number;  // 税费
  status:          string;  // "paid"（已缴）| "unpaid"（待缴）| "overdue"（逾期）
}
```

---

## 3. 套餐对象（Plan）

**来源：** `query_plans()` 返回值

```typescript
interface Plan {
  plan_id:     string;   // 套餐 ID，如 "enjoy_50g"
  name:        string;   // 套餐名称
  monthly_fee: number;   // 月租费（元）
  data_gb:     number;   // 流量（GB），-1 表示不限量
  voice_min:   number;   // 语音分钟数，-1 表示不限量
  sms:         number;   // 短信条数
  features:    string[]; // 特色功能列表
  description: string;   // 套餐适用场景描述
}
```

**四档套餐：**

| plan_id | 名称 | 月费 | 流量 | 语音 |
|---------|------|------|------|------|
| `plan_10g` | 基础 10G 套餐 | ¥19 | 10GB | 100 分钟 |
| `plan_50g` | 畅享 50G 套餐 | ¥50 | 50GB | 500 分钟 |
| `plan_100g` | 超值 100G 套餐 | ¥88 | 100GB | 1000 分钟 |
| `plan_unlimited` | 无限流量套餐 | ¥128 | 不限量 | 不限量 |

---

## 4. 增值业务对象（ValueAddedService）

**来源：** `backend/src/db/schema.ts`（Drizzle ORM）— 与 subscribers、bills 等同库持久化

```typescript
interface ValueAddedService {
  service_id:   string;  // 业务 ID，如 "video_pkg"
  name:         string;  // 业务名称
  monthly_fee:  number;  // 月费（元）
  description:  string;  // 业务说明
}
```

**四类增值业务：**

| service_id | 名称 | 月费 |
|------------|------|------|
| `video_pkg` | 视频会员流量包（20GB/月） | ¥20 |
| `sms_100` | 短信百条包 | ¥5 |
| `roaming_pkg` | 国内漫游包 | ¥10 |
| `game_pkg` | 游戏加速包 | ¥15 |

---

## 5. 诊断结果对象（DiagnosticResult）

**来源：** `diagnose_network()` 返回值 / `scripts/run_diagnosis.ts`

```typescript
interface DiagnosticStep {
  step:   string;  // 诊断步骤名称，如 "账号状态检查"
  status: string;  // "ok" | "warning" | "error"
  detail: string;  // 诊断详情说明
}

interface DiagnosticResult {
  success:          boolean;
  phone:            string;
  issue_type:       string;  // "no_signal" | "slow_data" | "call_drop" | "no_network"
  diagnostic_steps: DiagnosticStep[];
  conclusion:       string;  // 综合诊断结论
}
```

---

## 6. 数据库 Schema（SQLite）

**来源：** `backend/src/db/schema.ts`（Drizzle ORM）
**数据库文件：** `backend/data/telecom.db`（WAL 模式，后端与 MCP Server 共享）

```typescript
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// 会话表（对话管理）
export const sessions = sqliteTable('sessions', {
  id:        text('id').primaryKey(),           // UUID，前端生成
  createdAt: text('created_at'),
});

// 消息表（对话历史，级联删除）
export const messages = sqliteTable('messages', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id').references(() => sessions.id, { onDelete: 'cascade' }),
  role:      text('role'),                      // 'user' | 'assistant'
  content:   text('content'),
  createdAt: text('created_at'),
});

// 套餐表
export const plans = sqliteTable('plans', {
  plan_id:     text('plan_id').primaryKey(),    // 'plan_10g' | 'plan_50g' | 'plan_100g' | 'plan_unlimited'
  name:        text('name'),
  monthly_fee: real('monthly_fee'),
  data_gb:     real('data_gb'),                 // -1 表示不限量
  voice_min:   integer('voice_min'),            // -1 表示不限量
  sms:         integer('sms'),
  features:    text('features'),                // JSON 数组序列化为字符串
  description: text('description'),
});

// 增值业务表
export const valueAddedServices = sqliteTable('value_added_services', {
  service_id:    text('service_id').primaryKey(), // 'video_pkg' | 'sms_100' | 'roaming_pkg' | 'game_pkg'
  name:          text('name'),
  monthly_fee:   real('monthly_fee'),
  effective_end: text('effective_end'),
});

// 用户表
export const subscribers = sqliteTable('subscribers', {
  phone:          text('phone').primaryKey(),
  name:           text('name'),
  id_type:        text('id_type'),              // 'id_card' | 'passport'
  plan_id:        text('plan_id').references(() => plans.plan_id),
  status:         text('status'),               // 'active' | 'suspended' | 'cancelled'
  balance:        real('balance'),
  data_used_gb:   real('data_used_gb'),
  voice_used_min: integer('voice_used_min'),
  activated_at:   text('activated_at'),         // YYYY-MM-DD
});

// 已订增值业务关联表（多对多）
export const subscriberSubscriptions = sqliteTable('subscriber_subscriptions', {
  phone:      text('phone').references(() => subscribers.phone),
  service_id: text('service_id').references(() => valueAddedServices.service_id),
});

// 账单表
export const bills = sqliteTable('bills', {
  id:              integer('id').primaryKey({ autoIncrement: true }),
  phone:           text('phone').references(() => subscribers.phone),
  month:           text('month'),               // 'YYYY-MM'
  total:           real('total'),
  plan_fee:        real('plan_fee'),
  data_fee:        real('data_fee'),
  voice_fee:       real('voice_fee'),
  sms_fee:         real('sms_fee'),
  value_added_fee: real('value_added_fee'),
  tax:             real('tax'),
  status:          text('status'),              // 'paid' | 'unpaid' | 'overdue'
});
```

**数据流：**

```
前端生成 session_id (UUID)
    │
    ▼ POST /api/chat
后端 upsert sessions 表
    │
    ▼
加载该 session_id 的历史 messages
    │
    ▼
Agent 推理完成后
    │
    ▼
写入 user message + assistant message 到 messages 表
```

---

## 7. Skill 元数据结构（SKILL.md frontmatter）

每个 Skill 的 `SKILL.md` 顶部包含 YAML frontmatter：

```yaml
---
name: skill-name           # Skill 唯一标识（用于 get_skill_instructions 调用）
description: "..."         # Skill 功能描述
metadata:
  version: "1.0.0"
  tags: ["tag1", "tag2"]  # 分类标签
---
```

**四个面向 Agent 的 Skill 元数据摘要：**

| Skill | name | 核心 tags |
|-------|------|-----------|
| 账单查询 | `bill-inquiry` | bill, billing, 话费, 账单 |
| 套餐咨询 | `plan-inquiry` | plan, 套餐, 升级, 推荐 |
| 业务退订 | `service-cancel` | cancel, 退订, 增值业务 |
| 故障诊断 | `fault-diagnosis` | fault, 故障, 网络, 信号, 网速 |

**两个后端内部技能（SKILL.md 约定相同，但不在 Agent 工具列表中）：**

| 目录 | name | 用途 |
|------|------|------|
| `handoff-analysis` | `handoff-analysis` | 转人工分析，统一提示词产出 JSON + 自然语言摘要 |
| `emotion-detection` | `emotion-detection` | 情绪分类，5 类体系（平静/礼貌/焦虑/不满/愤怒） |

---

## 8. HandoffAnalysis（转人工分析结果）

**来源：** `backend/src/skills/handoff-analyzer.ts`，单次 LLM 调用产出

```typescript
interface HandoffAnalysis {
  customer_intent:        string;    // 客户诉求（简短描述）
  main_issue:             string;    // 核心问题描述
  business_object:        string[];  // 涉及的业务对象（套餐名/账单/业务ID等）
  confirmed_information:  string[];  // 已核实信息（手机号、姓名等）
  actions_taken:          string[];  // 本次会话已执行操作列表
  current_status:         string;    // 当前处理状态
  handoff_reason:         string;    // 转人工原因
  next_action:            string;    // 建议坐席下一步操作
  priority:               string;    // 优先级："高" | "中" | "低"
  risk_flags:             string[];  // 风险标签（见下表）
  session_summary:        string;    // 自然语言会话摘要，80-150字
}
```

**risk_flags 枚举值：**

| 标签 | 含义 |
|------|------|
| `complaint` | 用户有投诉意图 |
| `high_value` | 高价值用户 |
| `churn_risk` | 有离网风险 |
| `overdue` | 账单逾期 |
| `repeated_contact` | 重复联系 |
| `angry` | 用户情绪激烈 |
| `high_risk_op` | 高风险操作待确认 |

---

## 9. EmotionResult（情绪检测结果）

**来源：** `backend/src/skills/emotion-analyzer.ts`，每次用户语音转写后异步触发

```typescript
interface EmotionResult {
  label: string;  // "平静" | "礼貌" | "焦虑" | "不满" | "愤怒"
  emoji: string;  // 对应表情符号
  color: string;  // 前端展示色（CSS 颜色值）
}
```

通过 `emotion_update` WebSocket 事件推送给前端，不影响主音频流程。
