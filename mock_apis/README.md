# mock_apis

`mock_apis` 是 demo 阶段的 **fake backend systems** 集合。

它不是 MCP 层，也不是 Skill 层；它扮演未来真实后端系统的替身，供
`/Users/chenjun/Documents/obsidian/workspace/ai-bot/mcp_servers`
里的各个 MCP Server 对接。

当前覆盖的第一批系统：

- `identity`：OTP 发送与身份校验
- `risk`：账户/设备风险查询
- `billing`：账单、账单明细、支付记录、账单异常分析
- `invoice`：电子发票申请
- `callback`：回拨任务创建
- `outreach`：外呼结果、短信发送、转人工、营销结果
- `network`：网络事件与用户网络诊断

当前补充的第二批系统：

- `customer`：用户档案、偏好、合约、已订业务
- `catalog`：套餐目录、增值业务目录
- `offers`：活动信息、可售推荐
- `orders`：业务办理单 / 退订单
- `payments`：支付交易与支付链接

## 当前二级实现路径

为了让 demo 阶段尽量贴近未来真实系统，当前所有 mock API 都已经改成：

- **统一走 business schema 的 SQLite 表**
- **系统自有状态表使用系统前缀命名**
- **少量规则逻辑只做聚合/判断，不再自己保存内存状态**

当前的表分两类：

- **共享主数据表**：`subscribers`、`plans`、`bills`、`contracts`、`device_contexts`、`subscriber_subscriptions`、`value_added_services`、`callback_tasks`、`customer_households`
- **系统自有表（前缀与 API path 对齐）**
  - `customer_preferences`
  - `billing_bill_items`
  - `billing_dispute_cases`
  - `identity_otp_requests`
  - `identity_login_events`
  - `payments_transactions`
  - `network_incidents`
  - `offers_campaigns`
  - `invoice_records`
  - `orders_service_orders`
  - `orders_refund_requests`
  - `outreach_call_results`
  - `outreach_sms_events`
  - `outreach_handoff_cases`
  - `outreach_marketing_results`

这意味着后续切换真实系统时，优先替换的是：

- 后端 URL
- 鉴权方式
- 请求/响应协议适配

而不是重写 Skill、MCP Tool contract，或者重做 demo 数据结构。

## 设计原则

- **稳定边界在 MCP Server**：Skill Runtime 只通过 MCP Client 调用 MCP Tool。
- **mock_apis 只是二级实现路径**：未来接真实系统时，优先替换 URL、鉴权与协议映射。
- **接口按未来系统分域**：避免把 demo API 设计成一次性脚本接口。

## 当前 API 清单

### identity / risk
- `POST /api/identity/otp/send`
- `POST /api/identity/verify`
- `GET /api/identity/accounts/:msisdn/login-events`
- `GET /api/risk/accounts/:msisdn`

### customer
- `GET /api/customer/subscribers/:msisdn`
- `GET /api/customer/subscribers/:msisdn/account-summary`
- `GET /api/customer/subscribers/:msisdn/preferences`
- `GET /api/customer/subscribers/:msisdn/contracts`
- `GET /api/customer/subscribers/:msisdn/services`
- `GET /api/customer/subscribers/:msisdn/household`
- `GET /api/customer/subscribers/:msisdn/subscription-history`

### catalog / offers
- `GET /api/catalog/plans`
- `GET /api/catalog/plans/:planId`
- `GET /api/catalog/value-added-services`
- `GET /api/offers/eligible?msisdn=...`
- `GET /api/offers/campaigns/:campaignId`

### orders / payments
- `POST /api/orders/service-cancel`
- `GET /api/orders/refund-requests?msisdn=...`
- `GET /api/orders/refund-requests/:refundId`
- `GET /api/orders/:orderId`
- `GET /api/payments/transactions?msisdn=...`
- `GET /api/payments/transactions/:paymentId`
- `POST /api/payments/payment-link`

### billing
- `GET /api/billing/accounts/:msisdn/bills`
- `GET /api/billing/accounts/:msisdn/bills/:month`
- `GET /api/billing/accounts/:msisdn/bills/:month/items`
- `GET /api/billing/accounts/:msisdn/disputes`
- `GET /api/billing/accounts/:msisdn/payments`
- `POST /api/billing/anomaly/analyze`

### invoice
- `POST /api/invoice/issue`

### callback / outreach
- `POST /api/callback/create`
- `POST /api/outreach/calls/result`
- `POST /api/outreach/sms/send`
- `POST /api/outreach/handoff/create`
- `POST /api/outreach/marketing/result`

### network
- `GET /api/network/incidents`
- `GET /api/network/subscribers/:msisdn/diagnostics`

## 重要 Demo 约定

为了让 MCP Server 和 Skill 测试有稳定样例，当前保留了几条显式的 demo 规则：

- `13800000003`：风险账户，`GET /api/risk/accounts/:msisdn` 会返回高风险
- `13800000003`：`GET /api/identity/accounts/:msisdn/login-events` 会返回失败、OTP 挑战和锁定链路
- 最近一次 `POST /api/identity/otp/send` 返回的 `mock_otp` 可直接用于 `POST /api/identity/verify`
- `13800000002`：营销短信受 DND 规则限制
- 夜间发送营销短信会被 `POST /api/outreach/sms/send` 拦截
- `13800000001` 在 `slow_data` 场景下可命中网络降级诊断
- `13800000001`：可命中 `CMP-UP-100G` 套餐升级活动
- `13800000002`：客户偏好为 DND，不应返回营销活动
- `13800000003`：可生成催缴支付链接，并保留失败支付交易样例
- `13900000001` ~ `13900000006`：已补齐为完整客户主数据，可支撑催收/营销端到端链路

这些规则是为了让 `/Users/chenjun/Documents/obsidian/workspace/ai-bot/mcp_servers` 的 Tool 行为有可重复、可验证的 demo 基础。

## 运行

```bash
cd /Users/chenjun/Documents/obsidian/workspace/ai-bot/mock_apis
npm run dev
```

默认端口：`18008`

## 测试

```bash
cd /Users/chenjun/Documents/obsidian/workspace/ai-bot/mock_apis
bun test
npm run check
```

测试改为 **in-process**，不再要求提前手工启动服务。
