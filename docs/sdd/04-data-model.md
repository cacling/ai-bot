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

## 5. 回访任务对象（CallbackTask）

**来源：** `backend/src/db/schema.ts`（Drizzle ORM）— `callback_tasks` 表

```typescript
interface CallbackTask {
  task_id:          string;  // 主键，UUID
  original_task_id: string;  // 关联的外呼任务 ID（如 C001、M001）
  customer_name:    string;  // 客户姓名
  callback_phone:   string;  // 回访电话号码
  preferred_time:   string;  // 客户期望的回访时间
  product_name:     string;  // 相关产品/业务名称
  created_at:       string;  // 创建时间（ISO 格式）
  status:           string;  // 'pending' | 'completed' | 'cancelled'
}
```

外呼通话中客户约定回访时，由 `create_callback_task` 工具写入数据库，替代原内存数组存储。

---

## 6. 设备上下文对象（DeviceContext）

**来源：** `backend/src/db/schema.ts`（Drizzle ORM）— `device_contexts` 表

```typescript
interface DeviceContext {
  phone:                   string;   // 手机号，主键
  installed_app_version:   string;   // 已安装 App 版本
  latest_app_version:      string;   // 最新 App 版本
  device_os:               string;   // 操作系统："android" | "ios"
  os_version:              string;   // 系统版本，如 "Android 13"
  device_rooted:           boolean;  // 设备是否 root/越狱
  developer_mode_on:       boolean;  // 开发者模式是否开启
  running_on_emulator:     boolean;  // 是否在模拟器上运行
  has_vpn_active:          boolean;  // 是否开启 VPN
  has_fake_gps:            boolean;  // 是否存在虚拟定位
  has_remote_access_app:   boolean;  // 是否安装远程控制软件
  has_screen_share_active: boolean;  // 是否正在屏幕共享
  flagged_apps:            string[]; // 风险 App 列表（JSON 存储）
  login_location_changed:  boolean;  // 登录地点是否异常变更
  new_device:              boolean;  // 是否为新设备
  otp_delivery_issue:      boolean;  // OTP 送达是否异常
}
```

**三个测试用户设备数据：**

| 手机号 | OS | App 版本 | 特殊标志 |
|--------|-----|----------|---------|
| `13800000001` | Android 13 | 3.2.1 | 无 |
| `13800000002` | iOS 17.4 | 3.5.0（最新） | VPN 开启 |
| `13800000003` | Android 12 | 3.0.0 | 开发者模式、登录地变更、新设备 |

MCP Server `diagnose_app` 工具从此表查询设备状态，查不到时使用默认值兜底。

---

## 7. 诊断结果对象（DiagnosticResult）

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

## 8. 数据库 Schema（SQLite）

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

// 回访任务表（外呼通话中创建）
export const callbackTasks = sqliteTable('callback_tasks', {
  task_id:          text('task_id').primaryKey(),   // UUID
  original_task_id: text('original_task_id'),       // 关联外呼任务 ID
  customer_name:    text('customer_name'),
  callback_phone:   text('callback_phone'),
  preferred_time:   text('preferred_time'),
  product_name:     text('product_name'),
  created_at:       text('created_at'),
  status:           text('status'),                 // 'pending' | 'completed' | 'cancelled'
});

// 设备上下文表（App 安全诊断用）
export const deviceContexts = sqliteTable('device_contexts', {
  phone:                   text('phone').primaryKey(),
  installed_app_version:   text('installed_app_version'),
  latest_app_version:      text('latest_app_version'),
  device_os:               text('device_os'),          // 'android' | 'ios'
  os_version:              text('os_version'),
  device_rooted:           integer('device_rooted', { mode: 'boolean' }),
  developer_mode_on:       integer('developer_mode_on', { mode: 'boolean' }),
  running_on_emulator:     integer('running_on_emulator', { mode: 'boolean' }),
  has_vpn_active:          integer('has_vpn_active', { mode: 'boolean' }),
  has_fake_gps:            integer('has_fake_gps', { mode: 'boolean' }),
  has_remote_access_app:   integer('has_remote_access_app', { mode: 'boolean' }),
  has_screen_share_active: integer('has_screen_share_active', { mode: 'boolean' }),
  flagged_apps:            text('flagged_apps'),        // JSON 数组
  login_location_changed:  integer('login_location_changed', { mode: 'boolean' }),
  new_device:              integer('new_device', { mode: 'boolean' }),
  otp_delivery_issue:      integer('otp_delivery_issue', { mode: 'boolean' }),
});

