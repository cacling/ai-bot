---
paths:
  - "backend/src/**"
---
<!-- auto-generated on 2026-03-22 from standards.md -->

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
- **不要**在 runner.ts 中新增直接 DB 工具注入（DB Binding 已移除）
- **不要**使用 `mcpResources` 表新增数据，应使用 `connectors` 表
- MCP Server = 业务域稳定边界（防腐层），内部通过 HTTP 调用 mock_apis (demo backend)
- Runner 中的 API 工具路由由 `TOOL_ROUTING_MODE` 环境变量控制（`hybrid` → `mcp_only`）

