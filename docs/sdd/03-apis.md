# 03 - API 规范

## 1. HTTP REST API（后端 :18472）

### 1.1 `POST /api/chat`

发送用户消息，返回 Agent 回复。

**请求体：**

```json
{
  "message":    "查话费",
  "session_id": "f3c0ad20-a5c6-4881-85df-0254aaadfcc3",
  "user_phone": "13800000001"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `message` | `string` | 是 | 用户输入的消息 |
| `session_id` | `string` | 是 | 会话 ID（UUID），前端用 `crypto.randomUUID()` 生成 |
| `user_phone` | `string` | 否 | 用户手机号，注入 system prompt 的 `{{PHONE}}` 占位符 |

**成功响应（200）：**

```json
{
  "response":   "您好！您 2026 年 2 月的账单如下……",
  "session_id": "f3c0ad20-a5c6-4881-85df-0254aaadfcc3",
  "card": {
    "type": "bill_card",
    "data": {
      "month":           "2026-02",
      "total":           68.0,
      "plan_fee":        50.0,
      "data_fee":        8.0,
      "voice_fee":       0.0,
      "value_added_fee": 8.0,
      "tax":             2.0,
      "status":          "paid"
    }
  }
}
```

> `card` 字段仅在 Agent 调用了相应 MCP 工具时存在，否则为 `null`。

**card 四种类型：**

| `card.type` | 触发条件 | `data` 字段 |
|-------------|---------|------------|
| `bill_card` | 调用 `query_bill` | `month, total, plan_fee, data_fee, voice_fee, value_added_fee, tax, status` |
| `cancel_card` | 调用 `cancel_service` 成功 | `service_name, monthly_fee, effective_end, phone` |
| `plan_card` | 调用 `query_plans` | `name, monthly_fee, data_gb, voice_min, features[], description` |
| `diagnostic_card` | 调用 `diagnose_network` | `issue_type, diagnostic_steps[], conclusion` |

**错误响应（500）：**

```json
{
  "error": "Agent execution failed: ..."
}
```

---

### 1.2 `DELETE /api/sessions/:id`

清除指定会话的所有消息历史（级联删除 messages 表记录）。

```
DELETE /api/sessions/f3c0ad20-a5c6-4881-85df-0254aaadfcc3
```

**响应（200）：**

```json
{ "ok": true }
```

---

### 1.3 `GET /health`

健康检查端点，start.sh 启动后用于确认服务就绪。

**响应（200）：**

```json
{ "status": "ok" }
```

---

### 1.4 Files API（知识库编辑）

#### `GET /api/files/tree`

返回 `skills/` 目录下所有 `.md` 文件的树结构，供前端 Editor 页面展示。

**响应：**

```json
[
  {
    "name": "bill-inquiry",
    "children": [
      { "name": "SKILL.md",         "path": "bill-inquiry/SKILL.md" },
      { "name": "billing-rules.md", "path": "bill-inquiry/references/billing-rules.md" }
    ]
  }
]
```

#### `GET /api/files/content?path=<relative-path>`

读取指定文件的原始 Markdown 内容。

```
GET /api/files/content?path=bill-inquiry/SKILL.md
```

**响应：**

```json
{ "content": "---\nname: bill-inquiry\n..." }
```

#### `PUT /api/files/content`

保存编辑后的文件内容，立即生效（无需重启）。

**请求体：**

```json
{
  "path":    "bill-inquiry/SKILL.md",
  "content": "---\nname: bill-inquiry\n..."
}
```

**响应（200）：**

```json
{ "ok": true }
```

---

## 2. MCP 工具接口（telecom_service :8003）

MCP Server 通过 `StreamableHTTP` 协议暴露工具，Agent 通过 `@modelcontextprotocol/sdk` 客户端调用。

---

### 2.1 `query_subscriber`

查询用户基本信息、当前套餐、流量用量、已订增值业务。

**输入参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `phone` | `string` | 是 | 用户手机号，如 `"13800000001"` |

**成功响应：**

```json
{
  "found": true,
  "subscriber": {
    "phone":         "13800000001",
    "name":          "张三",
    "plan":          "畅享 50G 套餐",
    "plan_id":       "enjoy_50g",
    "status":        "active",
    "balance":       45.8,
    "data_used_gb":  32.5,
    "data_total_gb": 50,
    "voice_used_min":  120,
    "voice_total_min": 500,
    "activated_at":  "2024-01-15",
    "subscriptions": ["video_pkg", "sms_100"]
  }
}
```

**未找到：**

```json
{ "found": false }
```

---

### 2.2 `query_bill`

查询用户账单明细，不填月份返回最近 3 个月。

**输入参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `phone` | `string` | 是 | 用户手机号 |
| `month` | `string` | 否 | 格式 `"YYYY-MM"`，不填返回最近 3 个月 |

**单月响应：**

```json
{
  "found": true,
  "bill": {
    "month":           "2026-02",
    "total":           68.0,
    "plan_fee":        50.0,
    "data_fee":        8.0,
    "voice_fee":       0.0,
    "value_added_fee": 8.0,
    "tax":             2.0,
    "status":          "paid"
  }
}
```

**多月响应（不指定 month）：**

```json
{
  "found": true,
  "bills": [ { /* 账单对象 */ }, ... ]
}
```

---

### 2.3 `query_plans`

获取全部可用套餐，或查询指定套餐详情。

**输入参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `plan_id` | `string` | 否 | 不填返回全部套餐 |

**响应（全部套餐）：**

```json
{
  "found": true,
  "plans": [
    {
      "plan_id":    "plan_10g",
      "name":       "基础 10G 套餐",
      "monthly_fee": 19,
      "data_gb":    10,
      "voice_min":  100,
      "sms":        100,
      "features":   ["免费来电显示"],
      "description": "入门套餐，适合轻度用户"
    }
  ]
}
```

---

### 2.4 `cancel_service`

退订用户当前已订阅的增值业务。

**输入参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `phone` | `string` | 是 | 用户手机号 |
| `service_id` | `string` | 是 | 增值业务 ID，如 `"video_pkg"` |

**成功响应：**

```json
{
  "success":       true,
  "phone":         "13800000001",
  "service_name":  "视频会员流量包（20GB/月）",
  "monthly_fee":   20,
  "effective_end": "次月1日00:00"
}
```

**失败响应：**

```json
{
  "success": false,
  "message": "用户未订阅该业务"
}
```

---

### 2.5 `diagnose_network`

对用户手机号执行网络故障诊断，返回逐步诊断结果。

**输入参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `phone` | `string` | 是 | 用户手机号 |
| `issue_type` | `enum` | 是 | `"no_signal"` / `"slow_data"` / `"call_drop"` / `"no_network"` |

**响应：**

```json
{
  "success": true,
  "phone":   "13800000001",
  "issue_type": "slow_data",
  "diagnostic_steps": [
    { "step": "账号状态检查", "status": "ok",      "detail": "账号正常，无欠费" },
    { "step": "流量用量检查", "status": "warning",  "detail": "已用 32.5GB / 50GB（65%）" },
    { "step": "APN 配置检查", "status": "ok",      "detail": "APN 配置正确" },
    { "step": "网络拥塞检测", "status": "ok",      "detail": "当前无拥塞" }
  ],
  "conclusion": "流量使用量较高，建议升级套餐或购买流量包"
}
```

> `status` 取值：`"ok"` / `"warning"` / `"error"`

---

## 3. Skill 加载接口（Agent 内部工具）

Agent 在推理过程中通过以下两个内置工具加载 Skills 知识：

### `get_skill_instructions(skill_name)`

加载指定 Skill 的 `SKILL.md` 文件，返回完整操作流程。

| 调用示例 | 返回内容 |
|----------|----------|
| `get_skill_instructions("bill-inquiry")` | 账单查询处理规范 |
| `get_skill_instructions("plan-inquiry")` | 套餐推荐规范 |
| `get_skill_instructions("service-cancel")` | 退订政策与流程 |
| `get_skill_instructions("fault-diagnosis")` | 故障诊断流程 |

### `get_skill_reference(skill_name, filename)`

加载指定 Skill 的参考文档（`references/` 目录下的 Markdown 文件）。

| 调用示例 | 返回内容 |
|----------|----------|
| `get_skill_reference("bill-inquiry", "billing-rules.md")` | 计费规则详情 |
| `get_skill_reference("plan-inquiry", "plan-details.md")` | 套餐详细参数 |
| `get_skill_reference("service-cancel", "cancellation-policy.md")` | 退订政策细则 |
| `get_skill_reference("fault-diagnosis", "troubleshoot-guide.md")` | 故障排查指南 |

---

## 4. WebSocket 语音接口（后端 :18472）

### `GET /ws/voice`（WebSocket 升级）

GLM-Realtime 代理端点。前端通过此端点建立 WebSocket 连接后，后端自动连接 GLM-Realtime 并开始会话。

**连接 URL：**

```
ws://localhost:18472/ws/voice?phone=13800000001
```

| 查询参数 | 类型 | 必填 | 说明 |
|---------|------|------|------|
| `phone` | `string` | 否 | 用户手机号，注入语音 system prompt；默认 `13800000001` |

---

#### 前端 → 后端（透传给 GLM）

前端直接发送 GLM-Realtime 格式的 JSON 消息，后端透传：

```json
{
  "event_id": "uuid",
  "client_timestamp": 1710000000000,
  "type": "input_audio_buffer.append",
  "audio": "<base64 encoded 16kHz Int16 PCM>"
}
```

---

#### 后端 → 前端（GLM 事件 + 后端自定义事件）

**GLM 透传事件**（原样转发，前端自行处理）：

| 事件类型 | 说明 |
|---------|------|
| `session.created` / `session.updated` | 会话就绪 |
| `input_audio_buffer.speech_started` | VAD 检测到用户开始说话 |
| `input_audio_buffer.speech_stopped` | VAD 检测到用户停止说话 |
| `conversation.item.input_audio_transcription.completed` | 用户语音转写完成 |
| `response.audio_transcript.delta` | Bot 回复字幕增量 |
| `response.audio_transcript.done` | Bot 回复字幕完整文本（后端同时检测转接短语，匹配则触发转人工） |
| `response.audio.delta` | Bot 音频增量（base64 MP3） |
| `response.done` | 本轮回复完成 |
| `error` | GLM 错误 |

**后端自定义事件**（后端生成，不来自 GLM）：

```json
{
  "type": "transfer_to_human",
  "context": {
    "user_phone":            "13800000001",
    "session_id":            "uuid",
    "timestamp":             "2026-03-11T10:00:00.000Z",
    "transfer_reason":       "user_request",
    "customer_intent":       "查询账单异常扣费",
    "main_issue":            "用户反映本月账单比往月多扣费20元，怀疑有未知增值业务",
    "business_object":       ["账单", "视频会员流量包"],
    "confirmed_information": ["手机号：13800000001", "用户姓名：张三"],
    "actions_taken":         ["查询了2026-02账单", "查询了用户套餐信息"],
    "current_status":        "账单查询完成，扣费原因未核实",
    "handoff_reason":        "用户情绪不满，要求人工处理",
    "next_action":           "核查视频会员流量包订购记录，确认是否为误订",
    "priority":              "高",
    "risk_flags":            ["complaint"],
    "session_summary":       "用户张三反映本月账单多扣20元，AI已查询账单并确认存在视频会员流量包费用，用户否认订购，情绪不满要求转人工核查。"
  }
}
```

第二类后端自定义事件——情绪检测结果：

```json
{
  "type":  "emotion_update",
  "label": "不满",
  "emoji": "😤",
  "color": "#f97316"
}
```

每次用户语音转写完成后异步触发，前端用于实时展示当前用户情绪状态。

---

`transfer_reason` 枚举值：

| 值 | 含义 |
|----|------|
| `user_request` | 用户主动要求转人工 |
| `unrecognized_intent` | 连续意图无法识别 |
| `emotional_complaint` | 用户情绪激烈 / 投诉 |
| `high_risk_operation` | 高风险操作需人工确认 |
| `tool_failure` | 工具连续调用失败 |
| `identity_verify_failed` | 身份校验未通过 |
| `low_confidence` | 机器人置信度不足 |

---

---

## 5. WebSocket 文字客服接口（持久连接，/ws/chat）

### `GET /ws/chat`（WebSocket 升级）

持久 WebSocket 连接，多轮对话复用，替代旧 HTTP `/api/chat`。

**连接 URL：**

```
ws://localhost:18472/ws/chat?phone=13800000001&lang=zh
```

| 查询参数 | 必填 | 说明 |
|---------|------|------|
| `phone` | 否 | 用户手机号，默认 `13800000001` |
| `lang` | 否 | `zh` / `en`，默认 `zh` |

#### 客户端 → 后端

```json
{
  "type": "chat_message",
  "message": "查话费",
  "session_id": "uuid",
  "user_phone": "13800000001",
  "lang": "zh"
}
```

#### 后端 → 客户端

| type | 字段 | 说明 |
|------|------|------|
| `skill_diagram_update` | `skill_name, mermaid, msg_id` | 流程图实时推送 |
| `text_delta` | `delta, msg_id` | 流式文字增量 |
| `response` | `text, card, skill_diagram, msg_id` | 最终答复 |
| `error` | `message` | 处理异常 |

---

## 6. WebSocket 坐席工作台接口（/ws/agent）

### `GET /ws/agent`（WebSocket 升级）

坐席工作台专用持久 WebSocket，实时接收客户对话、情感分析结果与转人工摘要。

**连接 URL：**

```
ws://localhost:18472/ws/agent?phone=13800000001&lang=zh
```

| 查询参数 | 必填 | 说明 |
|---------|------|------|
| `phone` | 否 | 跟踪的用户手机号，默认 `13800000001` |
| `lang` | 否 | `zh` / `en`，默认 `zh` |

#### 客户端 → 后端（坐席发送消息）

```json
{
  "type": "agent_message",
  "message": "您好，我是人工客服，请问有什么可以帮您？"
}
```

#### 后端 → 客户端（完整事件列表）

| type | 来源 | 字段 | 说明 |
|------|------|------|------|
| `user_message` | 客户侧 | `text, msg_id` | 客户发的消息 |
| `text_delta` | 客户/坐席侧 | `delta, source, msg_id` | 流式 AI 回复增量 |
| `skill_diagram_update` | 客户/坐席侧 | `skill_name, mermaid, msg_id` | 流程图更新 |
| `response` | 客户/坐席侧 | `text, card, skill_diagram, source, msg_id` | AI 最终答复 |
| `emotion_update` | agent-ws 内部 | `label, emoji, color` | 情感分析结果 |
| `handoff_card` | agent-ws 内部 | `data: HandoffAnalysis` | 转人工摘要 |
| `agent_message` | Session Bus 回显 | `text, msg_id` | 坐席消息确认 |
| `error` | agent-ws | `message` | 错误信息 |

**`emotion_update` 示例：**

```json
{
  "type":  "emotion_update",
  "label": "焦虑",
  "emoji": "😟",
  "color": "orange"
}
```

`color` 取值：`"green"（开心）` / `"amber"（平静）` / `"orange"（焦虑）` / `"red"（愤怒）`

**`handoff_card` 示例：**

```json
{
  "type": "handoff_card",
  "data": {
    "customer_intent":       "查询账单异常扣费",
    "main_issue":            "本月账单多扣20元",
    "handoff_reason":        "用户情绪不满，要求人工处理",
    "next_action":           "核查视频会员流量包订购记录",
    "actions_taken":         ["查询了2026-02账单"],
    "risk_flags":            ["complaint"],
    "session_summary":       "用户反映本月账单多扣20元，AI已查询账单确认，用户情绪不满转人工。"
  }
}
```

---

## 7. 环境变量配置

完整变量说明及 `.env` 示例见 **[06-deployment.md § 2](06-deployment.md)**。
