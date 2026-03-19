# 智能电信客服系统 Constitution

> 本文件仅包含**不可妥协的原则**。团队级工作流规范见 `.specify/presets/telecom-team/`，代码级规则见仓库配置文件。

## Core Principles

### I. 知行分离（Knowledge-Action Separation）

系统核心设计理念：将"领域知识（Skills）"与"执行能力（MCP Tools）"分层设计。

- **Skills（知识层）**：按需懒加载领域知识文档（Markdown），如计费规则、退订政策、套餐详情、故障排查指南
- **MCP Tools（执行层）**：连接外部业务系统，执行查询账单、退订业务、网络诊断等实际操作
- 两层职责严格分离，Skills 不执行操作，MCP Tools 不包含业务逻辑
- 类比：Skills = 员工培训手册，MCP Tools = 员工使用的业务系统

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

## Governance

- Constitution 优先于所有其他开发实践
- 修订 Constitution 必须更新版本号并记录修订日期
- 原则 I-VI 为架构性原则，修改需架构评审
- 原则 VII-XI 为工程治理原则，修改需技术负责人批准

**Version**: 2.0.0 | **Ratified**: 2026-03-19 | **Last Amended**: 2026-03-19
