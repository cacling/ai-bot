# CDP 现有代码深度摸底与改造方案

**目的**: 分析现有代码中客户数据的散布现状，给出 CDP 落地的代码级改造方案  
**日期**: 2026-03-31  
**关联**: [spec.md](spec.md) | [plan.md](plan.md) | [data-model.md](data-model.md)

---

## 目录

- [1. 现有客户数据散布全景](#1-现有客户数据散布全景)
- [2. business.db 完整 Schema 与 CDP 映射](#2-businessdb-完整-schema-与-cdp-映射)
- [3. 客户数据消费点全清单](#3-客户数据消费点全清单)
- [4. work_order_service 客户数据分析](#4-work_order_service-客户数据分析)
- [5. MCP Tools 客户数据依赖分析](#5-mcp-tools-客户数据依赖分析)
- [6. mock_apis 层分析](#6-mock_apis-层分析)
- [7. 改造方案总纲](#7-改造方案总纲)
- [8. cdp_service 物理设计](#8-cdp_service-物理设计)
- [9. 种子数据迁移方案](#9-种子数据迁移方案)
- [10. 消费方迁移方案](#10-消费方迁移方案)
- [11. 分阶段实施建议](#11-分阶段实施建议)
- [12. 风险与开放问题](#12-风险与开放问题)

---

## 1. 现有客户数据散布全景

当前系统中客户数据散布在 **4 个物理边界**、**21 张业务表**、**13 条 API 路由**、**16 个 MCP 工具**中：

```
┌─────────────────────────────────────────────────────────┐
│                  business.db (21 张表)                   │
│  subscribers(PK=phone), plans, customerHouseholds,      │
│  customerPreferences, contracts, deviceContexts,        │
│  identityOtpRequests, identityLoginEvents,              │
│  subscriberSubscriptions, valueAddedServices,           │
│  bills, billingBillItems, billingDisputeCases,           │
│  paymentsTransactions, invoiceRecords,                  │
│  ordersServiceOrders, ordersRefundRequests,              │
│  callbackTasks, networkIncidents,                       │
│  offersCampaigns, outreachCallResults,                  │
│  outreachSmsEvents, outreachHandoffCases,               │
│  outreachMarketingResults                               │
└───────────────┬───────────────────────────────────┬─────┘
                │                                   │
    ┌───────────▼───────────┐          ┌────────────▼──────────┐
    │ mock_apis (13 路由)    │          │ MCP Servers (16 工具)  │
    │ /api/customer/*       │          │ query_subscriber       │
    │ /api/billing/*        │          │ check_contracts        │
    │ /api/identity/*       │          │ verify_identity        │
    │ /api/diagnosis/*      │          │ check_account_balance  │
    └───────────┬───────────┘          │ diagnose_network ...   │
                │                      └────────────┬──────────┘
    ┌───────────▼───────────┐                       │
    │ backend 直接读取       │                       │
    │ chat-ws.ts (问候语)    │◄──────────────────────┘
    │ voice.ts   (系统提示)  │
    └───────────────────────┘

    ┌────────────────────────────────────────────────┐
    │ work_order_service (workorder.db)               │
    │ workItems.customer_phone/customer_name          │
    │ workItemIntakes.customer_phone/id/name          │
    │ issueThreads.customer_id/customer_phone         │
    └────────────────────────────────────────────────┘
```

**核心问题**: `subscribers.phone` 是事实上的全局客户主键，所有消费方都直接或间接以 phone 为入口查询客户信息。

---

## 2. business.db 完整 Schema 与 CDP 映射

### 2.1 与 CDP 实体的映射关系

| 现有表 | CDP 实体 | 映射类型 | 说明 |
|--------|---------|---------|------|
| `subscribers` | `party` + `party_identity` + `service_subscription` | 拆分 | phone→identity, 客户主体→party, 订阅信息→subscription |
| `customerHouseholds` | `household` | 直接映射 | household_type, primary_phone 等字段可直接迁移 |
| `customerPreferences` | `communication_preference` + `consent_record` | 拆分 | marketing_opt_in/sms_opt_in→consent, preferred_channel/dnd/contact_window→preference |
| `contracts` | `service_summary.contract_summary_json` | 摘要 | 合约真值留源表，CDP 只存摘要 |
| `deviceContexts` | `customer_event` (identity category) | 事件化 | 设备安全状态→事实事件 |
| `identityOtpRequests` | `customer_event` (identity category) | 事件化 | OTP 记录→事实事件 |
| `identityLoginEvents` | `customer_event` (identity category) | 事件化 | 登录事件→事实事件 |
| `plans` | 不纳入 CDP | — | 产品目录，不是客户数据 |
| `valueAddedServices` | 不纳入 CDP | — | 产品目录 |
| `subscriberSubscriptions` | `party_subscription_relation` 上游来源 | 映射 | 客户×增值服务关系 |
| `bills` / `billingBillItems` | `service_summary.balance_summary_json` | 摘要 | 账单真值留源表 |
| `paymentsTransactions` | `customer_event` (billing category) | 事件化 | 支付事件→事实事件 |
| `callbackTasks` | 不纳入 CDP | — | 外呼运行态 |
| `networkIncidents` | 不纳入 CDP | — | 基础设施，不是客户数据 |
| `offersCampaigns` | 不纳入 CDP | — | 营销活动定义 |
| `outreach*` (4 张) | `customer_event` (interaction category) | 事件化 | 外呼结果→事实事件 |

### 2.2 subscribers 表字段拆分方案

`subscribers` 是当前最核心的表，以 `phone` 为 PK，承载了过多语义。需拆分到 CDP 多个实体：

| subscribers 字段 | CDP 目标实体 | CDP 字段 | 说明 |
|-----------------|-------------|---------|------|
| `phone` (PK) | `party_identity` | identity_type='phone', identity_value=phone | 从主键退化为 identity |
| `name` | `party` | display_name | 客户显示名 |
| `gender` | `party` 或 `customer_profile.basic_profile_json` | — | 基础信息 |
| `customer_tier` | `customer_profile.value_profile_json` | — | 客户等级 |
| `preferred_language` | `communication_preference` | preference_type='language' | 语言偏好 |
| `id_type` / `id_last4` | `party_identity` | identity_type='national_id', identity_value_norm=masked | 证件身份 |
| `plan_id` | `service_subscription.plan_code` | — | 套餐编码 |
| `household_id` | `party.primary_household_id` | — | 家庭归属 |
| `status` | `service_subscription.service_status` | — | 订阅状态 |
| `balance` | `customer_account.snapshot_json` / `service_summary.balance_summary_json` | — | 余额摘要 |
| `data_used_gb` / `voice_used_min` / `sms_used` | `service_summary.snapshot_json` | — | 用量摘要 |
| `activated_at` | `service_subscription.start_at` | — | 激活时间 |
| `contract_end_date` | `service_summary.contract_summary_json` | — | 合约到期 |
| `overdue_days` | `customer_account.billing_status` + `service_summary` | — | 欠费状态 |
| `email` | `party_identity` + `contact_point` | identity_type='email' / contact_type='email' | 邮箱 |
| `region` | `customer_profile.basic_profile_json` | — | 区域 |

---

## 3. 客户数据消费点全清单

### 3.1 backend 直接读取 businessDb

| 文件 | 行为 | 读取字段 | 用途 | 优先级 |
|------|------|---------|------|--------|
| `chat-ws.ts:111-122` | `businessDb.select().from(subscribers).where(eq(phone))` | name, gender, plan_id (join plans) | 文字聊天问候语个性化 | P1 |
| `voice.ts:41-56` | `businessDb.select().from(subscribers).where(eq(phone))` | name, gender, plan_id (join plans) | 语音系统提示词客户信息注入 | P1 |

这两处是 backend 唯一直接读取 businessDb 的地方。改造后应改为调用 CDP `GetCustomerContext` API。

### 3.2 mock_apis 层 (13 条路由)

| 路由 | 读取表 | 返回数据 | CDP 等价 API |
|------|--------|---------|-------------|
| `GET /api/customer/subscribers/{phone}` | subscribers + plans + households + preferences | 完整客户 360 视图 | `GetCustomerContext` |
| `GET /api/customer/subscribers/{phone}/account-summary` | subscribers + plans | 余额、用量、欠费 | `GetServiceSummary` |
| `GET /api/customer/subscribers/{phone}/preferences` | customerPreferences | DND, 营销许可, 联系窗口 | `GetPreferences` + `GetConsents` |
| `GET /api/customer/subscribers/{phone}/contracts` | contracts | 活跃合约, 违约金, 风险等级 | `GetServiceSummary` (contract_summary_json) |
| `GET /api/customer/subscribers/{phone}/services` | subscriberSubscriptions + valueAddedServices | 增值服务列表 | `GetServiceSummary` (subscriptions) |
| `POST /api/identity/otp/send` | subscribers + identityOtpRequests | OTP 发送 | 保留在源系统，CDP 接收事件回流 |
| `POST /api/identity/verify` | subscribers + identityOtpRequests | 身份验证结果 | 保留在源系统，CDP 接收事件回流 |
| `GET /api/accounts/{phone}/login-events` | identityLoginEvents | 登录审计 | CDP `customer_event` timeline |
| `POST /api/diagnosis/network/analyze` | subscribers + plans + devices + subscriptions + incidents | 网络诊断 | 部分来自 CDP context，部分保留源 |
| `POST /api/diagnosis/app/analyze` | subscribers + deviceContexts + loginEvents | APP 安全诊断 | 同上 |
| billing 相关路由 (3 条) | bills + billingBillItems + paymentsTransactions | 账单明细 | 真值留源，CDP 提供 service_summary |

### 3.3 消费方影响矩阵

| 消费方 | 当前数据来源 | 改造后数据来源 | 改造影响 |
|--------|-------------|--------------|---------|
| **backend chat-ws.ts** | businessDb 直读 | CDP GetCustomerContext API | 改 2 处查询调用 |
| **backend voice.ts** | businessDb 直读 | CDP GetCustomerContext API | 改 1 处查询调用 |
| **MCP user_info_service** | mock_apis /api/customer/* | CDP GetCustomerContext 或保留 mock_apis 读 CDP | 改 API 调用目标 |
| **MCP account_service** | mock_apis /api/customer/* | 同上 | 同上 |
| **MCP diagnosis_service** | mock_apis /api/diagnosis/* | 部分走 CDP，部分保留 | 中等改造 |
| **work_order_service** | 接收 payload，不直接查 businessDb | 新增 CDP resolve 调用 | 新增集成 |
| **前端** | 不直接查询，通过 WS 接收 | 无直接改动 | 无 |

---

## 4. work_order_service 客户数据分析

### 4.1 当前客户字段

| 表 | 字段 | 用途 |
|----|------|------|
| `workItems` | customer_phone, customer_name | 核心工作项的客户标识 |
| `workItemIntakes` | customer_phone, customer_id, customer_name | 进件层客户信息 |
| `workItemDrafts` | customer_phone, customer_name | 草稿层 |
| `issueThreads` | customer_id, customer_phone | 问题聚合与去重 |

### 4.2 Issue Matching 评分模型

`issue-matching-service.ts` 使用 6 维评分模型，其中 Identity 维度:

```
customer_id 精确匹配: 30 分
customer_phone 精确匹配: 20 分
其他维度: business_object(25), category(15), semantic(15), recency(10), risk(5)
```

### 4.3 关键缺陷

1. **customer_id 在 intake 后丢失**: 进件时有 customer_id，但 materializer 不把它传递到 workItems
2. **无 party_id**: 所有关联依赖 phone，无法支持多号码/多渠道/多账户场景
3. **无服务上下文**: 工单中不携带套餐、欠费、等级等信息
4. **无联系偏好**: 无法在工单侧判断 DND、联系窗口

### 4.4 work_order_service 改造要点

| 改造项 | 说明 |
|--------|------|
| workItems 表新增 `party_id` 列 | 主关联键，逐步替代 customer_phone |
| workItemIntakes 表新增 `party_id` 列 | CDP resolve 后填入 |
| issueThreads 表新增 `party_id` 列 | 去重主键升级 |
| intake-service.ts | 新增 CDP `ResolveIdentity` 调用 |
| issue-matching-service.ts | Identity 维度增加 party_id 匹配 (最高分) |
| materializer-service.ts | 传递 party_id 到最终 workItem |
| item-service.ts 列表查询 | 新增 party_id 过滤条件 |
| customer_phone/customer_name | 保留为冗余显示字段，不再作为主关联 |

---

## 5. MCP Tools 客户数据依赖分析

### 5.1 16 个 MCP 工具与客户数据关系

| 工具 | 服务 | 输入 | 读取数据 | CDP 改造影响 |
|------|------|------|---------|-------------|
| `query_subscriber` | user_info (18003) | phone | 完整客户信息 | **高**: 核心查询，应改为读 CDP |
| `query_bill` | user_info | phone + month | 账单明细 | **低**: 账单真值留源 |
| `query_plans` | user_info | plan_id? | 套餐目录 | **无**: 产品数据不在 CDP |
| `analyze_bill_anomaly` | user_info | phone + month | 账单对比 | **低**: 分析逻辑留源 |
| `cancel_service` | business (18004) | phone + service_id | 订阅状态 | **中**: 写操作留源，但需通知 CDP |
| `issue_invoice` | business | phone + month + email | 发票 | **低**: 操作留源 |
| `diagnose_network` | diagnosis (18005) | phone + issue_type | 订阅+设备+网络 | **中**: 客户上下文可从 CDP 获取 |
| `diagnose_app` | diagnosis | phone + issue_type | 设备+登录事件 | **中**: 同上 |
| `verify_identity` | account (18007) | phone + OTP | 客户名 | **中**: 验证留源，结果回流 CDP |
| `check_account_balance` | account | phone | 余额/欠费 | **高**: 应改为读 CDP service_summary |
| `check_contracts` | account | phone | 合约风险 | **高**: 应改为读 CDP service_summary |
| `apply_service_suspension` | account | phone | 订户状态 | **中**: 写操作留源 |
| `record_call_result` | outbound (18006) | phone + result | 外呼结果 | **低**: 写操作，可回流 CDP 事件 |
| `send_followup_sms` | outbound | phone + type | 短信发送 | **低**: 操作留源 |
| `create_callback_task` | outbound | phone + time | 回拨任务 | **低**: 操作留源 |
| `record_marketing_result` | outbound | campaign + phone | 营销结果 | **低**: 写操作，可回流 CDP 事件 |

### 5.2 MCP 工具改造分级

- **Phase 1 改造** (高影响): query_subscriber, check_account_balance, check_contracts → 改为从 CDP 获取
- **Phase 2 改造** (中影响): verify_identity, diagnose_*, cancel_service → 操作留源，结果/事件回流 CDP
- **暂不改造** (低影响): query_bill, issue_invoice, outbound 类工具 → 保留直接走 mock_apis

---

## 6. mock_apis 层分析

### 6.1 mock_apis 的定位

`mock_apis/` 是 MCP Servers 的后端，模拟真实业务系统 (CRM/Billing/Identity)。当前直接读写 `business.db`。

### 6.2 CDP 落地后 mock_apis 的变化

**短期策略 (Phase 1)**: mock_apis 保留，但其"客户查询"类路由内部改为从 CDP 读取：

```
MCP Tool → mock_apis → CDP (客户上下文)
                     → business.db (交易明细，如账单行项)
```

**中期策略 (Phase 2-3)**: 高频客户查询路由直接由 CDP Serving API 承接，mock_apis 只保留交易操作类路由：

```
MCP Tool → CDP Serving API (客户上下文、服务摘要)
         → mock_apis (账单明细、OTP、订单操作)
```

### 6.3 需要调整的 mock_apis 路由

| 路由 | 调整方式 |
|------|---------|
| `GET /api/customer/subscribers/{phone}` | 内部改为查 CDP，或废弃由 CDP API 替代 |
| `GET /api/customer/subscribers/{phone}/account-summary` | 改为 CDP `GetServiceSummary` |
| `GET /api/customer/subscribers/{phone}/preferences` | 改为 CDP `GetPreferences` |
| `GET /api/customer/subscribers/{phone}/contracts` | 摘要从 CDP，明细留源 |
| `GET /api/customer/subscribers/{phone}/services` | 摘要从 CDP |
| `POST /api/identity/otp/send` | 保留，但 OTP 事件回流 CDP |
| `POST /api/identity/verify` | 保留，验证成功事件回流 CDP |
| billing / orders / outreach 路由 | 保留不变 |

---

## 7. 改造方案总纲

### 7.1 核心决策

| 决策 | 内容 |
|------|------|
| **cdp_service 物理形态** | 独立 Hono + Bun 服务，端口 18011，与 backend/km_service/work_order_service 同级 |
| **数据库** | 独立 `cdp.db` (SQLite，与项目现有习惯一致)，后续可迁 PostgreSQL |
| **ORM** | Drizzle ORM (与项目现有一致) |
| **Schema 位置** | `packages/shared-db/src/schema/cdp.ts` (统一 schema 管理) |
| **API 风格** | RESTful JSON，与现有 mock_apis 风格一致 |
| **启动集成** | 加入 `start.sh` 启动链 |
| **种子数据** | 从 business.db 现有 subscribers 数据自动映射生成 |

### 7.2 不做什么

1. **不改 business.db Schema**: 业务表保持原样，CDP 从其数据生成自己的实体
2. **不改 MCP Server 接口契约**: MCP 工具的输入输出格式保持不变
3. **不强制所有消费方一次切换**: 允许 Phase 1 期间 mock_apis 和 CDP 并存
4. **不引入消息队列**: 事件回流先用 HTTP 回调，后续再考虑 event bus
5. **不在 V1 做全自动 identity resolution**: 先支持规则匹配 + 人工审核

### 7.3 架构总图

```
┌────────────────────────────────────────────────────────┐
│                   cdp_service (port 18011)             │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Layer 1: Source Integration                      │  │
│  │  - Seed import from business.db                  │  │
│  │  - Event ingestion endpoint (HTTP POST)          │  │
│  └──────────────────────────┬───────────────────────┘  │
│                             │                          │
│  ┌──────────────────────────▼───────────────────────┐  │
│  │ Layer 2: Identity & Party Hub                    │  │
│  │  - party, party_identity, contact_point          │  │
│  │  - identity_link, source_record_link             │  │
│  │  - identity_resolution_case                      │  │
│  └──────────────────────────┬───────────────────────┘  │
│                             │                          │
│  ┌──────────────────────────▼───────────────────────┐  │
│  │ Layer 3: Relationship & Ownership                │  │
│  │  - household, customer_account                   │  │
│  │  - service_subscription                          │  │
│  │  - party_subscription_relation                   │  │
│  └──────────────────────────┬───────────────────────┘  │
│                             │                          │
│  ┌──────────────────────────▼───────────────────────┐  │
│  │ Layer 4: Customer Facts Hub                      │  │
│  │  - customer_event (append-only)                  │  │
│  │  - communication_preference, consent_record      │  │
│  └──────────────────────────┬───────────────────────┘  │
│                             │                          │
│  ┌──────────────────────────▼───────────────────────┐  │
│  │ Layer 5: Profile & Summary Compute               │  │
│  │  - customer_profile, service_summary             │  │
│  │  - interaction_summary                           │  │
│  └──────────────────────────┬───────────────────────┘  │
│                             │                          │
│  ┌──────────────────────────▼───────────────────────┐  │
│  │ Layer 6: Serving API                             │  │
│  │  - ResolveIdentity                               │  │
│  │  - GetCustomerContext                            │  │
│  │  - GetServiceSummary                             │  │
│  │  - GetPreferences / GetConsents                  │  │
│  │  - CheckConsentAndContactability                 │  │
│  │  - IngestEvent                                   │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
         ▲              ▲              ▲
         │              │              │
    ┌────┴────┐   ┌─────┴─────┐  ┌────┴──────────┐
    │ backend │   │ mock_apis │  │ work_order_svc │
    │ (问候语) │   │ (MCP后端) │  │ (party_id)     │
    └─────────┘   └───────────┘  └────────────────┘
```

---

## 8. cdp_service 物理设计

### 8.1 目录结构

```
cdp_service/
├── package.json
├── tsconfig.json
├── src/
│   ├── server.ts              # Hono app 入口, 端口 18011
│   ├── db/
│   │   ├── index.ts           # Drizzle 初始化, cdp.db
│   │   └── seed.ts            # 从 business.db 导入种子数据
│   ├── routes/
│   │   ├── index.ts           # 路由注册
│   │   ├── identity.ts        # ResolveIdentity, SearchParty
│   │   ├── context.ts         # GetCustomerContext, GetServiceSummary
│   │   ├── preference.ts      # GetPreferences, GetConsents, CheckContactability
│   │   ├── party.ts           # Party CRUD
│   │   └── event.ts           # IngestEvent, GetTimeline
│   ├── services/
│   │   ├── identity-resolver.ts   # 身份解析逻辑 (规则匹配)
│   │   ├── profile-computer.ts    # Profile/Summary 计算
│   │   └── event-processor.ts     # 事件处理 + 摘要更新
│   └── middleware/
│       └── auth.ts            # 服务间认证 (Bearer token / X-Service-Id)
├── tests/
│   ├── unittest/
│   └── apitest/
└── data/                      # cdp.db 存放位置
```

### 8.2 数据库初始化

```typescript
// cdp_service/src/db/index.ts
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import * as schema from '@ai-bot/shared-db/schema/cdp';

const sqlite = new Database('data/cdp.db', { create: true });
sqlite.exec('PRAGMA journal_mode = WAL');
sqlite.exec('PRAGMA foreign_keys = ON');
export const db = drizzle(sqlite, { schema });
```

### 8.3 Serving API 设计

| 端点 | 方法 | 输入 | 输出 | 说明 |
|------|------|------|------|------|
| `/api/cdp/resolve-identity` | POST | `{ phone?, email?, external_id?, identity_type? }` | `{ party_id, party_type, confidence, identities[] }` | 身份解析 |
| `/api/cdp/parties/:partyId/context` | GET | party_id (路径参数) | `{ party, profile, service_summary, interaction_summary, preferences }` | 完整客户上下文 |
| `/api/cdp/parties/:partyId/service-summary` | GET | party_id | `{ service_summary }` | 服务摘要 |
| `/api/cdp/parties/:partyId/preferences` | GET | party_id | `{ preferences[], consents[] }` | 偏好与同意 |
| `/api/cdp/parties/:partyId/contactability` | POST | `{ party_id, channel_type, purpose_type }` | `{ allowed, reason, consent_status }` | 联系可达性判断 |
| `/api/cdp/parties/:partyId/timeline` | GET | party_id + ?limit + ?event_type | `{ events[] }` | 事件时间线 |
| `/api/cdp/events` | POST | `{ party_id?, event_type, source_system, payload }` | `{ event_id }` | 事件回流 |
| `/api/cdp/parties` | GET | ?phone, ?email, ?name, ?party_type | `{ parties[] }` | 搜索客户 |
| `/api/cdp/parties/:partyId` | GET | party_id | `{ party, identities[], contact_points[] }` | 客户详情 |

**便捷端点 (向后兼容过渡期)**:

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/cdp/resolve-by-phone/:phone` | GET | 快捷 phone → party + context |
| `/api/cdp/resolve-by-phone/:phone/context` | GET | 等价于 resolve + GetCustomerContext 合并 |

这两个端点让现有以 phone 为入口的消费方可以一步获取 CDP 上下文，无需先 resolve 再查询。

---

## 9. 种子数据迁移方案

### 9.1 迁移脚本逻辑

`cdp_service/src/db/seed.ts` 应实现以下映射:

```
对每个 subscriber in business.db:
  1. 创建 party (party_type='customer', display_name=subscriber.name)
  2. 创建 party_identity (identity_type='phone', identity_value=subscriber.phone, primary=true)
  3. 如果有 email → 创建 party_identity (identity_type='email') + contact_point (contact_type='email')
  4. 创建 contact_point (contact_type='phone', contact_value=subscriber.phone, preferred=true)
  5. 如果有 id_type/id_last4 → 创建 party_identity (identity_type='national_id', identity_value_norm=masked)
  6. 创建 source_record_link (source_system='business_db', source_entity_type='subscriber', source_entity_id=phone)
  7. 创建 customer_account (account_no=phone, account_status 映射 subscriber.status)
  8. 创建 service_subscription (subscription_no=phone, plan_code=plan_id, service_identifier=phone)
  9. 创建 party_subscription_relation (relation_type='owner', primary=true)

对每个 household in business.db:
  10. 创建 household (household_name, household_type 映射)
  11. 设置对应 party.primary_household_id

对每个 customerPreference in business.db:
  12. 创建 communication_preference 多条 (channel_preference, language, contact_time)
  13. 创建 consent_record 多条 (marketing/sms → granted/revoked)

计算消费视图:
  14. 创建 customer_profile (basic_profile_json 含 gender/tier/region)
  15. 创建 service_summary (从 subscriber + plans + contracts + bills 聚合)
  16. 创建 interaction_summary (初始值为空/零)
```

### 9.2 种子数据规模

当前有 **8 个 subscriber** (13800000001-3, 13900000001-5)，映射后预计:
- 8 个 party
- ~16-24 个 party_identity (phone + email + 可能的 id)
- ~8-16 个 contact_point
- 3 个 household
- 8 个 customer_account
- 8 个 service_subscription
- 8 个 party_subscription_relation
- ~24 个 communication_preference
- ~16 个 consent_record
- 8 个 customer_profile
- 8 个 service_summary
- 8 个 interaction_summary
- 8+ 个 source_record_link

---

## 10. 消费方迁移方案

### 10.1 backend 改造 (P1, 改动最小)

**chat-ws.ts** (文字聊天问候语):

```typescript
// 现在: 直接读 businessDb
const [sub] = await businessDb.select().from(subscribers)
  .innerJoin(plans, eq(subscribers.plan_id, plans.plan_id))
  .where(eq(subscribers.phone, phone)).limit(1);

// 改为: 调 CDP API
const cdpRes = await fetch(`http://127.0.0.1:18011/api/cdp/resolve-by-phone/${phone}/context`);
const ctx = await cdpRes.json();
const cachedSubscriberName = ctx.party?.display_name;
const cachedGender = ctx.profile?.basic_profile_json?.gender;
const cachedPlanName = ctx.service_summary?.snapshot_json?.plan_name;
```

**voice.ts** (语音系统提示): 同上模式。

改动范围: 2 个文件，各改 ~10 行。

### 10.2 backend 新增 CDP 代理路由

在 `backend/src/index.ts` 新增代理:

```typescript
import { createCdpProxy } from './services/cdp-proxy';
const cdpProxy = createCdpProxy('http://127.0.0.1:18011');
app.route('/api/cdp', cdpProxy);
```

这样前端和 MCP 工具可以通过 backend 统一入口访问 CDP。

### 10.3 mock_apis 改造 (P2, 渐进式)

Phase 1 暂不改 mock_apis。Phase 2 时将客户查询类路由内部改为从 CDP 获取:

```typescript
// mock_apis/src/routes/customer.ts
// 现在: 直接查 businessDb
router.get('/subscribers/:msisdn', async (c) => {
  const sub = await db.select().from(subscribers).where(eq(phone, msisdn));
  ...
});

// Phase 2 改为: 先查 CDP，补充明细从 businessDb
router.get('/subscribers/:msisdn', async (c) => {
  const ctx = await fetch(`http://127.0.0.1:18011/api/cdp/resolve-by-phone/${msisdn}/context`);
  // 合并 CDP 上下文 + 业务明细
});
```

### 10.4 work_order_service 改造 (P2)

1. **Schema 变更**: `packages/shared-db/src/schema/workorder.ts` 中 workItems / intakes / issueThreads 新增 `party_id` 列
2. **intake-service.ts**: 接收 intake 时调用 CDP `ResolveIdentity` 获取 party_id
3. **issue-matching-service.ts**: Identity 维度增加 party_id 匹配 (最高 35 分)
4. **materializer-service.ts**: 传递 party_id 到最终 workItem

### 10.5 MCP 工具改造 (P2-P3)

Phase 1 不改。Phase 2 时:
- `query_subscriber`: 改为调 CDP `/api/cdp/resolve-by-phone/{phone}/context`
- `check_account_balance`: 改为调 CDP GetServiceSummary
- `check_contracts`: 改为调 CDP GetServiceSummary

其他工具的写操作保留直接走 mock_apis，但新增事件回流:
- `cancel_service` 完成后 → POST CDP `/api/cdp/events` (service_cancelled)
- `verify_identity` 完成后 → POST CDP `/api/cdp/events` (identity_verified)

---

## 11. 分阶段实施建议

### Phase 1: CDP 服务骨架 + 核心实体 + 种子数据 + backend 切换

**目标**: cdp_service 可运行，backend 问候语从 CDP 获取，证明端到端链路通畅

**工作项**:

| # | 任务 | 文件 | 估计改动 |
|---|------|------|---------|
| 1.1 | 创建 cdp_service 项目骨架 | `cdp_service/` (新建) | 新建 ~15 个文件 |
| 1.2 | 定义 CDP Schema (16 张表) | `packages/shared-db/src/schema/cdp.ts` | 新建 1 个文件 |
| 1.3 | 实现 Drizzle 初始化 + push | `cdp_service/src/db/index.ts` | 新建 |
| 1.4 | 实现种子数据迁移脚本 | `cdp_service/src/db/seed.ts` | 新建 |
| 1.5 | 实现 ResolveIdentity API | `cdp_service/src/routes/identity.ts` | 新建 |
| 1.6 | 实现 GetCustomerContext API | `cdp_service/src/routes/context.ts` | 新建 |
| 1.7 | 实现 resolve-by-phone 便捷端点 | `cdp_service/src/routes/identity.ts` | 新建 |
| 1.8 | backend chat-ws.ts 改为调 CDP | `backend/src/chat/chat-ws.ts` | 改 ~10 行 |
| 1.9 | backend voice.ts 改为调 CDP | `backend/src/chat/voice.ts` | 改 ~10 行 |
| 1.10 | start.sh 加入 cdp_service 启动 | `start.sh`, `stop.sh` | 改 ~5 行 |
| 1.11 | 单元测试 | `cdp_service/tests/unittest/` | 新建 |
| 1.12 | API 测试 | `cdp_service/tests/apitest/` | 新建 |

**Phase 1 涉及的 CDP 实体**: party, party_identity, contact_point, customer_account, service_subscription, party_subscription_relation, source_record_link, customer_profile, service_summary, interaction_summary, household

**Phase 1 不涉及**: identity_link, identity_resolution_case, communication_preference, consent_record, customer_event (结构先建，但功能在后续 Phase 实现)

### Phase 2: 偏好/同意 + 事件回流 + work_order 集成

**目标**: 联系治理能力可用，work_order_service 使用 party_id

**工作项**:

| # | 任务 |
|---|------|
| 2.1 | 实现 GetPreferences / GetConsents API |
| 2.2 | 实现 CheckConsentAndContactability API |
| 2.3 | 实现 IngestEvent API |
| 2.4 | work_order_service schema 新增 party_id |
| 2.5 | intake-service 集成 CDP ResolveIdentity |
| 2.6 | issue-matching 增加 party_id 评分 |
| 2.7 | 事件回流: identity verify, service cancel → CDP events |

### Phase 3: Identity Graph 治理 + MCP 工具迁移

**目标**: identity merge/split 可审核，核心 MCP 工具从 CDP 读取

**工作项**:

| # | 任务 |
|---|------|
| 3.1 | 实现 identity_link 管理 API |
| 3.2 | 实现 identity_resolution_case 审核流 |
| 3.3 | MCP query_subscriber 切换到 CDP |
| 3.4 | MCP check_account_balance 切换到 CDP |
| 3.5 | MCP check_contracts 切换到 CDP |
| 3.6 | mock_apis 客户查询路由渐进退化 |

### Phase 4: Profile 计算增强 + Timeline

**目标**: interaction_summary 实时更新，客户时间线可查

**工作项**:

| # | 任务 |
|---|------|
| 4.1 | interaction_summary 增量计算逻辑 |
| 4.2 | service_summary 定时/触发刷新 |
| 4.3 | customer_event timeline 查询 API |
| 4.4 | 为 Interaction Platform 预留 context serving 接口 |

---

## 12. 风险与开放问题

### 12.1 风险

| 风险 | 影响 | 缓解 |
|------|------|------|
| CDP 查询延迟影响问候语速度 | 客户感知变慢 | Phase 1 先内网直连，预计 <5ms；可加进程内缓存 |
| 种子数据映射遗漏字段 | 上下文不一致 | 对照 subscribers 全字段逐一验证 |
| cdp.db 与 business.db 数据不一致 | 问候语/上下文与工具返回矛盾 | Phase 1 只有 CDP 消费方切换，mock_apis 暂保留直读 business.db |
| work_order_service party_id 迁移影响现有数据 | 已有工单缺 party_id | party_id 列 nullable，旧数据不影响 |

### 12.2 开放问题

| 问题 | 建议 |
|------|------|
| CDP 数据库是 SQLite 还是 PostgreSQL？ | Phase 1 用 SQLite (与项目习惯一致，零运维)；plan.md 建议目标是 PG，但可以 Phase 3+ 再迁 |
| CDP 种子数据是启动时自动导入还是手动运行？ | 建议类似 `--reset` 模式：`start.sh --reset` 时同时重建 cdp.db |
| phone → party_id 映射的置信度规则？ | V1 直接 exact match (phone unique constraint)，置信度=1.0；后续再加模糊匹配 |
| CDP 是否需要为 Interaction Platform 预留 conversation/interaction 相关字段？ | interaction_summary 已预留 open_interaction_count, last_contact_at 等；具体字段等 002 落地时再定 |
| backend 代理 CDP 路由还是 MCP 工具直接调 CDP？ | 建议 backend 统一代理 (`/api/cdp/*`)，保持现有"MCP → mock_apis"模式不变，mock_apis 内部切数据源 |
