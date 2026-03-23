# Telecom Team Standards

> 团队级工作流规范。不可妥协的原则见 `.specify/memory/constitution.md`。

---

## 1. Performance Standards

### 响应延迟目标

| 场景 | 目标 | 模型基线 |
|------|------|---------|
| 账单查询（Skill + MCP 并行） | ≤ 5s | Step-3.5-Flash ~4s |
| 套餐咨询（多工具并行） | ≤ 5s | Step-3.5-Flash ~4-5s |
| 业务退订（串行含确认） | ≤ 8s | Step-3.5-Flash ~6-8s |
| 故障诊断（串行多步） | ≤ 8s | Step-3.5-Flash ~5-7s |
| 合规关键词匹配 | < 1ms | AC 自动机 |
| LLM TTFB | ≤ 1s | Step-3.5-Flash ~0.5s |

### 资源限制

| 控制项 | 值 |
|--------|-----|
| Agent 执行总超时 | 180 秒 |
| ReAct 最大步数 | 10 步 |
| 语音 VAD 静音阈值 | 1500ms |
| Handoff 等待超时 | 20 秒 |

---

## 2. Testing Standards

### 覆盖率要求

| 维度 | 目标 |
|------|------|
| 文件覆盖率 | ≥ 90% |
| 新功能必须有单元测试 | 是 |
| 新 API 必须有 E2E 测试 | 是 |
| 新 Skill 必须有回归测试用例 | 是 |

### 框架与约定

| 层 | 框架 | 位置 |
|----|------|------|
| 后端单元 | Bun 内置（`bun:test`） | `backend/tests/unittest/` |
| 前端单元 | Vitest + @testing-library/react | `frontend/tests/unittest/` |
| E2E | Playwright（系统 Chrome, workers:1, retries:1） | `frontend/tests/e2e/` |
| 回归测试 | 6 种断言类型 | `POST /api/sandbox/:id/regression` |

### 超时策略

| 场景 | 超时 |
|------|------|
| 后端单元测试 | < 1s |
| 前端单元测试 | ~15s |
| E2E 全局默认 | 90s |
| E2E LLM 用例 | 120s–200s |

---

## 3. Development Workflow

### 技能开发流程

```
需求收集 → AI 多轮访谈（skill-creator）
  → 草稿生成（SKILL.md + references）
  → 确认保存 + 自动生成 3-5 条测试用例
  → 沙箱测试（mock 模式）
  → 灰度发布（按手机尾号百分比）
  → 全量发布
```

### 版本管理流程

```
创建版本（create-from）
  → 编辑文件（draft 跟踪，黄点=未保存，绿点=已保存）
  → 保存文件
  → 沙箱测试（useMock: true，42 条预配置 mock 规则）
  → 发布到生产（复制到 biz-skills/，存在 .draft 时拒绝发布）
```

### 自然语言配置流程

```
业务人员描述需求
  → 多轮澄清（POST /api/skill-edit/clarify）
  → LLM 生成 Diff（POST /api/skill-edit/）
  → 确认写入（POST /api/skill-edit/apply，验证 old_fragment 防并发冲突）
```

### 灰度发布规则

- 按手机尾号最后一位与灰度百分比比较
- 例：灰度 30% → 手机尾号 0-2 走灰度，3-9 走生产
- 灰度转正式通过 `POST /api/canary/promote`，含版本记录

---

## 4. Security Review Gate

每个 Plan 必须通过以下安全检查：

- [ ] 是否有新的外部 API 调用？如有，凭证是否通过 .env 注入？
- [ ] 是否引入新的用户输入路径？如有，是否有 Zod 校验？
- [ ] 是否涉及不可逆操作？如有，是否有 Human-in-the-Loop 确认？
- [ ] 是否涉及 PII 数据？如有，是否经过脱敏处理？
- [ ] 是否修改合规相关逻辑？如有，是否触发高风险审批流程？

---

## 5. Task Ordering Rules

每个 User Story 的 tasks 必须按以下顺序组织：

