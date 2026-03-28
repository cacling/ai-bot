# V2 方案：删除 MCP 服务 Tab + 补齐 Runtime Bindings + 收紧 Server 管理

## 背景

当前 Tool Runtime 有 5 个 tab：`Overview | Tool Contracts | MCP 服务 | 后端连接 | Execution Records`。

问题：
1. **MCP 服务 tab 与其他 tab 数据全量重叠**，server 不再是用户操作维度
2. **Runtime Bindings 视角缺失**，原始方案规划了但未实现（`tool-runtime-refactoring.md:2915`）
3. **status 模型不一致**，前端定义 `'active' | 'planned'`，seed 用了 `'inactive'`，与 `enabled` + `kind` 语义重叠
4. **Server 删除无保护**，internal server 被删会导致 DB 和 start.sh 脱节

## 目标 Tab 结构

```
Overview | Tool Contracts | Runtime Bindings | 后端连接 | Execution Records
```

- 删除 `MCP 服务` tab
- 新增 `Runtime Bindings` tab（原始方案遗漏项）
- `Overview` 吸收服务来源摘要 + Discover 入口
- Server CRUD 按 kind 收紧权限

---

## Phase 1: Schema 清理（status 字段统一）

### 1A. 删除 mcpServers.status 字段

**理由**：`status` 与 `enabled` + `kind` 完全重叠：
- `status: 'active'` ≡ `enabled: true`
- `status: 'inactive'` ≡ `enabled: false`
- `status: 'planned'` ≡ `kind: 'planned'`

| 文件 | 改动 |
|------|------|
| `packages/shared-db/src/schema/platform.ts:370` | 删除 `status` 列 |
| `backend/src/db/seed.ts` | 所有 server insert 删除 `status` 字段 |
| `backend/src/agent/km/mcp/servers.ts` | GET 列表：删除 `status` 过滤；POST/PUT：不再接受 `status`；health 端点：删除 `status` 返回 |
| `frontend/src/km/mcp/api.ts` | `McpServer` 接口删除 `status` 字段 |
| 前端所有引用 `server.status` | 改为 `server.enabled` + `server.kind` 组合判断 |

### 1B. 前端状态显示映射

```typescript
function serverStatusLabel(server: McpServer): string {
  if (server.kind === 'planned') return '规划中';
  return server.enabled ? '运行中' : '已停用';
}
```

### 验证
```bash
SQLITE_PATH=/tmp/test-v2.db bunx drizzle-kit push --force
SQLITE_PATH=/tmp/test-v2.db bun run db:seed
bun test tests/integration/seed-integrity.test.ts
```

---

## Phase 2: Backend — Server 权限收紧

### 2A. DELETE 按 kind 保护 (`servers.ts`)

```typescript
// DELETE /:id
app.delete('/:id', async (c) => {
  const row = db.select().from(mcpServers).where(eq(mcpServers.id, id)).get();
  if (!row) return c.json({ error: 'Not found' }, 404);
  if (row.kind === 'internal') {
    return c.json({ error: 'Internal servers cannot be deleted (managed by start.sh)' }, 403);
  }
  db.delete(mcpServers).where(eq(mcpServers.id, id)).run();
  return c.json({ ok: true });
});
```

### 2B. PUT 按 kind 限制字段 (`servers.ts`)

- `internal`：只允许修改 `description`、`enabled`（启停）
- `external/planned`：允许修改所有字段（name、url、kind、enabled 等）

### 2C. 新增列表级 Bindings 端点 (`tool-management.ts`)

当前 `GET /:id/implementation` 只返回单个工具的绑定。需要新增：

```
GET /api/mcp/tool-management/bindings
```

返回所有 `tool_implementations JOIN mcp_tools JOIN connectors` 的联表结果：

```typescript
interface RuntimeBindingRow {
  impl_id: string;
  tool_id: string;
  tool_name: string;
  tool_description: string;
  server_name: string;
  server_kind: 'internal' | 'external' | 'planned';
  adapter_type: string;
  connector_id: string | null;
  connector_name: string | null;
  connector_type: string | null;    // 'db' | 'api'
  handler_key: string | null;
  config: string | null;            // executionPolicy JSON
  status: 'active' | 'inactive';
  disabled: boolean;                // from mcp_tools
  mocked: boolean;                  // from mcp_tools
}
```

### 验证
```bash
curl http://localhost:18472/api/mcp/tool-management/bindings | jq '.items | length'
curl -X DELETE http://localhost:18472/api/mcp/servers/mcp-user-info  # 应返回 403
curl -X DELETE http://localhost:18472/api/mcp/servers/mcp-amap       # 应返回 200
```

