<!-- auto-generated on 2026-03-24 from standards.md -->

# 通用编码规则

### 通用命名约定

| 场景 | 风格 | 示例 |
|------|------|------|
| 函数、变量、参数 | camelCase | `sessionStartTs`、`checkCompliance()` |
| 常量 | UPPER_SNAKE | `LOG_DIR`、`CHUNK_SIZE`、`DEFAULT_CHANNELS` |
| 文件名 | kebab-case | `chat-ws.ts`、`emotion-analyzer.ts` |

### 通用导入顺序

```typescript
// 1. 外部包
import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { type CoreMessage } from 'ai';

// 2. 本地模块
import { db } from '../db';
import { messages, sessions } from '../db/schema';
import { logger } from '../services/logger';
```

- 类型导入使用 `import { type Xxx }` 语法
- Schema 统一从 `db/schema`（即 `schema/index.ts`）导入

### 通用 TypeScript 约定

- `strict: true` 已启用，所有可选值显式处理（`??`、`?.`、`| null`）
- 对象结构用 `interface`，联合类型和工具类型用 `type`
- 字面量约束用 `as const`：`{ source: 'user' as const }`
- 泛型配置用 `Record<string, T>`

### 通用国际化

所有面向用户的字符串使用 `{ zh: '中文', en: 'English' }` 双语对象，通过 `lang` 参数选择。

### 三层架构术语（必读：`docs/glossary.md`）

本项目采用严格 MCP 对齐的三层架构：

| 层级 | 核心概念 | 说明 |
|------|---------|------|
| Skill 编排层 | Skill, Tool Call Plan, Execution Trace | 平台自有，不属于 MCP |
| MCP 协议层 | MCP Server, MCP Tool, MCP Resource, MCP Prompt | 严格对应 MCP 官方语义 |
| Backend Systems 层 | mock_apis (demo) / 真实系统 (prod) | MCP Server 通过 HTTP 调用 |

- **不要**把 DB/API 连接叫做"资源"或 `MCP Resource`，应叫 `Connector`
- **不要**把实现方式（脚本/DB/API）当成 Tool 的身份，Tool 身份是契约
- **不要**在 Skill 层暴露 SQL、表名、API URL 等实现细节

- **不要**在源码中硬编码 API Key、连接串等凭证
- **不要**修改 `seed.ts` 中已有测试数据的结构（可追加新数据）

