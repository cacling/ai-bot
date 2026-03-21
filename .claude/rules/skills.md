---
paths:
  - "backend/skills/**"
---
<!-- auto-generated on 2026-03-21 from standards.md -->

# Skill 编写规则

### Skill 编写约定

- 目录名 kebab-case：`bill-inquiry`、`fault-diagnosis`
- 必须包含 `SKILL.md`，可选 `references/`、`scripts/`
- Frontmatter 必须包含 `name`、`channels` 字段
- 状态图中 `<<choice>>` 节点必须覆盖所有分支路径
- 工具调用节点用 `%% tool:<name>` 标记，分支节点用 `%% branch:<name>` 标记

- **不要**在 SKILL.md 状态图的 `<<choice>>` 节点中遗漏任何分支路径
