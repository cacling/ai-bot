---
paths:
  - "mcp_servers/**"
---
<!-- auto-generated on 2026-03-21 from standards.md -->

# MCP 工具编码规则

### MCP 工具约定

- 入参使用 Zod schema 做运行时校验
- handler 中**不抛异常**，始终返回结构化结果 `{ content: [{ type: "text", text: JSON.stringify(result) }] }`
- 失败时返回 `{ success: false, message: '...' }` 或 `{ found: false }`

- **不要**在 MCP 工具 handler 中抛出异常，始终返回结构化结果

