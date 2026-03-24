---
paths:
  - "mcp_servers/**"
---
<!-- auto-generated on 2026-03-24 from standards.md -->

# MCP 工具编码规则

### MCP 工具约定

> 术语参考：`docs/glossary.md`

MCP Server 和 Tool 属于 **MCP 协议层**：
- MCP Server = 业务域稳定 API 边界（防腐层），按未来真实系统域划分
- Tool = 契约（name + inputSchema + outputSchema + annotations）
- SQLite / mock_apis / scripts = demo backend 二级实现路径，属于 **Backend Systems 层**
- Connector = 当前 demo backend target（将来替换为真实系统 URL + auth）
- MCP Resource = 通过 `resources/list` 暴露的 URI 标识上下文数据（不是 DB/API 连接）

- 入参使用 Zod schema 做运行时校验
- handler 中**不抛异常**，始终返回结构化结果 `{ content: [{ type: "text", text: JSON.stringify(result) }] }`
- 失败时返回 `{ success: false, message: '...' }` 或 `{ found: false }`
- 动作类工具（创建/修改/删除）应接受可选治理字段：`operator`, `reason`, `traceId`, `idempotencyKey`
- Tool annotations 标注语义属性：`readOnlyHint`, `idempotentHint`, `openWorldHint`

- **不要**在 MCP 工具 handler 中抛出异常，始终返回结构化结果
- **不要**在 Tool 契约层（mcp_tools 表）存放实现配置，实现配置放 tool_implementations 表