// 技能版本表（版本管理）
export const skillVersions = sqliteTable('skill_versions', {
  id:                 integer('id').primaryKey({ autoIncrement: true }),
  skill_path:         text('skill_path'),          // 文件相对路径
  content:            text('content'),             // 旧版本完整内容快照
  change_description: text('change_description'),  // 变更说明
  created_by:         text('created_by'),          // 操作人
  created_at:         text('created_at'),          // ISO 格式时间
});

// 用户与权限表
export const users = sqliteTable('users', {
  id:         text('id').primaryKey(),              // 用户 ID
  name:       text('name'),                        // 用户姓名
  role:       text('role'),                        // 'admin' | 'flow_manager' | 'config_editor' | 'reviewer' | 'auditor'
  created_at: text('created_at'),                  // 创建时间
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

## 9. Skill 元数据结构（SKILL.md frontmatter）

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

## 10. HandoffAnalysis（转人工分析结果）

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

## 11. EmotionResult（情绪检测结果）

**来源：** `backend/src/skills/emotion-analyzer.ts`，每次用户语音转写后异步触发

```typescript
interface EmotionResult {
  label: string;  // "平静" | "礼貌" | "焦虑" | "不满" | "愤怒"
  emoji: string;  // 对应表情符号
  color: string;  // 前端展示色（CSS 颜色值）
}
```

通过 `emotion_update` WebSocket 事件推送给前端，不影响主音频流程。

---

## 12. 技能版本对象（SkillVersion）

**来源：** `backend/src/db/schema.ts` — `skill_versions` 表

```typescript
interface SkillVersion {
  id:                 number;   // 自增主键
  skill_path:         string;   // 文件相对路径
  content:            string;   // 旧版本完整内容快照
  change_description: string;   // 变更说明
  created_by:         string;   // 操作人
  created_at:         string;   // 创建时间 ISO 格式
}
```

---

## 13. 用户与权限（User）

**来源：** `backend/src/db/schema.ts` — `users` 表

```typescript
interface User {
  id:         string;   // 用户 ID，主键
  name:       string;   // 用户姓名
  role:       string;   // 角色：'admin' | 'flow_manager' | 'config_editor' | 'reviewer' | 'auditor'
  created_at: string;   // 创建时间
}
```

**角色层级：** admin(5) > flow_manager(4) > config_editor(3) > reviewer(2) > auditor(1)

---

## 14. 合规检测结果（ComplianceResult）

**来源：** `backend/src/compliance/keyword-filter.ts`

```typescript
interface ComplianceResult {
  matches: ComplianceMatch[];    // 关键词匹配列表
  piiMatches: PIIMatch[];        // PII 匹配列表
  hasBlock: boolean;             // 是否包含 banned 关键词
  hasWarning: boolean;           // 是否包含 warning 关键词
  hasPII: boolean;               // 是否包含 PII
}

interface ComplianceMatch {
  keyword: string;
  category: 'banned' | 'warning' | 'pii';
  position: number;
}
```

---

## 15. 外呼任务对象（OutboundTask）

**来源：** `backend/src/db/schema.ts` — `outbound_tasks` 表

```typescript
// SQLite 表定义
export const outboundTasks = sqliteTable('outbound_tasks', {
  id:       text('id').primaryKey(),         // 任务 ID，如 'C001', 'M001'
  phone:    text('phone'),                   // 客户手机号
  task_type: text('task_type'),              // 'collection' | 'marketing'
  label_zh: text('label_zh'),               // 中文标签
  label_en: text('label_en'),               // 英文标签
  data:     text('data'),                   // JSON 字符串，含 zh/en 变体
});
```

**data 字段结构（催收）：**

```typescript
interface CollectionCase {
  customer_name: string;     // 客户姓名
  phone: string;             // 联系电话
  product_name: string;      // 产品名称
  overdue_amount: number;    // 逾期金额
  overdue_days: number;      // 逾期天数
}
```

**data 字段结构（营销）：**

```typescript
interface MarketingTask {
  customer_name: string;     // 客户姓名
  phone: string;             // 联系电话
  current_plan: string;      // 当前套餐
  target_plan: string;       // 推荐套餐
  target_fee: number;        // 推荐套餐月费
  campaign_name: string;     // 活动名称
}
```

---

## 16. 模拟用户对象（MockUser）

**来源：** `backend/src/db/schema.ts` — `mock_users` 表

```typescript
export const mockUsers = sqliteTable('mock_users', {
  id:        text('id').primaryKey(),
  phone:     text('phone').unique(),
  name:      text('name'),
  plan_zh:   text('plan_zh'),               // 中文套餐名
  plan_en:   text('plan_en'),               // 英文套餐名
  status:    text('status'),                // 'active' | 'suspended'
  tag_zh:    text('tag_zh'),                // 中文标签（如"正常用户"）
  tag_en:    text('tag_en'),                // 英文标签
  tag_color: text('tag_color'),             // 标签颜色（CSS 类名）
  type:      text('type'),                  // 'inbound' | 'outbound'
});
```

---

## 17. 变更审批对象（ChangeRequest）

**来源：** `backend/src/db/schema.ts` — `change_requests` 表

```typescript
export const changeRequests = sqliteTable('change_requests', {
  id:                 integer('id').primaryKey({ autoIncrement: true }),
  skill_path:         text('skill_path'),          // 文件相对路径
  old_content:        text('old_content'),          // 变更前内容
  new_content:        text('new_content'),          // 变更后内容
  description:        text('description'),          // 变更说明
  requester:          text('requester'),            // 请求人
  status:             text('status'),               // 'pending' | 'approved' | 'rejected'
  reviewer:           text('reviewer'),             // 审核人
  reviewed_at:        text('reviewed_at'),          // 审核时间
  risk_reason:        text('risk_reason'),          // 高风险原因
  created_at:         text('created_at'),           // 创建时间
});
```

---

## 18. 回归测试用例（TestCase）

**来源：** `backend/src/db/schema.ts` — `test_cases` 表

```typescript
export const testCases = sqliteTable('test_cases', {
  id:                integer('id').primaryKey({ autoIncrement: true }),
  skill_name:        text('skill_name'),            // 关联 Skill 名称
  input_message:     text('input_message'),          // 测试输入消息
  expected_keywords: text('expected_keywords'),      // JSON 数组，期望响应包含的关键词
  phone:             text('phone'),                  // 测试手机号，默认 '13800000001'
  created_at:        text('created_at'),             // 创建时间
});
```

---

## 19. 知识管理数据模型（KM，13 张表）

所有知识管理表使用 `km_` 前缀，完整的生命周期管理体系。

### 19.1 km_documents（源文档）

| 列名 | 类型 | 说明 |
|------|------|------|
| `id` | text PK | 文档 ID |
| `title` | text NOT NULL | 文档标题 |
| `source` | text | `'upload'` / `'connector'` |
| `classification` | text | `'public'` / `'internal'` / `'sensitive'` |
| `owner` | text | 文档负责人 |
| `status` | text | 文档状态 |
| `created_at` / `updated_at` | text | 时间戳 |

### 19.2 km_doc_versions（文档版本）

| 列名 | 类型 | 说明 |
|------|------|------|
| `id` | text PK | 版本 ID |
| `document_id` | text FK→km_documents | 所属文档 |
| `version_no` | integer | 版本序号 |
| `file_path` | text | 源文件路径 |
| `scope_json` | text | JSON: `{tenant, region, channel, segment}` |
| `effective_from` / `effective_to` | text | 生效/失效日期 |
| `diff_summary` | text | 变更摘要 |
| `status` | text | `'draft'` / `'parsing'` / `'parsed'` / `'failed'` |

### 19.3 km_pipeline_jobs（解析管线作业）

| 列名 | 类型 | 说明 |
|------|------|------|
| `id` | text PK | 作业 ID |
| `doc_version_id` | text FK→km_doc_versions | 关联文档版本 |
| `stage` | text | `'parse'` / `'chunk'` / `'generate'` / `'validate'` |
| `status` | text | `'pending'` / `'running'` / `'success'` / `'failed'` |
| `error_code` / `error_message` | text | 失败信息 |
| `candidate_count` | integer | 生成候选数 |
| `started_at` / `finished_at` | text | 执行时间 |

### 19.4 km_candidates（QA 候选）

| 列名 | 类型 | 说明 |
|------|------|------|
| `id` | text PK | 候选 ID |
| `source_type` | text | `'parsing'` / `'feedback'` / `'manual'` |
| `source_ref_id` | text | 来源引用 ID |
| `normalized_q` | text NOT NULL | 标准化问题 |
| `draft_answer` | text | 草稿答案 |
| `variants_json` | text | JSON 答案变体 |
| `category` | text | 知识分类 |
| `risk_level` | text | `'high'` / `'medium'` / `'low'` |
| `gate_evidence` | text | 证据门状态 |
| `gate_conflict` | text | 冲突门状态 |
| `gate_ownership` | text | 归属门状态 |
| `target_asset_id` | text | 目标资产（更新已有） |
| `merge_target_id` | text | 合并目标 |
| `status` | text | `'draft'` / `'gate_pass'` / `'in_review'` / `'published'` / `'rejected'` |
| `review_pkg_id` | text | 所属审核包 |

### 19.5 km_evidence_refs（证据引用）

| 列名 | 类型 | 说明 |
|------|------|------|
| `id` | text PK | 证据 ID |
| `candidate_id` / `asset_id` | text | 关联候选/资产 |
| `doc_version_id` | text | 证据来源文档版本 |
| `locator` | text | 页码/条款/文本片段 |
| `status` | text | `'pending'` / `'pass'` / `'fail'` |
| `fail_reason` | text | 失败原因 |
| `reviewed_by` / `reviewed_at` | text | 审核人/时间 |

### 19.6 km_conflict_records（冲突记录）

| 列名 | 类型 | 说明 |
|------|------|------|
| `id` | text PK | 冲突 ID |
| `conflict_type` | text | `'wording'` / `'scope'` / `'version'` / `'replacement'` |
| `item_a_id` / `item_b_id` | text | 冲突双方 |
| `overlap_scope` | text | 重叠范围 JSON |
| `blocking_policy` | text | `'block_submit'` / `'block_publish'` / `'warn'` |
| `resolution` | text | `'keep_a'` / `'keep_b'` / `'coexist'` / `'split'` |
| `arbiter` | text | 仲裁人 |
| `status` | text | `'pending'` / `'resolved'` / `'closed'` |

### 19.7 km_review_packages（审核包）

| 列名 | 类型 | 说明 |
|------|------|------|
| `id` | text PK | 审核包 ID |
| `title` | text NOT NULL | 标题 |
| `status` | text | `'draft'` / `'submitted'` / `'reviewing'` / `'approved'` / `'rejected'` / `'published'` |
| `risk_level` | text | 风险等级 |
| `impact_summary` | text | 业务影响说明 |
| `candidate_ids_json` | text | JSON 候选 ID 数组 |
| `submitted_by` / `submitted_at` | text | 提交人/时间 |
| `approved_by` / `approved_at` | text | 审批人/时间 |

### 19.8 km_action_drafts（动作草案）

| 列名 | 类型 | 说明 |
|------|------|------|
| `id` | text PK | 动作 ID |
| `action_type` | text | `'publish'` / `'rollback'` / `'rescope'` / `'unpublish'` / `'downgrade'` / `'renew'` |
| `target_asset_id` | text | 目标资产 |
| `review_pkg_id` | text | 关联审核包 |
| `status` | text | `'draft'` / `'executing'` / `'done'` / `'failed'` |
| `change_summary` | text | 变更摘要 |
| `rollback_point_id` | text | 回滚点版本 |
| `regression_window_id` | text | 回归观察窗口 |

### 19.9 km_assets（已发布资产）

| 列名 | 类型 | 说明 |
|------|------|------|
| `id` | text PK | 资产 ID |
| `title` | text NOT NULL | 标题/问题 |
| `asset_type` | text | `'qa'` / `'card'` / `'skill'` |
| `status` | text | `'online'` / `'canary'` / `'downgraded'` / `'unpublished'` |
| `current_version` | integer | 当前版本号 |
| `scope_json` | text | 适用范围 |
| `owner` | text | 负责人 |
| `next_review_date` | text | 下次审查日期 |

### 19.10 km_asset_versions（资产版本）

| 列名 | 类型 | 说明 |
|------|------|------|
| `id` | text PK | 版本 ID |
| `asset_id` | text FK→km_assets | 所属资产 |
| `version_no` | integer | 版本序号 |
| `content_snapshot` | text | 内容快照 JSON |
| `scope_snapshot` | text | 范围快照 |
| `evidence_summary` | text | 证据摘要 |
| `rollback_point_id` | text | 回滚点 |
| `action_draft_id` | text | 创建此版本的动作 |

### 19.11 km_governance_tasks（治理任务）

| 列名 | 类型 | 说明 |
|------|------|------|
| `id` | text PK | 任务 ID |
| `task_type` | text | `'review_expiry'` / `'content_gap'` / `'conflict_arb'` / `'failure_fix'` / `'regression_fail'` / `'evidence_gap'` |
| `source_type` / `source_ref_id` | text | 关联对象类型/ID |
| `priority` | text | `'urgent'` / `'high'` / `'medium'` / `'low'` |
| `assignee` | text | 指派人 |
| `status` | text | `'open'` / `'in_progress'` / `'done'` / `'closed'` |
| `due_date` | text | 截止日期 |
| `conclusion` | text | 结论 |

### 19.12 km_regression_windows（回归观察窗口）

| 列名 | 类型 | 说明 |
|------|------|------|
| `id` | text PK | 窗口 ID |
| `linked_type` / `linked_id` | text | 关联动作类型/ID |
| `metrics_json` | text | 监控指标 JSON |
| `threshold_json` | text | 通过/失败阈值 |
| `verdict` | text | `'observing'` / `'pass'` / `'fail'` |
| `observe_from` / `observe_until` | text | 观察起止时间（通常 7 天） |

### 19.13 km_audit_logs（审计日志）

| 列名 | 类型 | 说明 |
|------|------|------|
| `id` | integer PK | 自增 ID |
| `action` | text NOT NULL | 操作类型 |
| `object_type` | text NOT NULL | 对象类型 |
| `object_id` | text NOT NULL | 对象 ID |
| `operator` | text | 操作人 |
| `risk_level` | text | 风险等级 |
| `detail_json` | text | 操作详情 JSON |

### 19.14 实体关系

```
km_documents (1) ──→ (N) km_doc_versions ──→ (N) km_pipeline_jobs
km_candidates (1) ──→ (N) km_evidence_refs
             ──→ (N) km_conflict_records (via item_a_id/item_b_id)
             ──→ (1) km_review_packages (via review_pkg_id)
             ──→ (1) km_assets (via target_asset_id)
km_assets (1) ──→ (N) km_asset_versions
km_review_packages (1) ──→ (N) km_action_drafts
km_action_drafts (1) ──→ (1) km_regression_windows
```
