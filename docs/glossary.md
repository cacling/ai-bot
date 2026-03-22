# 项目术语表（严格 MCP 对齐版）

本文档是全项目统一词表。所有代码、UI、文档必须遵循此处定义，不得混用旧术语。

---

## 三层架构

| 层级 | 说明 | 是否 MCP 官方概念 |
|------|------|------------------|
| **Skill 编排层** | 平台自有的 SOP / 规则 / 调用编排资产 | 否 |
| **MCP 协议层** | Server / Tool / Resource / Prompt | 是 |
| **本地实现层** | Tool Implementation / Connector | 否 |

---

## 核心术语

### Skill（技能）
- **定义**：平台自有的业务编排与知识资产
- **包含**：SOP（状态图）、规则、references、Tool Call Plan、参数映射
- **不包含**：SQL、表名、API URL、handler 路径等实现细节
- **Skill 只认识 Tool Contract，不认识 Connector**

### Tool Contract（工具契约）
- **定义**：MCP Server 暴露的标准能力契约
- **核心字段**：`name` + `description` + `inputSchema` + `outputSchema` + `annotations`
- **UI 名称**：Tool Contracts（原 Tool Studio）
- **Tool = 契约，脚本/DB/API = Tool 的服务端实现方式**

### Tool Implementation（工具实现）
- **定义**：Tool Contract 的具体实现方式
- **adapter_type**：`script` / `db_binding` / `api_proxy`
- **只有本地托管工具才需要 Implementation 配置**

### MCP Server
- **定义**：真正说 MCP 协议的服务端点
- **必须**：支持 `tools/list` / `tools/call`
- **可选**：支持 `resources/list` / `resources/read`、`prompts/list` / `prompts/get`
- **不是**：业务分组或逻辑容器

### MCP Resource（MCP 资源）
- **定义**：MCP 官方的 URI 标识上下文数据
- **来源**：通过 `resources/list` / `resources/read` 从 MCP Server 发现
- **不是**：DB 连接、API endpoint、内部服务地址

### MCP Prompt（MCP 提示词模板）
- **定义**：MCP 官方的可参数化提示词模板
- **来源**：通过 `prompts/list` / `prompts/get` 从 MCP Server 发现

### Connector（连接器）
- **定义**：DB / API / Remote MCP / Cache / Queue 等后端连接依赖
- **只服务于**：本地 Adapter MCP Server 的内部实现
- **不暴露给**：Skill 层
- **不冒充**：MCP Resource

### Execution Trace（执行链路）
- **定义**：Skill 运行时的工具调用链展示
- **展示**：命中 Skill → 加载 references → tools/call(arguments) → 结果 → 最终输出

### Mock Scenario（Mock 场景）
- **定义**：Tool 的模拟测试场景
- **包含**：匹配条件 + 模拟返回

---

## 禁用术语

以下表述在代码和 UI 中**不得继续使用**：

| 禁用说法 | 正确说法 |
|----------|---------|
| "资源"指 DB/API 连接 | Connector / 连接器 |
| "脚本工具" / "DB 工具" / "API 工具" | Tool（由脚本/DB/API 实现） |
| "MCP Server"指业务分组 | MCP Server 只指真实协议端点 |
| "Tool 就是实现方式" | Tool = 契约，实现方式在 Implementation 层 |
| `impl_type` 作为 Tool 身份 | `adapter_type` 作为 Implementation 属性 |
| `execution_config` 放在 Tool 表 | `config` 放在 `tool_implementations` 表 |

---

## 数据模型术语映射

| 旧表/字段 | 新去向 |
|-----------|--------|
| `mcp_resources`（DB/API/remote） | → `connectors` |
| `mcp_tools.execution_config` | → `tool_implementations.config` |
| `mcp_tools.impl_type` | → `tool_implementations.adapter_type` |
| `mcp_tools.handler_key` | → `tool_implementations.handler_key` |
| `skill_registry.tool_names`（JSON） | → `skill_tool_bindings` |
| discover 到的 MCP URI resources | → `mcp_resources`（新语义） |
| discover 到的 MCP prompts | → `mcp_prompts` |

---

## 四层参数设计

动作类 Tool（创建/修改/删除/提交）的入参应包含 4 层：

| 层级 | 字段示例 | 来源 |
|------|---------|------|
| 业务参数 | `phone`, `service_id`, `month` | Skill / LLM |
| 查询控制 | `fields`, `page`, `pageSize`, `dryRun` | Skill / LLM |
| 运行上下文 | `tenantId`, `locale`, `channel`, `sessionId` | 平台自动注入 |
| 治理审计 | `traceId`, `operator`, `reason`, `idempotencyKey` | 平台自动注入 |

动作类 Tool 必带：`operator` + `reason` + `traceId` + `idempotencyKey`。
