# 断言类型目录

> 以下 11 种断言类型是唯一允许的类型。不得使用此目录之外的断言类型。

---

## 文本断言

### `contains`
- **值格式**：子字符串
- **判定**：回复文本必须包含该子字符串（大小写敏感）
- **示例**：`{ "type": "contains", "value": "账单" }`
- **适用**：验证回复与特定话题相关

### `not_contains`
- **值格式**：子字符串
- **判定**：回复文本不得包含该子字符串
- **示例**：`{ "type": "not_contains", "value": "已退订" }`
- **适用**：验证未确认前不会执行操作、不泄露敏感信息

### `regex`
- **值格式**：JavaScript 正则表达式（不含分隔符）
- **判定**：回复文本匹配该正则
- **示例**：`{ "type": "regex", "value": "\\d+\\.?\\d*元" }`
- **适用**：验证回复包含特定格式（金额、日期、编号等）

---

## 工具断言

### `tool_called`
- **值格式**：MCP 工具名称
- **判定**：执行过程中必须调用了该工具
- **示例**：`{ "type": "tool_called", "value": "query_bill" }`
- **适用**：验证核心工具被正确触发

### `tool_not_called`
- **值格式**：MCP 工具名称
- **判定**：执行过程中不得调用该工具
- **示例**：`{ "type": "tool_not_called", "value": "cancel_service" }`
- **适用**：验证确认前不会执行不可逆操作

### `tool_called_before`
- **值格式**：`"toolA, toolB"`（逗号分隔的两个工具名）
- **判定**：toolA 的调用时间必须早于 toolB
- **示例**：`{ "type": "tool_called_before", "value": "query_subscriber, cancel_service" }`
- **适用**：验证工具调用顺序（先查询再操作）

### `tool_called_any_of`
- **值格式**：`"tool1, tool2, ..."`（逗号分隔的工具名列表）
- **判定**：至少调用了其中一个工具
- **示例**：`{ "type": "tool_called_any_of", "value": "query_bill, query_subscriber" }`
- **适用**：验证触发了信息查询（具体工具可能因上下文不同而异）

---

## 技能断言

### `skill_loaded`
- **值格式**：技能名称（对应 SKILL.md 的 `name` 字段）
- **判定**：执行过程中加载了该技能
- **示例**：`{ "type": "skill_loaded", "value": "bill-inquiry" }`
- **适用**：验证技能路由正确（分流场景）

---

## 复合断言

### `response_mentions_all`
- **值格式**：`"kw1, kw2, ..."`（逗号分隔的关键词列表）
- **判定**：回复文本必须包含所有关键词
- **示例**：`{ "type": "response_mentions_all", "value": "账单, 金额, 月" }`
- **适用**：验证回复覆盖了多个必要信息点

### `response_mentions_any`
- **值格式**：`"kw1, kw2, ..."`（逗号分隔的关键词列表）
- **判定**：回复文本至少包含一个关键词
- **示例**：`{ "type": "response_mentions_any", "value": "转人工, 人工客服, 客服" }`
- **适用**：验证回复提到了某类信息（允许不同表述）

### `response_has_next_step`
- **值格式**：忽略（传空字符串或任意值）
- **判定**：回复文本包含下一步引导（检测"您可以"、"建议"、"接下来"等引导词）
- **示例**：`{ "type": "response_has_next_step", "value": "" }`
- **适用**：验证回复不是"死胡同"，有后续引导
