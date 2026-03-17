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
{ "ok": true, "versionId": 12 }
```

> Skill 文件写入时会自动创建版本快照，响应中新增 `versionId` 字段。

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

### 2.6 `diagnose_app`

对用户手机号执行营业厅 App 安全诊断。

**输入参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `phone` | `string` | 是 | 用户手机号 |
| `issue_type` | `enum` | 是 | `"app_locked"` / `"login_failed"` / `"device_incompatible"` / `"suspicious_activity"` |

从 `device_contexts` 表查询设备上下文，调用 `runSecurityDiagnosis()` 返回安全诊断结果。

---

### 2.7 `issue_invoice`

开具电子发票并发送到指定邮箱。

**输入参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `phone` | `string` | 是 | 用户手机号 |
| `month` | `string` | 是 | 账单月份，格式 `"YYYY-MM"` |
| `email` | `string` | 是 | 收件邮箱 |

**成功响应：**

```json
{
  "success": true,
  "invoice_no": "INV-202602-0001-1710000000",
  "month": "2026-02",
  "total": 68.0,
  "email": "z***@example.com",
  "status": "已发送"
}
```

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

## 8. 合规管理 API

### 8.1 `GET /api/compliance/keywords`
获取全部合规关键词库。

**响应（200）：**
```json
{
  "keywords": [
    { "id": "b01", "keyword": "这不是我负责的", "category": "banned", "description": "推诿责任" },
    { "id": "w01", "keyword": "保证能", "category": "warning", "description": "过度承诺" }
  ],
  "total": 18
}
```

### 8.2 `POST /api/compliance/keywords`
新增关键词。

**请求体：**
```json
{ "keyword": "不关我事", "category": "banned", "description": "推诿" }
```

### 8.3 `DELETE /api/compliance/keywords/:id`
删除指定关键词。

### 8.4 `POST /api/compliance/keywords/reload`
热重载 AC 自动机。

### 8.5 `POST /api/compliance/check`
在线检测文本（调试用）。

---

## 9. 版本管理 API

### 9.1 `GET /api/skill-versions?path=<relative-path>`
获取指定文件的版本列表。

### 9.2 `GET /api/skill-versions/:id`
获取指定版本的完整内容。

### 9.3 `GET /api/skill-versions/diff?from=x&to=y`
生成两个版本的行级 Diff（LCS 算法）。to 省略时与当前文件对比。

### 9.4 `POST /api/skill-versions/rollback`
回滚到指定版本。

**请求体：**
```json
{ "version_id": 3, "operator": "admin" }
```

---

## 10. 沙箱验证 API

### 10.1 `POST /api/sandbox/create`
创建沙箱环境。

### 10.2 `PUT /api/sandbox/:id/content`
编辑沙箱中的文件。

### 10.3 `POST /api/sandbox/:id/test`
在沙箱中运行 Agent 对话测试。

### 10.4 `POST /api/sandbox/:id/validate`
静态校验（Mermaid 语法、工具引用、必填字段、内容长度）。

### 10.5 `POST /api/sandbox/:id/publish`
发布到生产环境（同时创建版本记录）。

### 10.6 `DELETE /api/sandbox/:id`
删除沙箱。

---

## 11. 自然语言配置 API

### 11.1 `POST /api/skill-edit/clarify`
多轮需求澄清。

**请求体：**
```json
{ "instruction": "把发票开具时效改为3-5个工作日", "history": [] }
```

**响应（需要澄清）：**
```json
{ "status": "need_clarify", "question": "这是修改话术口径还是业务规则？", "missing": ["变更类型"] }
```

**响应（需求完整）：**
```json
{ "status": "ready", "parsed_intent": { "target_skill": "bill-inquiry", "change_type": "wording", "details": "...", "risk_level": "low" } }
```

### 11.2 `POST /api/skill-edit/`
LLM 生成修改 Diff。

### 11.3 `POST /api/skill-edit/apply`
确认写入（验证 old_fragment 仍存在后替换，创建版本记录）。

---

## 12. WebSocket 外呼接口（/ws/outbound）

### `GET /ws/outbound`（WebSocket 升级）

外呼语音 GLM-Realtime 代理端点，连接后机器人自动发起开场白。

**连接 URL：**

```
ws://localhost:18472/ws/outbound?task=collection&id=C001&lang=zh&phone=13800000001
```

| 查询参数 | 必填 | 说明 |
|---------|------|------|
| `task` | 否 | `collection` / `marketing`，默认 `marketing` |
| `id` | 否 | 任务 ID，默认按 task 类型取 `C001` / `M001` |
| `lang` | 否 | `zh` / `en`，默认 `zh` |
| `phone` | 否 | 客户手机号，默认 `13800000001` |

#### 外呼专用工具（本地 mock，不走 MCP）

| 工具名 | 参数 | 说明 |
|--------|------|------|
| `record_call_result` | `result`（枚举 10 种）、`remark?`、`callback_time?`、`ptp_date?` | 记录通话结果 |
| `send_followup_sms` | `sms_type`（4 种） | 发送跟进短信 |
| `transfer_to_human` | `reason`、`current_intent`、`recommended_action?` | 转人工 |
| `create_callback_task` | `callback_phone?`、`preferred_time` | 创建回访任务 |

#### 后端 → 前端事件

GLM 透传事件与 `/ws/voice` 相同，另增：

| type | 说明 |
|------|------|
| `transfer_to_human` | 转人工上下文（同 `/ws/voice`） |
| `emotion_update` | 情感分析结果 |
| `skill_diagram_update` | 外呼流程图（含工具高亮） |

---

## 13. AI 技能创建 API

### 13.1 `POST /api/skill-creator/chat`

多轮对话式技能创建。

**请求体：**
```json
{ "session_id": "uuid", "message": "我想创建一个宽带报修的技能" }
```

**响应：**
```json
{
  "reply": "好的，请问这个技能需要调用哪些工具？",
  "phase": "interview",
  "draft": null
}
```

`phase` 取值：`interview` → `draft` → `confirm` → `done`。`draft` 阶段返回 `{ skill_name, description, skill_md, references }` 预览。

### 13.2 `POST /api/skill-creator/save`

保存创建的技能到磁盘。

**请求体：**
```json
{ "session_id": "uuid" }
```

---

## 14. 灰度发布 API

### 14.1 `POST /api/canary/deploy`
部署灰度。

**请求体：**
```json
{ "skill_path": "biz-skills/bill-inquiry", "percentage": 30 }
```

### 14.2 `GET /api/canary/status`
查询灰度状态。

### 14.3 `POST /api/canary/promote`
灰度转正式（含版本记录）。

### 14.4 `DELETE /api/canary`
回滚灰度部署。

---

## 15. 变更审批 API

### 15.1 `GET /api/change-requests`
列出待审批变更。

### 15.2 `GET /api/change-requests/:id`
查看变更详情（含 Diff）。

### 15.3 `POST /api/change-requests/:id/approve`
批准变更并应用（含版本记录）。

### 15.4 `POST /api/change-requests/:id/reject`
驳回变更。

---

## 16. 回归测试 API

### 16.1 `GET /api/test-cases?skill=<name>`
列出测试用例（按 Skill 过滤）。

### 16.2 `POST /api/test-cases`
创建测试用例。

**请求体：**
```json
{ "skill_name": "bill-inquiry", "input_message": "查话费", "expected_keywords": ["账单", "费用"], "phone": "13800000001" }
```

### 16.3 `DELETE /api/test-cases/:id`
删除测试用例。

---

## 17. 知识管理 API（/km/*）

### 17.1 文档管理（/km/documents）

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/km/documents` | 列表（分页，支持 keyword/classification/status 过滤） |
| GET | `/km/documents/:id` | 详情（含版本列表） |
| POST | `/km/documents` | 创建文档 |
| PUT | `/km/documents/:id` | 更新元数据 |
| POST | `/km/documents/:id/versions` | 创建新版本 |
| POST | `/km/documents/versions/:vid/parse` | 触发解析管线（parse→chunk→generate→validate） |

