# 智能电信客服系统 Constitution

> 本文件仅包含**不可妥协的原则**。团队级工作流规范见 `.specify/presets/telecom-team/`，代码级规则见仓库配置文件。

## Core Principles

### I. 知行分离与职责边界（Knowledge-Action Separation & Responsibility Boundary）

系统核心设计理念：将"领域知识（Skills）"与"执行能力（MCP Tools）"分层设计，Agent 和 MCP Server 各司其职。

- **Skills（知识层）**：按需懒加载领域知识文档（Markdown），如计费规则、退订政策、套餐详情、故障排查指南
- **MCP Tools（执行层）**：连接外部业务系统，执行查询账单、退订业务、网络诊断等实际操作
- 两层职责严格分离，Skills 不执行操作，MCP Tools 不包含对话逻辑
- 类比：Skills = 员工培训手册，MCP Tools = 员工使用的业务系统

#### Agent 侧职责（LLM + Runner）

以下职责**必须**由 Agent 侧承担，不得下沉到 MCP Server：

- 用户意图理解与 Skill 选择
- SOP 流程推进（按状态图逐步执行）
- 多工具编排（先查订户再查账单、并行调用等）
- 何时追问、何时转人工的决策
- 最终回复生成（把工具返回的结构化数据说成人话）

#### MCP Server 侧职责

以下职责**应该**由 MCP Server 内部完成，不得在 Agent 侧或中间层实现：

- 与某个能力强绑定的领域规则（欠费分层阈值、PTP 天数校验、静默时段等）
- 数据清洗、聚合、归一化（费用 breakdown、用量比率、转化标签等）
- 固定决策树、诊断逻辑（severity 分级、risk_level 判定）
- 单能力内部推理（如 Text2SQL、异常归因分析）
- 某个后端系统专属的执行逻辑

#### 禁止中间层

- **不得**在 Agent 与 MCP 之间引入"Skill 脚本"等中间编排层来承接 MCP 应返回的数据或规则
- 如果一段逻辑是确定性的、可测试的、不依赖对话上下文的，它属于 MCP Server
- 如果一段逻辑需要理解用户意图或选择下一步行动，它属于 Agent

#### Tool 一等公民，Server 透明

- Agent 调用的是 Tool（如 `query_bill`），不关心 Tool 在哪个 Server 上
- Runner 从 `mcp_servers` 表读取所有启用 Server，merge 全部 tools 到扁平 namespace
- Skill 只声明"我需要哪些 Tool"（`%% tool:xxx`），不声明 Server 归属

#### 控制面与执行面分离

- **Backend = 控制面（Control Plane）**：管理 MCP 配置、discover、mock、RBAC/审计，读写 platform 表
- **MCP Servers = 执行面（Data Plane）**：提供运行时工具执行，读写 business 表
- 前端只访问 backend 的管理 API（`/api/mcp/*`），不直接连接 MCP Server
- Backend 在需要时代理访问 MCP Server（discover、healthcheck）

#### 数据域归属

- **Platform 域（Backend 拥有）**：sessions、messages、users、skill_registry、km_*、mcp_servers、testPersonas、outboundTasks
- **Business 域（MCP Servers 拥有）**：subscribers、plans、bills、value_added_services、subscriber_subscriptions、callback_tasks、device_contexts
- Backend 不直接读写 business 域表，通过 MCP Tool 间接获取业务数据

### II. 状态图驱动（State Diagram as Single Source of Truth）

- 每个 Skill 的 SKILL.md 中包含 Mermaid 状态图，作为流程逻辑的**唯一事实来源**
- 代码层不硬编码业务分支逻辑，所有流程变更通过修改状态图完成
- 状态图支持注解标记：`%% tool:<name>`、`%% ref:<file>`、`%% branch:<name>`
- `<<choice>>` 分支节点必须覆盖所有可能路径（分支完备性要求）

### III. 并行优先（Parallel-First Tool Invocation）

- 同一步骤中，Skill 加载与 MCP 查询**必须并行调用**，禁止拆分为多步
- 减少 LLM round-trip，提升响应速度
- system-prompt.md 中明确约束此行为

### IV. 安全操作确认（Human-in-the-Loop for Irreversible Actions）