---

## Phase 3: Frontend — 删除 MCP 服务 Tab

### 3A. McpManagementPage.tsx

- TABS 数组：删除 `{ id: 'servers', ... }`
- 删除 `McpServerList` import 和对应 render
- 删除 `handleBackToServers` 回调
- 新增 `RuntimeBindingsPage` lazy import 和 tab render

```typescript
const TABS = [
  { id: 'overview',   label: 'Overview',          icon: <Activity /> },
  { id: 'tools',      label: 'Tool Contracts',    icon: <Wrench /> },
  { id: 'bindings',   label: 'Runtime Bindings',  icon: <Link2 /> },
  { id: 'connectors', label: '后端连接',           icon: <Plug /> },
  { id: 'records',    label: 'Execution Records', icon: <ScrollText /> },
];
```

### 3B. 删除文件

| 文件 | 原因 |
|------|------|
| `McpServerList.tsx` | Tab 页删除 |
| `McpServerConsole.tsx` | 详情页删除 |
| `McpServerForm.tsx` | 表单迁移为 Overview Dialog |
| `server-console/OverviewModule.tsx` | 子模块删除 |
| `server-console/HealthModule.tsx` | connector 测试在后端连接 tab；discover 迁到 Overview |
| `server-console/ToolSummaryModule.tsx` | 功能在 Tool Contracts + Runtime Bindings 覆盖 |

### 3C. api.ts 清理

- `McpServer.status` 字段删除
- 删除 `McpServerConsole` 特有的组合调用方法（如果有）
- 新增 `listBindings(): Promise<{ items: RuntimeBindingRow[] }>`
- 保留 `listServers`、`createServer`、`updateServer`、`deleteServer`、`discoverTools`、`getServerHealth`

---

## Phase 4: Frontend — 新增 Runtime Bindings Tab

### 4A. 创建 `RuntimeBindingsPage.tsx`

展示 `tool_implementations` 联表结果的全局列表。

**统计卡片**（4 列）：
| 卡片 | 值 |
|------|-----|
| Total Bindings | `items.length` |
| Active | `items.filter(b => b.status === 'active' && !b.disabled)` |
| Unbound | mcpTools 中没有 implementation 的工具数 |
| Misconfigured | adapter 需要 connector 但 connector_id 为空的数 |

**表格列**：
| 列 | 内容 |
|----|------|
| Tool | `tool_name`（font-mono）+ `tool_description`（muted） |
| Server | `server_name` + `kind` badge |
| Adapter | `adapter_type` badge（Script / MCP / API / DB / Mock） |
| Connector | `connector_name` 或 "—" |
| Handler | `handler_key` 或 "—"（仅 script 类型显示） |
| Policy | 从 `config` JSON 解析：timeout / channels / confirm |
| Status | `active` / `inactive` / `disabled` / `mocked` 组合 |

**筛选器**：
- 关键词搜索（tool_name / server_name / connector_name）
- Adapter 类型下拉
- 状态快筛（all / active / unbound / misconfigured）

**行点击**：跳转到 Tool Contracts → McpToolEditor 的 Implementation step

### 4B. 与 Tool Contracts 的关系

`Tool Contracts` = 契约视角（input/output schema、mock 对齐、风险标记）
`Runtime Bindings` = 运行时视角（adapter、connector、policy、handler）

**不重复**：Tool Contracts 不展示 connector/handler/policy 细节；Runtime Bindings 不展示 schema/mock 状态。

---

## Phase 5: Frontend — Overview 吸收服务来源

### 5A. RuntimeOverviewPage.tsx 新增"服务来源"区

在现有 KPI 卡片下方、Adapter/Channel 分布图上方，新增一个"服务来源"section：

```
┌─ 服务来源 ──────────────────────────────── [管理] ────┐
│                                                        │
│  ● user-info-service   internal  运行中  4 tools       │
│  ● business-service    internal  运行中  2 tools       │
│  ● diagnosis-service   internal  运行中  2 tools       │
│  ● outbound-service    internal  运行中  4 tools       │
│  ● account-service     internal  运行中  5 tools       │
│  ○ amap-maps-service   external  未启用  4 tools [Discover] │
│  ○ payment-service     planned   未启用  1 tool        │
│                                                        │
└────────────────────────────────────────────────────────┘
```

**每行展示**：
- 状态点（绿●/灰○）
- Server name（mono）
- `kind` badge
- 启用状态（运行中/未启用）
- Tool 数量
- **操作**：
  - external/planned：`[Discover]` 按钮、点击行弹编辑 Dialog
  - internal：点击行弹只读详情 + 启停开关