1. **Contract tests**（如有新接口） — 先定义契约
2. **Data model changes** — 数据库 schema 变更
3. **Backend services** — 业务逻辑实现
4. **API endpoints** — 路由 & 控制器
5. **Frontend components** — UI 实现
6. **Integration / E2E tests** — 端到端验证

并行任务标记 `[P]`，仅限操作不同文件且无依赖关系的任务。

---

## 6. RBAC Policy

| 角色 | 级别 | 权限范围 |
|------|------|---------|
| auditor | 1 | 只读查看 |
| reviewer | 2 | 审核变更 |
| config_editor | 3 | 编辑话术、FAQ |
| flow_manager | 4 | 修改流程、版本回滚 |
| admin | 5 | 全部权限 |

开发模式下无认证头时自动放行。生产环境**必须**启用认证。

---

## 7. Compliance Rules

### 三层拦截架构

| 层 | 实现 | 模式 | 拦截行为 |
|----|------|------|---------|
| L1 | AC 自动机关键词匹配 | 同步 < 1ms | banned=硬拦截, warning=软告警, pii=脱敏 |
| L2 | Agent 输出管道拦截 | 同步（文字）/ 异步（语音） | 文字拦截重写，语音异步告警 |
| L3 | 坐席发言监控 | 同步拦截 | banned→阻止发送, warning→告警放行 |

### 高风险变更自动检测

以下模式的变更自动触发审批流程：
- 转接条件变更（`transfer_to_human`）
- 催收相关语言（催收、还款、逾期）
- 工具权限变更
- 合规关键词（banned、warning）

---

## 8. 编码规范

<!-- scope: general -->
### 通用命名约定

| 场景 | 风格 | 示例 |
|------|------|------|
| 函数、变量、参数 | camelCase | `sessionStartTs`、`checkCompliance()` |
| 常量 | UPPER_SNAKE | `LOG_DIR`、`CHUNK_SIZE`、`DEFAULT_CHANNELS` |
| 文件名 | kebab-case | `chat-ws.ts`、`emotion-analyzer.ts` |

<!-- scope: general -->
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

<!-- scope: general -->
### 通用 TypeScript 约定

- `strict: true` 已启用，所有可选值显式处理（`??`、`?.`、`| null`）
- 对象结构用 `interface`，联合类型和工具类型用 `type`
- 字面量约束用 `as const`：`{ source: 'user' as const }`
- 泛型配置用 `Record<string, T>`

<!-- scope: general -->
### 通用国际化

所有面向用户的字符串使用 `{ zh: '中文', en: 'English' }` 双语对象，通过 `lang` 参数选择。

<!-- scope: general -->
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

<!-- scope: backend -->
### 后端命名约定

| 场景 | 风格 | 示例 |
|------|------|------|
| 数据库列名 | snake_case | `plan_id`、`created_at`、`data_total_gb` |
| WS 事件类型 | snake_case 字符串 | `'emotion_update'`、`'skill_diagram_update'` |
| 卡片 ID | snake_case 字符串 | `'user_detail'`、`'outbound_task'` |

<!-- scope: backend -->
### 后端导出风格

| 模块类型 | 导出方式 |
|---------|---------|
| 路由模块（Hono 实例） | `export default router` |
| 服务/工具函数 | `export const logger = { ... }` / `export function xxx()` |

<!-- scope: backend -->
### 后端日志规范

```typescript
// 统一三参数格式：(模块名, 动作, 元数据?)
logger.info('chat-ws', 'connected', { phone, session: sessionId });
logger.warn('chat-ws', 'compliance_blocked', { session: sessionId, keywords: [...] });
logger.error('chat-ws', 'agent_error', { session: sessionId, error: String(err) });
```

<!-- scope: backend -->
### 后端错误处理

| 场景 | 处理方式 |
|------|---------|
| 非关键 I/O（WS 发送、翻译） | 静默 catch，不阻塞主流程 |
| 关键业务操作 | `logger.error()` + 返回结构化错误响应 |
| API 参数校验 | `return c.json({ error: '...' }, 400)` |

