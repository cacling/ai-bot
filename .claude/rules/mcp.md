---
paths:
  - "mcp_servers/**"
---

# MCP 工具编码规则

> 术语参考：`docs/glossary.md`

### 三层架构定位

MCP Server 和 Tool 属于 **MCP 协议层**：
- MCP Server = 业务域稳定 API 边界（防腐层），按未来真实系统域划分
- Tool = 契约（name + inputSchema + outputSchema + annotations）
- SQLite / mock_apis / scripts = demo backend 二级实现路径，属于 **Backend Systems 层**
- Connector = 当前 demo backend target（将来替换为真实系统 URL + auth）
- MCP Resource = 通过 `resources/list` 暴露的 URI 标识上下文数据（不是 DB/API 连接）

### MCP 工具约定

- 入参使用 Zod schema 做运行时校验
- handler 中**不抛异常**，始终返回结构化结果 `{ content: [{ type: "text", text: JSON.stringify(result) }] }`
- 失败时返回 `{ success: false, message: '...' }` 或 `{ found: false }`

### 动作类工具治理字段

对有副作用的工具（创建/修改/删除/提交），入参 schema 应接受以下可选治理字段：
- `operator`：触发者标识（skill ID / 人工坐席 ID）
- `reason`：操作原因
- `traceId`：链路追踪 ID
- `idempotencyKey`：幂等键

handler 中应记录这些字段用于审计，即使调用方未传入也不应报错。

### Tool annotations 标注

在 Tool 注册时通过 annotations 声明语义属性：
- `readOnlyHint`：是否只读（查询类 true，动作类 false）
- `idempotentHint`：是否幂等
- `openWorldHint`：是否依赖外部世界状态

- **不要**在 MCP 工具 handler 中抛出异常，始终返回结构化结果
- **不要**在 Tool 契约层（mcp_tools 表）存放实现配置，实现配置放 tool_implementations 表