- 不可逆操作（如退订增值业务）必须在执行前向用户确认
- Agent 通过 system prompt 约束实现确认流程
- 超出能力范围时引导至人工渠道，不承诺无法完成的操作

### V. 热更新零停机（Hot-Reload Without Restart）

- Skills 文件为静态 Markdown，修改后无需重启任何服务
- Agent 下次处理请求时自动加载最新版本
- 版本管理采用完整目录快照机制，支持 Diff 对比和一键回滚

### VI. 渠道路由（Channel-Based Skill Routing）

- SKILL.md frontmatter 中的 `channels` 字段决定技能被哪些 bot 实例加载
- 标准渠道：`online`（文字客服）、`voice`（语音客服）、`outbound-collection`（外呼催收）、`outbound-marketing`（外呼营销）
- Bot 启动时根据自身渠道标识过滤并加载匹配的技能集

### VII. 密钥零硬编码（Zero Hardcoded Secrets）

- 所有凭证（API Key、数据库连接串、第三方服务密钥）**必须**通过环境变量（`.env`）注入
- 源码中禁止出现任何明文密钥或连接串
- `.env` 文件必须加入 `.gitignore`

### VIII. 公共接口向后兼容（Public Interface Backward Compatibility）

- WebSocket 消息协议、REST API、MCP 工具接口的变更**不得**破坏现有客户端
- 新增字段可以，删除或修改已有字段的语义必须经过版本迁移
- 违反此原则的变更必须在 Complexity Tracking 中论证

### IX. 数据变更可回滚（Reversible Data Changes）

- 数据库 Schema 变更必须可回滚（Drizzle migration 支持 down）
- Skill 发布必须可回滚（版本快照机制保障）
- 灰度发布必须可回滚（DELETE /api/canary 即时生效）

### X. 关键路径审计留痕（Audit Trail for Critical Paths）

- 版本发布、退订操作、审批决策**必须**有审计记录
- 回滚操作本身也必须创建新版本记录，确保审计链完整
- 审计日志只读，不可删除或篡改

### XI. 复杂度必须论证（Complexity Must Be Justified）

- 引入新的抽象层、新的数据库表、新的服务进程时，必须论证必要性
- 必须记录"为什么需要"和"被否决的更简单方案"
- 在 spec/plan 的 Complexity Tracking 表中留痕

### XII. 数据库所有权隔离（Database Ownership Isolation）

- 每个服务只读写自己的数据库，禁止直接读写其他服务的 SQLite 文件
- 跨服务数据访问必须通过 HTTP API（如 km-client.ts → km_service、cdp-client.ts → CDP Service）
- 本地 TTL 缓存 + 后台刷新用于减少 HTTP 调用频率，不阻塞请求路径
- DB 所有权表：km.db → km_service、platform.db → backend、business.db → mock_apis、cdp.db → cdp_service、workorder.db → work_order_service、outbound.db → outbound_service
- 违反示例：backend 直接 `import { db } from '../db'` 读取 km.db 的 skillRegistry 表
- 正确方式：backend 通过 `getSkillRegistry()` 调用 km_service 的 `/api/internal/skills/registry`

### XIII. CDP 客户档案唯一事实来源（CDP as Single Source of Customer Truth）

- CDP Service 是所有客户档案信息的唯一事实来源，其他服务不得自建客户主数据
- CDP 管辖范围：客户身份关联标识、客户渠道偏好、客户接触记录、客户属性、客户历史轨迹、客户画像、客户所属分群、客户免打扰（DND）
- 其他服务需要客户信息时，必须通过 CDP API（`/api/cdp/parties/:id/context`）获取，不得在本地表中冗余存储客户属性
- 允许存储的引用：`party_id`（关联 CDP 主体）、`phone`（业务键，用于事务关联）
- 违反示例：outbound_service 在 ob_tasks 表中存储 `customer_name`、`plan_name` 等客户属性
- 正确方式：outbound_service 只存 `party_id`，运行时从 CDP 拉取客户姓名、套餐等信息

## Governance

- Constitution 优先于所有其他开发实践
- 修订 Constitution 必须更新版本号并记录修订日期
- 原则 I-VI 为架构性原则，修改需架构评审
- 原则 VII-XIII 为工程治理原则，修改需技术负责人批准

**Version**: 5.0.0 | **Ratified**: 2026-03-19 | **Last Amended**: 2026-04-01
