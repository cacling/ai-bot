---
paths:
  - "backend/skills/**"
---
<!-- auto-generated on 2026-04-01 from standards.md -->

# Skill 编写规则

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

- **不要**在 SKILL.md 状态图的 `<<choice>>` 节点中遗漏任何分支路径
- **不要**在 SKILL.md 中暴露 Tool 的实现细节（DB 表名、API 路径等）
