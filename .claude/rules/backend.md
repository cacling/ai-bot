---
paths:
  - "backend/src/**"
---
<!-- auto-generated on 2026-03-21 from standards.md -->

# 后端编码规则

### 后端命名约定

| 场景 | 风格 | 示例 |
|------|------|------|
| 数据库列名 | snake_case | `plan_id`、`created_at`、`data_total_gb` |
| WS 事件类型 | snake_case 字符串 | `'emotion_update'`、`'skill_diagram_update'` |
| 卡片 ID | snake_case 字符串 | `'user_detail'`、`'outbound_task'` |

### 后端导出风格

| 模块类型 | 导出方式 |
|---------|---------|
| 路由模块（Hono 实例） | `export default router` |
| 服务/工具函数 | `export const logger = { ... }` / `export function xxx()` |

### 后端日志规范

```typescript
// 统一三参数格式：(模块名, 动作, 元数据?)
logger.info('chat-ws', 'connected', { phone, session: sessionId });
logger.warn('chat-ws', 'compliance_blocked', { session: sessionId, keywords: [...] });
logger.error('chat-ws', 'agent_error', { session: sessionId, error: String(err) });
```

### 后端错误处理

| 场景 | 处理方式 |
|------|---------|
| 非关键 I/O（WS 发送、翻译） | 静默 catch，不阻塞主流程 |
| 关键业务操作 | `logger.error()` + 返回结构化错误响应 |
| API 参数校验 | `return c.json({ error: '...' }, 400)` |

- **不要**直接导入 `schema/business.ts` 或 `schema/platform.ts`，统一从 `schema/index.ts` 导入
- **不要**在不可逆操作（退订、删除）前跳过用户确认步骤
- **不要**阻塞语音主音频流程做同步分析（情感分析、Handoff 分析必须异步）

### 三层架构约定（严格 MCP 对齐）

参考 `docs/glossary.md`。

| 层级 | 数据表 | 说明 |
|------|--------|------|
| Skill 编排层 | `skill_registry`, `skill_tool_bindings` | Skill 只依赖 Tool Contract |
| MCP 协议层 | `mcp_servers`, `mcp_tools`, `mcp_prompts` | 严格对应 MCP 官方语义 |
| 本地实现层 | `tool_implementations`, `connectors` | 不暴露给 Skill |

- 新增动作类 Tool 必须接受治理字段：`operator`, `reason`, `traceId`, `idempotencyKey`
- `mcp_resources` 表已废弃，新连接依赖使用 `connectors` 表
- MCP Server = 业务域稳定 API 边界（防腐层），SQLite/mock_apis/scripts = 二级实现路径
- MCP Server 内部直查 SQLite 是合理的（demo backend 实现），但 **不要** 从 UI 配 SQL 创建新工具
- Runner 中的 API 工具路由由 `TOOL_ROUTING_MODE` 环境变量控制（`hybrid` 默认 → `mcp_only` 目标态）
- **不要**在 runner.ts 中新增直接 DB 工具注入（DB Binding 已移除）
- **不要**使用 `mcpResources` 表新增数据，应使用 `connectors` 表