### 5B. Server 管理 Dialog（轻量，非 Console）

点击 `[管理]` 或行内操作，弹出 Dialog 而非整页 Console。

**Internal server Dialog**：
- 只读：name、transport、url、tool count
- 可改：description、enabled 开关
- 操作：Discover Tools 按钮

**External/Planned server Dialog**：
- 可改：name、description、url、kind、enabled
- 操作：Discover Tools、删除（带确认）
- 新建：`[管理]` 按钮旁的 `[+]` 入口

### 5C. API 调用

Overview 需要的 API（均已存在）：
- `listServers()` — 获取 server 列表
- `listTools()` — 按 server_id 聚合 tool 数量
- `updateServer()` — 编辑
- `deleteServer()` — 删除（受 kind 保护）
- `discoverTools()` — 工具发现
- `getServerHealth()` — 健康信息（optional，仅展示 last_connected_at）

---

## Phase 6: Tests

### 6A. Backend API tests

| 文件 | 改动 |
|------|------|
| `servers.test.ts` | 新增：DELETE internal 返回 403；删除 `status` 字段引用 |
| `tool-management.test.ts` | 新增：GET /bindings 返回联表结果 |

### 6B. Seed 集成测试

| 文件 | 改动 |
|------|------|
| `seed-integrity.test.ts` | 新增：mcpServers 不含 `status` 列验证（schema 层面） |

### 6C. 前端编译验证

```bash
cd frontend && npx tsc --noEmit  # 0 errors
```

---

## 文件清单

| Phase | 文件 | 操作 | 改动量 |
|-------|------|------|--------|
| 1A | `packages/shared-db/src/schema/platform.ts` | 改 | 小 |
| 1A | `backend/src/db/seed.ts` | 改 | 小 |
| 1A | `backend/src/agent/km/mcp/servers.ts` | 改 | 中 |
| 1A | `frontend/src/km/mcp/api.ts` | 改 | 小 |
| 2A | `backend/src/agent/km/mcp/servers.ts` | 改 | 小 |
| 2C | `backend/src/agent/km/mcp/tool-management.ts` | 改 | 中 |
| 3A | `frontend/src/km/mcp/McpManagementPage.tsx` | 改 | 中 |
| 3B | `frontend/src/km/mcp/McpServerList.tsx` | **删** | — |
| 3B | `frontend/src/km/mcp/McpServerConsole.tsx` | **删** | — |
| 3B | `frontend/src/km/mcp/McpServerForm.tsx` | **删** | — |
| 3B | `frontend/src/km/mcp/server-console/OverviewModule.tsx` | **删** | — |
| 3B | `frontend/src/km/mcp/server-console/HealthModule.tsx` | **删** | — |
| 3B | `frontend/src/km/mcp/server-console/ToolSummaryModule.tsx` | **删** | — |
| 3C | `frontend/src/km/mcp/api.ts` | 改 | 小 |
| 4A | `frontend/src/km/mcp/RuntimeBindingsPage.tsx` | **新** | 大 |
| 5A | `frontend/src/km/mcp/RuntimeOverviewPage.tsx` | 改 | 大 |
| 5B | `frontend/src/km/mcp/ServerManageDialog.tsx` | **新** | 中 |
| 6A | `backend/tests/apitest/.../servers.test.ts` | 改 | 小 |
| 6A | `backend/tests/apitest/.../tool-management.test.ts` | 改 | 小 |
| 6B | `backend/tests/integration/seed-integrity.test.ts` | 改 | 小 |

**共 ~19 个文件**：6 删、2 新、11 改

---

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| 删除 McpServerConsole 后丢失 ToolSummaryModule 的跳转逻辑 | Runtime Bindings 行点击跳转到 McpToolEditor 替代 |
| Overview 服务来源区 API 调用过多（listServers + listTools） | 后端可加一个 `/api/mcp/servers/summary` 聚合端点，一次返回 server + tool count |
| status 字段删除后 drizzle push 需要迁移 | 开发环境 `--reset`；生产需 migration 脚本 |
| internal server 禁止删除后，误创建的 internal 无法清理 | 允许 seed 环境（`NODE_ENV=development`）绕过限制 |

---

## 执行顺序

```
Phase 1 (Schema) → Phase 2 (Backend) → Phase 3+4+5 (Frontend 并行) → Phase 6 (Tests)
```

Phase 3（删 tab）、Phase 4（新 Bindings）、Phase 5（改 Overview）可以并行开发，最后在 McpManagementPage.tsx 中统一集成。