<!-- scope: frontend -->
### 前端命名约定

| 场景 | 风格 | 示例 |
|------|------|------|
| React 组件 | PascalCase | `EmotionContent`、`CardPanel` |
| 接口 | PascalCase | `EmotionData`、`HandoffContext` |

<!-- scope: frontend -->
### 前端导出风格

| 模块类型 | 导出方式 |
|---------|---------|
| React 组件 | `export const XxxContent = memo(function XxxContent(...) { ... })` |
| API 辅助函数 | `export async function fetchXxx()` |

<!-- scope: frontend -->
### 前端 UI 组件规范

- **组件库**：统一使用 shadcn/ui（`@/components/ui/`），禁止使用原生 HTML 表单元素（`<button>`、`<input>`、`<select>`、`<textarea>`、`<table>` 等）
- **配色**：统一使用 shadcn 语义色变量（`text-primary`、`bg-destructive`、`border-border` 等），禁止硬编码 Tailwind 色值（如 `text-red-500`、`bg-blue-600`）
- **例外**：数据可视化（如情绪渐变条）可保留具体色值
- **路径别名**：组件导入使用 `@/components/ui/xxx`（`@/` 指向 `src/`）
- **已安装组件**：Button, Input, Textarea, Select, Checkbox, RadioGroup, Label, Badge, Card, Table, Tabs, Dialog, Alert, Separator

<!-- scope: mcp -->
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

<!-- scope: skills -->
### Skill 编写约定

> 术语参考：`docs/glossary.md`

Skill 属于 **Skill 编排层**（平台自有），不属于 MCP 协议：
- Skill 只依赖 Tool Contract（名称 + 输入/输出 schema）
- Skill 不感知 Tool 的实现方式（脚本/DB/API）
- Skill 不感知 Connector（DB 连接、API URL）
- Skill 通过 Tool Call Plan 显式声明调用哪些 Tool

- 目录名 kebab-case：`bill-inquiry`、`fault-diagnosis`
- 必须包含 `SKILL.md`，可选 `references/`、`scripts/`
- Frontmatter 必须包含 `name`、`channels` 字段
- 状态图中 `<<choice>>` 节点必须覆盖所有分支路径
- 工具调用节点用 `%% tool:<name>` 标记，分支节点用 `%% branch:<name>` 标记

---

## 9. 禁止事项

<!-- scope: general -->
- **不要**在源码中硬编码 API Key、连接串等凭证
- **不要**修改 `seed.ts` 中已有测试数据的结构（可追加新数据）

<!-- scope: backend -->
- **不要**直接导入 `schema/business.ts` 或 `schema/platform.ts`，统一从 `schema/index.ts` 导入
- **不要**在不可逆操作（退订、删除）前跳过用户确认步骤
- **不要**阻塞语音主音频流程做同步分析（情感分析、Handoff 分析必须异步）
- **不要**在 runner.ts 中新增直接 DB 工具注入（DB Binding 已移除）
- **不要**使用 `mcpResources` 表新增数据，应使用 `connectors` 表
- MCP Server = 业务域稳定边界（防腐层），内部通过 HTTP 调用 mock_apis (demo backend)
- Runner 中的 API 工具路由由 `TOOL_ROUTING_MODE` 环境变量控制（`hybrid` → `mcp_only`）

<!-- scope: mcp -->
- **不要**在 MCP 工具 handler 中抛出异常，始终返回结构化结果
- **不要**在 Tool 契约层（mcp_tools 表）存放实现配置，实现配置放 tool_implementations 表

<!-- scope: frontend -->
- **不要**在前端组件中直接调用后端 URL，统一通过 `api.ts` 辅助函数

<!-- scope: skills -->
- **不要**在 SKILL.md 状态图的 `<<choice>>` 节点中遗漏任何分支路径
- **不要**在 SKILL.md 中暴露 Tool 的实现细节（DB 表名、API 路径等）