### 17.2 候选 QA（/km/candidates）

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/km/candidates` | 列表（支持 status/source_type/gate_evidence 过滤） |
| GET | `/km/candidates/:id` | 详情（含证据、冲突、三门状态卡） |
| POST | `/km/candidates` | 创建候选 |
| PUT | `/km/candidates/:id` | 更新字段 |
| POST | `/km/candidates/:id/gate-check` | 重新执行三门验证 |

### 17.3 证据引用（/km/evidence）

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/km/evidence` | 列表（按 candidate_id/asset_id 过滤） |
| POST | `/km/evidence` | 创建证据引用 |
| PUT | `/km/evidence/:id` | 审核（pass/fail） |

### 17.4 冲突管理（/km/conflicts）

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/km/conflicts` | 列表 |
| GET | `/km/conflicts/:id` | 详情 |
| POST | `/km/conflicts` | 创建冲突记录 |
| PUT | `/km/conflicts/:id/resolve` | 仲裁（keep_a/keep_b/coexist/split） |

### 17.5 审核包（/km/review-packages）

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/km/review-packages` | 列表 |
| GET | `/km/review-packages/:id` | 详情（含候选列表） |
| POST | `/km/review-packages` | 创建审核包 |
| POST | `/km/review-packages/:id/submit` | 提交审核（触发三门检查，失败返回 blockers） |
| POST | `/km/review-packages/:id/approve` | 批准 |
| POST | `/km/review-packages/:id/reject` | 驳回 |

### 17.6 动作执行（/km/action-drafts）

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/km/action-drafts` | 列表 |
| GET | `/km/action-drafts/:id` | 详情 |
| POST | `/km/action-drafts` | 创建动作（publish/rollback/rescope/unpublish/downgrade/renew） |
| POST | `/km/action-drafts/:id/execute` | 执行动作（创建资产/回滚 + 回归窗口 + 审计日志） |

### 17.7 已发布资产（/km/assets）

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/km/assets` | 列表（支持 status/asset_type/keyword 过滤） |
| GET | `/km/assets/:id` | 资产详情 |
| GET | `/km/assets/:id/versions` | 版本历史 |

### 17.8 治理任务（/km/tasks）

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/km/tasks` | 列表（支持 status/task_type/assignee/priority 过滤） |
| POST | `/km/tasks` | 创建任务 |
| PUT | `/km/tasks/:id` | 更新状态/指派/结论 |

### 17.9 审计日志（/km/audit-logs）

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/km/audit-logs` | 列表（支持 action/object_type/operator/risk_level 过滤，只读） |

---

## 18. 环境变量配置

完整变量说明及 `.env` 示例见 **[06-deployment.md § 2](06-deployment.md)**。
