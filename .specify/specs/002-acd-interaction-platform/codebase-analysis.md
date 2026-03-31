# 现有代码深度摸底分析

**目的**: 为 Interaction Platform 迁移提供代码级映射  
**日期**: 2026-03-31  
**关联**: [spec.md](spec.md) | [plan.md](plan.md)

---

## 目录

- [1. 总体架构现状](#1-总体架构现状)
- [2. SessionBus 深度分析](#2-sessionbus-深度分析)
- [3. Chat-WS 深度分析](#3-chat-ws-深度分析)
- [4. Agent-WS 深度分析](#4-agent-ws-深度分析)
- [5. Voice / Outbound 深度分析](#5-voice--outbound-深度分析)
- [6. Staff-Auth 深度分析](#6-staff-auth-深度分析)
- [7. 数据库全景](#7-数据库全景)
- [8. 迁移映射：留、搬、废](#8-迁移映射留搬废)
- [9. phone 主键耦合清单](#9-phone-主键耦合清单)
- [10. 安全与认证缺口](#10-安全与认证缺口)

---

## 1. 总体架构现状

### 1.1 Backend 当前承担的全部职责

Backend（端口 18472）是一个超级服务，入口 `backend/src/index.ts`，承担以下职责：

| 职责分类 | 路由/模块 | 文件 |
|---------|----------|------|
| HTTP API 框架 | Hono + CORS | `index.ts` |
| 客户文字聊天 | `POST /api/chat`, `GET /ws/chat` | `chat/chat.ts`, `chat/chat-ws.ts` |
| 客户语音通话 | `GET /ws/voice` | `chat/voice.ts` |
| 外呼语音/文字 | `GET /ws/outbound` | `chat/outbound.ts` |
| 坐席工作台 | `GET /ws/agent` | `agent/chat/agent-ws.ts` |
| Bot/Skill 运行时 | runAgent, runSkillTurn | `engine/runner.ts`, `engine/skill-runtime.ts` |
| 员工认证 | `/api/staff-auth/*` | `services/staff-auth.ts` |
| KM 服务代理 | `/api/km/*`, `/api/skills/*` 等 12 条路径 | `services/km-proxy.ts` |
| 工单服务代理 | `/api/work-items/*` 等 12 条路径 | `services/work-order-proxy.ts` |
| 合规检查 | `/api/compliance/*` | `agent/card/compliance.ts` |
| 测试数据 | `/api/mock-data/*` | `chat/mock-data.ts` |
| 跨通道事件总线 | sessionBus (内存) | `services/session-bus.ts` |
| 多语言翻译 | translateText, translateMermaid | `services/translate-lang.ts` |
| 情感分析 | analyzeEmotion | `services/emotion-analyzer.ts` |
| 转人工分析 | analyzeHandoff | `services/handoff-analyzer.ts` |
| 合规过滤 | checkCompliance, maskPII | `services/keyword-filter.ts` |
| 幻觉检测 | detectHallucination | `services/hallucination-detector.ts` |
| TTS | text-to-speech | `services/tts.ts` |
| 坐席助手 | buildCopilotContext | `services/km-client.ts` |
| 智能引导 | getWelcomeSuggestions | `services/conversation-guidance.ts` |

### 1.2 代理到的外部服务

| 服务 | 端口 | 代理路径前缀 | 代理文件 |
|------|------|-------------|---------|
| km_service | 18010 | `/api/km/`, `/api/skills/`, `/api/skill-versions/`, `/api/sandbox/`, `/api/canary/`, `/api/change-requests/`, `/api/test-cases/`, `/api/skill-creator/`, `/api/files/`, `/api/mcp/` | `km-proxy.ts` |
| work_order_service | 18009 | `/api/work-items/`, `/api/work-orders/`, `/api/appointments/`, `/api/templates/`, `/api/tickets/`, `/api/tasks/`, `/api/workflows/`, `/api/categories/`, `/api/intakes/`, `/api/drafts/`, `/api/issue-threads/`, `/api/merge-reviews/` | `work-order-proxy.ts` |
| MCP Servers | 18003-18007 | 内部 StreamableHTTP 调用 | `engine/runner.ts`, `services/km-client.ts` |

### 1.3 中间件链

```
请求 → cors() → staffSessionMiddleware (/api/*) → 路由 handler
```

- `staffSessionMiddleware`：读 `staff_session` cookie → SHA256 hash → DB 查 `staffSessions` → 注入 `staffId`, `platformRole` 到 context
- `requireRole(minRole)`：按 `platformRole` 层级检查（auditor=1 < reviewer=2 < config_editor=3 < flow_manager=4 < admin=5）

---

## 2. SessionBus 深度分析

**文件**: `backend/src/services/session-bus.ts`  
**测试**: `backend/tests/unittest/services/session-bus.test.ts`

### 2.1 核心数据结构

```typescript
// 内存状态
private subs: Map<string, Set<Subscriber>>     // phone → 订阅回调集合
private sessions: Map<string, string>            // phone → 当前活跃 sessionId
private history: Map<string, BusEvent[]>         // phone → 环形缓冲区 (最大 100 条)
```

### 2.2 API 方法

| 方法 | 签名 | 说明 |
|------|------|------|
| `subscribe` | `(phone, cb) → unsubscribe()` | 注册回调，返回取消函数 |
| `subscribeWithHistory` | `(phone, cb) → unsubscribe()` | 先回放历史再注册，agent-ws 专用 |
| `publish` | `(phone, event) → void` | 广播给该 phone 所有订阅者，选择性存入历史 |
| `clearHistory` | `(phone) → void` | 清空该 phone 历史缓冲区 |
| `setSession` | `(phone, sessionId) → void` | 设置活跃会话 |
| `getSession` | `(phone) → string?` | 获取活跃会话 |

### 2.3 事件类型全表

| source | type | 数据字段 | 存入历史? | 发布者 | 消费者 |
|--------|------|---------|----------|--------|--------|
| `user` | `user_message` | text | **是** | chat-ws | agent-ws |
| `user` | `text_delta` | delta | 否 | chat-ws | 客户 WS |
| `user` | `skill_diagram_update` | skill_name, mermaid, node_type_map | 否 | chat-ws, voice-common | agent-ws |
| `user` | `response` | text, card, skill_diagram | **是** | chat-ws | agent-ws |
| `user` | `transfer_data` | turns[], toolRecords[], args, userMessage | 否 | chat-ws | agent-ws (触发转人工分析) |
| `agent` | `agent_message` | text | **是** | agent-ws | chat-ws (转给客户) |
| `agent` | `text_delta` | delta | 否 | agent-ws | 客户 WS |
| `agent` | `response` | text, card, skill_diagram | **是** | agent-ws | chat-ws |
| `agent` | `transfer_to_bot` | — | 否 | agent-ws | chat-ws, voice.ts (重启 bot) |
| `voice` | `user_message` | text | **是** | glm-realtime-controller | agent-ws |
| `voice` | `response` | text | **是** | glm-realtime-controller, outbound-text | agent-ws |
| `voice` | `emotion_update` | label, emoji, color | 否 | runEmotionAnalysis | agent-ws (情绪卡) |
| `voice` | `skill_diagram_update` | skill_name, mermaid | 否 | sendSkillDiagram, runProgressTracking | agent-ws (流程图卡) |
| `voice` | `handoff_card` | data (HandoffAnalysis) | 否 | triggerHandoff | agent-ws (转人工卡) |
| `voice` | `compliance_alert` | data | 否 | checkCompliance, hallucination-detector | agent-ws (合规卡) |
| `system` | `new_session` | channel | **是** | chat-ws, voice.ts, outbound.ts | agent-ws |
| `system` | `reply_hints` | data, phone | **是** | (预留) | agent-ws (助手卡) |

**历史存储规则**: 仅 `user_message`, `response`, `agent_message`, `new_session`, `reply_hints` 五种类型存入环形缓冲区。

### 2.4 数据流模式

```
文字聊天:
  客户 WS ──publish(user:user_message)──→ sessionBus ──→ 坐席 WS
  坐席 WS ──publish(agent:agent_message)──→ sessionBus ──→ 客户 WS

语音通话:
  GLM Controller ──publish(voice:user_message)──→ sessionBus ──→ 坐席 WS
  坐席 WS ──publish(agent:agent_message)──→ sessionBus ──→ voice.ts (TTS → 客户)

外呼:
  Outbound Session ──publish(voice:response)──→ sessionBus ──→ 坐席 WS
```

### 2.5 关键限制

1. **单 phone 单 session**: `setSession(phone, sessionId)` 覆盖写入，最后连接的通道"赢"
2. **无通道隔离**: 同一 phone 的 chat/voice/outbound 事件混在一起，靠回调内 `if (event.source)` 过滤
3. **无持久化**: 进程重启即全部丢失
4. **无权限控制**: 任何知道 phone 的模块都能 subscribe/publish
5. **无并发控制**: 一个坐席无法同时持有多个客户的事件流（需要断开重连）

---

## 3. Chat-WS 深度分析

**文件**: `backend/src/chat/chat-ws.ts` (559 行)  
**端点**: `GET /ws/chat?phone=<phone>&sessionId=<uuid>&lang=<zh|en>`

### 3.1 客户端→服务器消息

| type | 字段 | 说明 |
|------|------|------|
| `chat_message` | message | 用户发送文本消息 |
| `set_lang` | lang | 切换语言偏好 |

### 3.2 服务器→客户端事件

| type | source | 关键字段 | 说明 |
|------|--------|---------|------|
| `text_delta` | user | delta | Bot 流式文本块 (3字符/20ms) |
| `step_text` | user | text | 中间步骤描述 ("身份验证通过，正在查询...") |
| `skill_diagram_update` | user | skill_name, mermaid, active_step_id | 技能流程图 + 高亮当前步骤 |
| `response` | user | text, card, skill_diagram, pending_confirm | Bot 完整响应 |
| `agent_message` | agent | text, translated_text? | 坐席消息（可含翻译） |
| `transfer_to_bot` | agent | — | 坐席转回机器人 |
| `transfer_to_human` | — | — | Bot 发起转人工 |
| `error` | — | message | 错误事件 |

### 3.3 双路径 AI 处理

```
消息到达
  │
  ├─ routeSkill(sessionId) → RouteResult
  │
  ├─ mode='runtime' && spec 存在?
  │   ├─ YES → runSkillTurn() ← 状态机工作流执行
  │   │         - 可恢复实例 (findActiveInstance / createInstance)
  │   │         - 返回 { text, currentStepId, finished, pendingConfirm, transferRequested }
  │   │
  │   └─ NO 或 runtime 出错 → 回退到 legacy
  │
  └─ Legacy → runAgent() ← Vercel AI SDK generateText + MCP tools
               - maxSteps=10
               - 3 个回调: onDiagramUpdate, onTextDelta, implicit persistence
               - 返回 AgentResult { text, card, skill_diagram, transferData, steps[] }
```

### 3.4 转人工流程 (Chat 侧)

```
1. Bot 检测到需要转人工 (tool result 或 skill branch)
2. result.transferData = { turns, toolRecords, args, userMessage }
3. sessionBus.publish(phone, { source:'user', type:'transfer_data', ... })
   → agent-ws 收到后异步调 analyzeHandoff() (20s 超时 + 兜底)
   → 生成 HandoffAnalysis → 发送 handoff_card 到坐席 WS
4. botEnabled = false
5. ws.send({ type: 'transfer_to_human' }) → 客户端显示"正在转接"
6. 后续客户消息不再走 bot，直接 publish 到 bus 让坐席看到
```

### 3.5 关键依赖

| 依赖 | 用途 |
|------|------|
| `sessionBus` | 跨通道事件发布/订阅 |
| `runAgent()` / `runSkillTurn()` | AI 推理 + 工具调用 |
| `routeSkill()` / `shouldUseRuntime()` | 路径选择 |
| `normalizeQuery()` | 意图提取 + 查询重写 |
| `translateText()` / `translateMermaid()` | 多语言翻译 |
| `checkCompliance()` / `maskPII()` | 合规检查 + PII 脱敏 |
| `detectHallucination()` | 异步幻觉检测 |
| `runProgressTracking()` | 异步进度状态追踪 |
| `buildCopilotContext()` | 坐席助手上下文生成 |
| `getWelcomeSuggestions()` | 欢迎语建议 |
| `platformDb` | sessions, messages 表 |
| `businessDb` | subscribers, plans 表 (只读) |

### 3.6 phone 耦合点

| 位置 | 用途 | 改造影响 |
|------|------|---------|
| 查询参数 `?phone=` | WebSocket 连接标识 | 需改为 conversation_id 或 interaction_id |
| `sessionBus.subscribe(phone, ...)` | 事件订阅 | 需改为按 interaction 订阅 |
| `sessionBus.publish(phone, ...)` | 事件发布 | 同上 |
| `sessionBus.setSession(phone, sessionId)` | 会话绑定 | 需改为 conversation → session 映射 |
| `sessionBus.clearHistory(phone)` | 历史清空 | 同上 |
| `setCustomerLang(phone, lang)` | 语言偏好 | 改为按 conversation 存储 |
| 查询 `subscribers` 表 by phone | 客户信息 | 改为通过 customer_party_id |

---

## 4. Agent-WS 深度分析

**文件**: `backend/src/agent/chat/agent-ws.ts`  
**端点**: `GET /ws/agent?phone=<phone>&lang=<zh|en>`

### 4.1 坐席→服务器消息

| type | 字段 | 动作 |
|------|------|------|
| `agent_message` | message | 合规检查后 publish 到 sessionBus |
| `set_lang` | lang | 更新坐席语言偏好 |
| (特殊) | message 匹配 `/转机器人\|transfer\s*to\s*bot/i` | publish `transfer_to_bot` 而非转发给客户 |

### 4.2 服务器→坐席事件

| type | 来源 | 说明 |
|------|------|------|
| `user_message` | 客户/语音 | 客户消息（可含翻译） |
| `text_delta` | 各通道 | 流式文本块 |
| `skill_diagram_update` | 各通道 | 流程图更新 |
| `response` | 各通道 | 完整响应 |
| `emotion_update` | 异步分析 | 情绪识别结果 |
| `handoff_card` | 异步分析 | 转人工分析卡 |
| `compliance_alert` | 合规检查 | 合规违规告警 |
| `new_session` | system | 新会话开始 |
| `compliance_block` | 本地检查 | 坐席发言被禁止 |
| `compliance_warning` | 本地检查 | 坐席发言有风险 |

### 4.3 当前"分配"模型

**当前模式: 手动选人（非队列/非路由）**

```
1. 前端 AgentWorkstationPage 有一个客户下拉列表（testPersonas）
2. 坐席点击选择客户 → BroadcastChannel('ai-bot-user-sync') 广播
3. 客户页面（Chat/Voice/Outbound）切换到对应 phone
4. 坐席 WS 断开当前连接 → 重连到新 phone
5. 一个 WS 连接 = 一个客户 = 独占
```

**关键限制**:
- 无自动路由 / 无排队
- 无负载均衡
- 无多客户并发（切换需断开重连）
- 无 offer / accept / reject 机制
- 无 Inbox 模型

### 4.4 转人工分析 (HandoffAnalysis)

```typescript
interface HandoffAnalysis {
  customer_intent: string;          // 推断意图
  main_issue: string;               // 用户消息前 50 字
  business_object: string[];        // 业务对象（宽带/语音等）
  confirmed_information: string[];  // 已确认信息
  actions_taken: string[];          // 已执行动作
  current_status: string;           // "处理中" / "已完成"
  handoff_reason: string;           // 转人工原因
  next_action: string;              // 建议坐席操作
  priority: string;                 // "低/中/高"
  risk_flags: string[];             // 风险标记
  session_summary: string;          // 80-150 字摘要
}
```

- 异步执行，20 秒超时
- LLM 分析失败时使用兜底值填充
- 结果通过 `handoff_card` 事件推送到坐席卡片面板

### 4.5 坐席助手 (Agent Copilot) 卡片系统

**卡片注册**: `frontend/src/agent/cards/index.ts`

| 卡片 ID | 标题 | 事件源 | 说明 |
|---------|------|--------|------|
| `user_detail` | 用户详情 | 手动注入 | 客户信息（姓名/套餐/性别） |
| `outbound_task` | 外呼任务 | 手动注入 | 外呼任务详情 |
| `emotion` | 情绪分析 | `emotion_update` | 实时情绪频谱条 |
| `compliance` | 合规监控 | `compliance_alert` | 累计告警日志 |
| `handoff` | 转人工摘要 | `handoff_card` | 转接上下文 + 建议操作 |
| `agent_copilot` | 坐席助手 | `agent_copilot` / `reply_hints` | 推荐回复 + KB 问答（全宽） |
| `diagram` | 流程图 | `skill_diagram_update` | Mermaid 状态图 + 进度高亮（全宽） |
| `work_order_*` | 工单卡片 | 各类 | 工单摘要/时间线/预约 |

**坐席助手数据结构**:

```typescript
interface AgentCopilotData {
  summary: {
    current_summary: string;
    intent: string;
    scene: { code, label, risk };
    emotion: string;
    missing_slots: string[];
    recommended_actions: string[];
    confidence: number;
  };
  recommendations: {
    reply_options: Array<{ label, text, source }>;
    recommended_terms: string[];
    forbidden_terms: string[];
    next_actions: string[];
  };
  suggested_questions: string[];
}
```

### 4.6 前端坐席工作台架构

```
/agent/*
├── AgentWorkstationPage (主壳，持有 WS 连接)
│   ├── AgentSidebarMenu (导航: 工作台/知识库/工单)
│   ├── AgentTopBar (语言切换, 客户选择器)
│   ├── CardPanel (右侧卡片面板)
│   │   └── CardShell × N (各类卡片)
│   ├── 聊天记录区 (中间)
│   └── 输入框 (底部)
```

**关键状态**:
- `messages: AgentMessage[]` — 所有消息
- `cardStates: CardState[]` — 卡片可见性 + 排序
- `botMode: 'bot' | 'human'` — 当前谁在响应
- `processedMsgIds: Set<string>` — 消息去重（最近 100 条）

### 4.7 phone 耦合点

| 位置 | 用途 | 改造影响 |
|------|------|---------|
| 查询参数 `?phone=` | 坐席连接哪个客户 | 改为 interaction_id |
| `subscribeWithHistory(phone, ...)` | 订阅 + 回放历史 | 改为按 interaction 订阅 |
| `setAgentLang(phone, lang)` | 坐席语言偏好 | 改为按 agent_id 存储 |
| `BroadcastChannel('ai-bot-user-sync')` | 客户切换 | 整体废弃，改为 Inbox offer/accept |
| testPersonas 下拉列表 | 选择客户 | 整体废弃 |

---

## 5. Voice / Outbound 深度分析

### 5.1 Voice (`/ws/voice`)

**文件**: `backend/src/chat/voice.ts`

#### 连接生命周期

```
客户 WS 连接
  ↓
VoiceSessionState 初始化 (管理: 通话轮次, barge-in, mute, 静音计时器)
  ↓
GlmRealtimeController 创建 (GLM-Realtime 协议处理)
  ↓
controller.start(ws) → 连接 GLM-Realtime 后端
  ↓
sessionBus.subscribe(phone) → 监听坐席消息 → TTS → 转发给客户
```

#### GLM Controller 钩子

| 钩子 | 用途 |
|------|------|
| `onGlmEvent()` | 拦截 GLM 消息（抑制转写错误/工具处理时音频/转接后响应） |
| `onBeforeToolCall()` | 短路 `get_skill_instructions` → 加载本地 Skill 内容 + 激活 SOP Guard |
| `sopCheck()` / `sopRecord()` | SOP 规则执行 |
| `mockToolCall()` | Mock 工具路由到模拟引擎 |
| `onBotReply()` | 异步: 合规检查 + 进度追踪 + 语言验证 |
| `onClose()` | 清理: 清除静音计时器, 取消订阅 |

#### sessionBus 交互

- 发布: `voice:user_message`, `voice:response`, `voice:emotion_update`, `voice:skill_diagram_update`, `voice:handoff_card`, `voice:compliance_alert`
- 订阅: `agent:agent_message` → 翻译 → TTS → 发给客户; `agent:transfer_to_bot` → 重启 bot

### 5.2 Outbound (`/ws/outbound`)

**文件**: `backend/src/chat/outbound.ts`

#### 与 Voice 的关键差异

| 方面 | Voice (呼入) | Outbound (外呼) |
|------|-------------|-----------------|
| 主动权 | 客户发起 | 系统发起 |
| 工具数 | 30+ (MCP servers) | 4 个专用: `record_call_result`, `send_followup_sms`, `transfer_to_human`, `create_callback_task` |
| 任务信息 | 从业务 DB 查询 | 注入系统提示词 |
| 语音风格 | 单一 | 按任务类型区分 (催收=冷静专业, 营销=热情亲切) |
| 文字模式 | 无 | 支持 `?mode=text` 使用 OutboundTextSession |

#### 任务加载

```typescript
loadTaskFromDB(taskId)
  → 查询 outboundTasks 表
  → 返回 data[lang] (支持国际化)
```

### 5.3 voice/outbound 共用服务

**文件**: `backend/src/services/voice-common.ts`

| 函数 | 用途 | sessionBus 事件 |
|------|------|----------------|
| `sendSkillDiagram()` | 发送技能流程图 | `voice:skill_diagram_update` |
| `runEmotionAnalysis()` | 异步情绪分析 | `voice:emotion_update` |
| `runProgressTracking()` | 异步进度状态追踪 | `voice:skill_diagram_update` (含高亮) |
| `triggerHandoff()` | 转人工分析 + 发布卡片 | `voice:handoff_card` |

### 5.4 phone 耦合点

Voice 和 Outbound 的 phone 耦合点与 chat-ws 基本相同，额外包括:
- `VoiceSessionState.userPhone` — 通话状态绑定到 phone
- 系统提示词模板变量 `{{PHONE}}` — 注入客户手机号
- `enrichToolArgs()` — 自动填充 `callback_phone`

---

## 6. Staff-Auth 深度分析

**文件**: `backend/src/services/staff-auth.ts`

### 6.1 认证 API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/staff-auth/login` | POST | 用户名+密码登录，创建 session，设置 httpOnly cookie |
| `/api/staff-auth/logout` | POST | 删除 session 记录，清除 cookie |
| `/api/staff-auth/me` | GET | 验证当前登录状态 |

### 6.2 Cookie/Session 机制

```
登录:
  1. 验证 username + Bun.password.verify(password, hash)
  2. 生成 token = crypto.randomUUID()
  3. 存入 DB: staffSessions { token_hash: SHA256(token), expires_at: +24h }
  4. 设置 cookie: staff_session=<token> (httpOnly, sameSite=Lax, maxAge=86400)

验证:
  1. 读 cookie → hash → DB 查询 staffSessions
  2. 检查 expires_at > NOW() && staffAccounts.status='active'
  3. 更新 last_seen_at (活跃追踪，非续期)
  4. 注入 context: staffId, staffRole, staffRoles, platformRole

清理:
  - 启动时 + 每小时: cleanExpiredSessions() 删除过期记录
```

**注意**: TTL 固定 24 小时，活动不续期。

### 6.3 Staff 数据库表

#### `staff_accounts` 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| username | TEXT UNIQUE | 登录名 |
| display_name | TEXT | 显示名 |
| password_hash | TEXT | bcrypt hash |
| primary_staff_role | TEXT | `'agent'` / `'operations'` — 决定默认登录页 |
| staff_roles | TEXT | JSON 数组 `["agent"]` / `["agent","operations"]` |
| platform_role | TEXT | RBAC: `auditor/reviewer/config_editor/flow_manager/admin` |
| team_code | TEXT | 团队编码: `frontline_online`, `ops_knowledge` 等 |
| seat_code | TEXT? | 坐席编码: `A01`, `D01` |
| default_queue_code | TEXT? | 默认队列: `frontline`, `callback_team` |
| lang | TEXT | `zh` / `en` |
| status | TEXT | `active` / `disabled` |

#### 种子数据 (6 个演示账号)

| 用户名 | 角色 | 团队 | 队列 |
|--------|------|------|------|
| demo | admin, agent+operations | demo_supervisor | — |
| zhang.qi | agent, auditor | frontline_online | frontline |
| li.na | agent, auditor | frontline_online | frontline |
| wang.lei | agent, auditor | callback_team | callback_team |
| chen.min | operations, flow_manager | ops_knowledge | — |
| zhao.ning | operations, flow_manager | ops_workorder | — |

### 6.4 身份流转到其他系统

```
                          ┌─────────────────────────────┐
                          │ staffSessionMiddleware       │
                          │ 提取: staffId, platformRole  │
                          └──────┬──────────────────────┘
                                 │
           ┌─────────────────────┼───────────────────────┐
           ▼                     ▼                       ▼
    REST → km-proxy         REST → wo-proxy          WS → agent-ws
    注入 headers:            注入 headers:             仅检查 cookie 存在
    X-Staff-Id              X-Staff-Id                (不验证有效性!)
    X-Staff-Role            X-Staff-Role
    X-User-Id               X-User-Id
    X-User-Role             X-User-Role
```

### 6.5 支持 Token-Based Auth 的改造建议

当前仅支持 cookie，不支持 service-to-service 场景。为 interaction-platform 服务支持，建议:

**方案 A (推荐): 扩展 staffSessionMiddleware 支持 Bearer Token**

```
读取顺序:
1. Cookie: staff_session
2. Header: Authorization: Bearer <token>
3. Header: X-Staff-Token (备选)

所有 token 共用同一 staffSessions 表和 SHA256 验证逻辑。
新增 POST /api/staff-auth/create-token 端点供管理员创建长期 token。
```

改动量: `staff-auth.ts` ~30 行。

---

## 7. 数据库全景

### 7.1 三库架构

| 数据库 | 位置 | 用途 | 访问模式 |
|--------|------|------|---------|
| `km.db` | `/data/km.db` | 平台 + 知识管理 | backend 读写, km_service 读写 |
| `platform.db` | `/data/platform.db` | 后端运行时 | backend 独占 |
| `business.db` | `/data/business.db` | 电信业务数据 | backend 只读, MCP servers 读写 |

### 7.2 platform.db 关键表

| 表 | 说明 | 与 Interaction Platform 关系 |
|----|------|---------------------------|
| `sessions` | 会话记录 (id, createdAt) | → 将被 `conversation` + `interaction` 取代 |
| `messages` | 消息记录 (sessionId, role, content) | → 将被 conversation messages 取代 |
| `staffAccounts` | 员工账号 | → 保留，作为 identity source |
| `staffSessions` | 员工登录会话 | → 保留，扩展 Bearer token 支持 |
| `outboundTasks` | 外呼任务 | → 暂保留 |

### 7.3 km.db 关键表

| 表 | 说明 |
|----|------|
| `skillRegistry` | 技能注册表 |
| `skillVersions` | 技能版本管理 |
| `changeRequests` | 变更请求工作流 |
| `skillWorkflowSpecs` | 技能工作流规格 (Mermaid + spec_json) |
| `skillInstances` | 工作流运行时实例 |
| `skillInstanceEvents` | 实例事件日志 |
| `executionRecords` | 工具执行审计记录 |
| `mcpServers` | MCP 服务器注册 |
| `mcpTools` | MCP 工具注册 |
| `km*` (16 张表) | 知识管理全套 |

### 7.4 business.db 关键表 (33 张)

电信业务域: subscribers, plans, bills, contracts, callbackTasks, networkIncidents, ordersServiceOrders 等。Backend 只读访问，所有写操作通过 MCP servers 完成。

---

## 8. 迁移映射：留、搬、废

### 8.1 留在 Backend 的模块

| 模块 | 文件 | 原因 |
|------|------|------|
| Bot 运行时 | `engine/runner.ts`, `engine/skill-runtime.ts` | plan.md 明确: backend 继续负责 bot/skills/tools |
| Skill 加载 | `engine/skills.ts` | 同上 |
| MCP 工具调用 | `engine/runner.ts` createMCPClient | bot 执行层能力 |
| Staff Auth 身份源 | `services/staff-auth.ts` | 扩展 Bearer 支持后继续作为 identity source |
| KM 代理 | `services/km-proxy.ts` | 继续代理给 km_service |
| 工单代理 | `services/work-order-proxy.ts` | 继续代理给 work_order_service |
| 合规检查服务 | `services/keyword-filter.ts` | 共享服务，两边都需要 |
| 翻译服务 | `services/translate-lang.ts` | 共享服务 |
| 查询归一化 | `services/query-normalizer/` | bot 预处理 |
| 幻觉检测 | `services/hallucination-detector.ts` | bot 质量保障 |
| 日志服务 | `services/logger.ts` | 共享基础设施 |
| i18n | `services/i18n.ts` | 共享基础设施 |

### 8.2 搬到 Interaction Platform 的模块

| 模块 | 当前文件 | 新归属 | 说明 |
|------|---------|--------|------|
| 客户 WS (文字) | `chat/chat-ws.ts` | Gateway → Ingress | 渠道接入层 |
| 客户 WS (语音) | `chat/voice.ts` | Gateway → Ingress | 渠道接入层 |
| 外呼 WS | `chat/outbound.ts` | Gateway → Ingress | 渠道接入层 |
| 坐席 WS | `agent/chat/agent-ws.ts` | Workspace Gateway | Inbox 模型核心 |
| SessionBus | `services/session-bus.ts` | Routing Kernel → Event Model | 改造为 interaction-keyed event bus |
| 转人工分析 | `services/handoff-analyzer.ts` | Hub → Materialization | interaction 创建触发器 |
| 情绪分析 | `services/emotion-analyzer.ts` | Workspace → Enrichment | 坐席辅助能力 |
| 语言会话 | `services/lang-session.ts` | Hub → Session State | 按 conversation 管理 |
| 坐席助手 | `services/km-client.ts` (buildCopilotContext) | Workspace → Copilot | Inbox 内建能力 |
| 进度追踪 | `services/voice-common.ts` (runProgressTracking) | Workspace → Enrichment | 可视化辅助 |
| TTS | `services/tts.ts` | Gateway → Outbound Adapter | 语音出站 |
| GLM Controller | `services/glm-realtime-controller.ts` | Gateway → Voice Adapter | GLM 协议处理 |
| 语音状态 | `services/voice-session.ts` | Gateway → Session State | 通话状态管理 |
| 智能引导 | `services/conversation-guidance.ts` | Hub → Enrichment | 对话初始引导 |

### 8.3 废弃的模块/概念

| 模块/概念 | 原因 | 替代 |
|----------|------|------|
| phone 作为事件总线主键 | 不支持多客户并发、无 phone 渠道 | interaction_id |
| phone 作为 session 绑定键 | 同上 | conversation_id |
| sessionBus.setSession(phone, sessionId) | 单 phone 单 session 限制 | conversation → interaction 映射 |
| BroadcastChannel('ai-bot-user-sync') | 手动选人模型 | Inbox offer/accept/reject |
| testPersonas 下拉列表 | Demo 用手动选客户 | Inbox 列表 |
| botEnabled 布尔开关 | 简单 on/off 不够 | interaction 状态机 (bot/queued/offered/assigned/active) |

---

## 9. Phone 主键耦合清单

以下是所有以 `phone` 作为主键/查找键的位置，按改造优先级排列:

### P0 — 必须在 Phase 1 改造

| 文件 | 行为 | 替代键 |
|------|------|--------|
| `session-bus.ts` subscribe/publish/setSession/getSession | 所有事件以 phone 隔离 | interaction_id (或 conversation_id + channel) |
| `chat-ws.ts` 查询参数 `?phone=` | WS 连接标识 | conversation_id |
| `agent-ws.ts` 查询参数 `?phone=` | 坐席绑定客户 | interaction_id |
| `voice.ts` 查询参数 `?phone=` | 语音连接标识 | conversation_id |
| `outbound.ts` 查询参数 `?phone=` | 外呼连接标识 | conversation_id |
| `lang-session.ts` setCustomerLang/setAgentLang(phone) | 语言偏好存储 | conversation_id / agent_id |

### P1 — Phase 2 改造

| 文件 | 行为 | 替代键 |
|------|------|--------|
| `voice-common.ts` 所有函数第二个参数 userPhone | 传递到 sessionBus | interaction_id |
| `glm-realtime-controller.ts` 内部持有 userPhone | 传递到事件 | interaction_id |
| `outbound-text-session.ts` 持有 userPhone | 传递到事件 | interaction_id |
| businessDb 查询 `subscribers` by phone | 客户信息查找 | customer_party_id → identity 映射 |

### P2 — 可后续处理

| 文件 | 行为 | 说明 |
|------|------|------|
| 系统提示词 `{{PHONE}}` 模板变量 | 注入手机号 | 保留为 identity 属性，不再作为主键 |
| `enrichToolArgs()` callback_phone | 自动填充 | 从 customer_identity 获取 |

---

## 10. 安全与认证缺口

### 10.1 WebSocket 认证缺口

**问题**: `agent-ws.ts` 仅检查 `staff_session` cookie **是否存在**，不验证是否有效。

```typescript
// 当前代码 (agent-ws.ts)
const cookie = getCookie(c, 'staff_session');
if (!cookie && process.env.NODE_ENV === 'production') {
  ws.close(4401, 'Unauthorized');
  return;
}
// cookie 过期/无效也能连接!
```

**建议**: Phase 1 中必须修复，在 WS onOpen 时调用 `resolveSession(cookie)` 验证。

### 10.2 SessionBus 无鉴权

**问题**: 任何知道 phone 的代码都能 subscribe/publish，无权限检查。

**当前风险**: 低（单进程内部使用）。
**未来风险**: Interaction Platform 作为独立服务后，事件通道需要鉴权。

**建议**: Interaction Platform 内部使用时，改为服务内事件分发，外部通过 API 访问。

### 10.3 客户 WS 无认证

**问题**: `/ws/chat` 无任何认证，仅凭 phone + sessionId 连接。

**当前风险**: 低（Demo 系统）。
**未来风险**: 需要在 Gateway 层增加客户身份验证。

### 10.4 Staff-Auth Token 改造

**需求**: interaction-platform 作为独立服务需要验证坐席身份。

**建议方案**: Backend 签发可验证 Token（扩展 staffSessionMiddleware 支持 Bearer header）。

改造范围:
1. `staff-auth.ts` — 新增 `POST /api/staff-auth/create-token` + 扩展 middleware 读 `Authorization` header
2. `agent-ws.ts` — 修复 cookie 验证逻辑
3. interaction-platform — 使用 Bearer token 调用 backend 验证坐席身份

---

## 附录 A: 服务依赖关系图

```
┌─────────────────────────────────────────────────────────┐
│                    Backend (port 18472)                  │
│                                                         │
│  ┌───────────┐   ┌──────────┐   ┌──────────┐          │
│  │ /ws/chat  │   │ /ws/voice│   │/ws/outbound│         │
│  │ chat-ws   │   │ voice.ts │   │ outbound  │          │
│  └─────┬─────┘   └────┬─────┘   └─────┬─────┘         │
│        │              │               │                 │
│        └──────────┬───┴───────────────┘                 │
│                   ▼                                     │
│           ┌──────────────┐                              │
│           │  sessionBus  │ ← phone-keyed                │
│           └──────┬───────┘                              │
│                  │                                      │
│           ┌──────▼───────┐                              │
│           │  /ws/agent   │                              │
│           │  agent-ws    │                              │
│           └──────────────┘                              │
│                                                         │
│  ┌───────────┐  ┌──────────────┐  ┌─────────────┐     │
│  │ runAgent  │  │ runSkillTurn │  │ staff-auth   │     │
│  │ (engine)  │  │ (runtime)    │  │ (auth+rbac)  │     │
│  └─────┬─────┘  └──────────────┘  └─────────────┘     │
│        │                                                │
│  ┌─────▼────────────────────────────────────────┐      │
│  │ km-proxy → km_service:18010                   │      │
│  │ wo-proxy → work_order_service:18009           │      │
│  │ MCP client → mcp_servers:18003-18007          │      │
│  └───────────────────────────────────────────────┘      │
│                                                         │
│  ┌──────────────────────────────────────────────┐      │
│  │ DB: platform.db (sessions, messages, staff)   │      │
│  │ DB: business.db (subscribers, plans) [只读]   │      │
│  │ DB: km.db (skills, km, mcp) [共享]            │      │
│  └──────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────┘
```

## 附录 B: 前端坐席工作台组件树

```
/agent/*
├── auth/
│   ├── LoginPage.tsx        — 登录表单
│   ├── AuthProvider.tsx     — React Context (staff state)
│   ├── ProtectedRoute.tsx   — 路由守卫
│   └── api.ts               — login/logout/fetchMe API
│
├── AgentWorkstationPage.tsx — 主壳 (持有 WS, 管理 messages/cards)
├── AgentSidebarMenu.tsx     — 左侧导航
├── AgentTopBar.tsx          — 顶栏 (语言/客户选择)
│
├── cards/
│   ├── index.ts             — registerCard() 注册表
│   ├── CardPanel.tsx        — 右侧卡片面板 (两列贪心排版)
│   ├── CardShell.tsx        — 卡片外壳 (折叠/展开/拖拽)
│   └── contents/
│       ├── EmotionContent.tsx      — 情绪频谱
│       ├── HandoffContent.tsx      — 转人工摘要
│       ├── ComplianceContent.tsx   — 合规告警
│       ├── AgentCopilotContent.tsx — 坐席助手 (推荐回复+KB问答)
│       ├── DiagramContent.tsx      — Mermaid 流程图
│       └── WorkOrder*.tsx          — 工单相关卡片
│
└── chat/
    ├── testPersonas.ts      — 测试客户数据 [将废弃]
    └── userSync.ts          — BroadcastChannel 客户切换 [将废弃]
```
