#!/usr/bin/env bash

# build-claude-md.sh — 从 spec-kit 文档自动编译 CLAUDE.md + .claude/rules/
#
# 用法：bash .specify/scripts/bash/build-claude-md.sh
#
# 输出：
#   1. CLAUDE.md          — 精简版开发指南（项目简介 + 技术栈 + 命令 + 原则 + 文档导航）
#   2. .claude/rules/*.md — 按路径分区的编码规则（从 standards.md 的 <!-- scope: xxx --> 标记提取）
#
# 来源文档：
#   - plan.md          → 项目简介、技术栈、架构定性
#   - quickstart.md    → 关键命令
#   - standards.md     → 编码规范（按 scope 标记拆分到 rules/）
#   - codebase-map.md  → 变更指南、代码模式
#   - constitution.md  → 核心原则摘要

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

PLAN="$REPO_ROOT/.specify/specs/000-baseline/plan.md"
QUICKSTART="$REPO_ROOT/.specify/specs/000-baseline/quickstart.md"
STANDARDS="$REPO_ROOT/.specify/presets/telecom-team/templates/standards.md"
CODEBASE_MAP="$REPO_ROOT/.specify/specs/000-baseline/codebase-map.md"
CONSTITUTION="$REPO_ROOT/.specify/memory/constitution.md"
OUTPUT="$REPO_ROOT/CLAUDE.md"
RULES_DIR="$REPO_ROOT/.claude/rules"

# ── 辅助函数 ─────────────────────────────────────────────────────────────────

extract_section() {
  local file="$1" heading="$2"
  awk -v h="$heading" '
    BEGIN { found=0 }
    /^## / {
      if (found) exit
      if (index($0, h) > 0) { found=1; next }
    }
    found { print }
  ' "$file"
}

# 从 standards.md 提取指定 scope 的内容块
# 按 <!-- scope: xxx --> 标记分割，收集属于该 scope 的所有行
extract_scope() {
  local file="$1" scope="$2"
  awk -v s="$scope" '
    BEGIN { active=0 }
    /^<!-- scope: / {
      if (index($0, "scope: " s) > 0) { active=1 }
      else { active=0 }
      next
    }
    /^---$/ { active=0; next }
    /^## [0-9]/ { active=0; next }
    active { print }
  ' "$file"
}

# ══════════════════════════════════════════════════════════════════════════════
# 第一部分：生成 .claude/rules/
# ══════════════════════════════════════════════════════════════════════════════

mkdir -p "$RULES_DIR"

DATE="$(date +%Y-%m-%d)"
HEADER_NOTE="<!-- auto-generated on ${DATE} from standards.md -->"

# ── rules/general.md（无 paths，始终加载）────────────────────────────────────

cat > "$RULES_DIR/general.md" << EOF
$HEADER_NOTE

# 通用编码规则

EOF
extract_scope "$STANDARDS" "general" >> "$RULES_DIR/general.md"

# ── rules/backend.md ─────────────────────────────────────────────────────────

cat > "$RULES_DIR/backend.md" << EOF
---
paths:
  - "backend/src/**"
---
$HEADER_NOTE

# 后端编码规则

EOF
extract_scope "$STANDARDS" "backend" >> "$RULES_DIR/backend.md"

# ── rules/frontend.md ────────────────────────────────────────────────────────

cat > "$RULES_DIR/frontend.md" << EOF
---
paths:
  - "frontend/src/**"
---
$HEADER_NOTE

# 前端编码规则

EOF
extract_scope "$STANDARDS" "frontend" >> "$RULES_DIR/frontend.md"

# ── rules/mcp.md ─────────────────────────────────────────────────────────────

cat > "$RULES_DIR/mcp.md" << EOF
---
paths:
  - "mcp_servers/**"
---
$HEADER_NOTE

# MCP 工具编码规则

EOF
extract_scope "$STANDARDS" "mcp" >> "$RULES_DIR/mcp.md"

# ── rules/skills.md ──────────────────────────────────────────────────────────

cat > "$RULES_DIR/skills.md" << EOF
---
paths:
  - "backend/skills/**"
---
$HEADER_NOTE

# Skill 编写规则

EOF
extract_scope "$STANDARDS" "skills" >> "$RULES_DIR/skills.md"

# ══════════════════════════════════════════════════════════════════════════════
# 第二部分：生成 CLAUDE.md（精简版，编码规范已拆到 rules/）
# ══════════════════════════════════════════════════════════════════════════════

cat > "$OUTPUT" << 'HEADER'
# AI-Bot 开发指南

> **本文件由 `.specify/scripts/bash/build-claude-md.sh` 自动生成，请勿手动编辑。**
> 修改内容请更新 spec-kit 源文档后重新运行脚本（或 `/sync-docs`）。
> 编码规范按路径分区在 `.claude/rules/` 中，编辑对应目录文件时自动加载。

HEADER

echo "**自动生成于**: $DATE" >> "$OUTPUT"
echo "" >> "$OUTPUT"

# ── 1. 项目简介 ──────────────────────────────────────────────────────────────

cat >> "$OUTPUT" << 'EOF'
## 项目简介

基于 Vercel AI SDK 的智能电信客服系统，Agent 名为"小通"。前后端分离单体 + 事件驱动混合 + MCP 微服务化工具层。

- **知识层（Skills）**：Markdown 文件，按需懒加载，热更新无需重启
- **执行层（MCP Tools）**：5 个独立 MCP Server（:18003-18007），StreamableHTTP stateless
- **交互模式**：文字客服（/ws/chat）、语音客服（/ws/voice）、外呼（/ws/outbound）、坐席工作台（/ws/agent）

EOF

# ── 2. 技术栈 ────────────────────────────────────────────────────────────────

cat >> "$OUTPUT" << 'EOF'
## 技术栈

| 层 | 技术 |
|---|------|
| 后端 | Hono + Bun（TypeScript strict） |
| 前端 | React 18 + Vite + Tailwind CSS |
| AI | Vercel AI SDK（generateText + tool, maxSteps=10） |
| LLM | SiliconFlow（文字）、GLM-Realtime（语音） |
| MCP | @modelcontextprotocol/sdk（StreamableHTTP） |
| DB | SQLite + Drizzle ORM（WAL 模式，30 张表） |
| 测试 | Bun:test（后端）、Vitest（前端）、Playwright（E2E） |

EOF

# ── 3. 关键命令 ──────────────────────────────────────────────────────────────

cat >> "$OUTPUT" << 'EOF'
## 关键命令

```bash
./start.sh              # 一键启动全部服务（MCP → 后端 → 前端）
./start.sh --reset      # 重置 DB + 重新 seed + 启动
./stop.sh               # 停止全部服务

cd backend && bun test tests/unittest/                # 后端单元测试
cd frontend/tests/unittest && npx vitest run          # 前端单元测试
cd frontend/tests/e2e && npx playwright test          # E2E 测试（需先启动服务）

cd backend && bunx drizzle-kit push    # 应用 Schema 变更
cd backend && bun run db:seed          # 写入种子数据
cd backend && bunx drizzle-kit studio  # 数据库可视化管理
```

EOF

# ── 4. 核心原则 ──────────────────────────────────────────────────────────────

cat >> "$OUTPUT" << 'EOF'
## 核心原则（Constitution 摘要）

1. **知行分离**：Skills（知识）与 MCP Tools（执行）严格分层，不混合
2. **状态图驱动**：SKILL.md 中的 Mermaid 状态图是流程逻辑的唯一事实来源
3. **并行优先**：同一步骤中 Skill 加载与 MCP 查询必须并行调用
4. **安全操作确认**：不可逆操作（退订等）必须在执行前向用户确认
5. **热更新**：Skills 修改后无需重启，下次请求自动加载
6. **渠道路由**：channels 字段决定技能被哪些 bot 加载
7. **密钥零硬编码**：凭证通过 .env 注入，不出现在源码中
8. **接口向后兼容**：WS/REST/MCP 接口变更不破坏现有客户端
9. **数据可回滚**：Schema 变更和 Skill 发布必须可回滚
10. **审计留痕**：版本发布、退订、审批必须有审计记录
11. **复杂度论证**：新增抽象层/表/进程时必须记录必要性和被否决的简单方案

> 完整内容见 `.specify/memory/constitution.md`

EOF

# ── 5. 变更指南（从 codebase-map.md 提取）────────────────────────────────────

echo "## 变更指南" >> "$OUTPUT"
echo "" >> "$OUTPUT"
extract_section "$CODEBASE_MAP" "变更影响指南" >> "$OUTPUT"
echo "" >> "$OUTPUT"

# ── 6. 代码模式范例（从 codebase-map.md 提取）────────────────────────────────

echo "## 代码模式范例" >> "$OUTPUT"
echo "" >> "$OUTPUT"
extract_section "$CODEBASE_MAP" "代码模式范例" >> "$OUTPUT"
echo "" >> "$OUTPUT"

# ── 7. 文档导航 ──────────────────────────────────────────────────────────────

cat >> "$OUTPUT" << 'EOF'
## 文档导航

| 文档 | 职责 | 何时查阅 |
|------|------|---------|
| `.specify/specs/000-baseline/spec.md` | 用户故事、功能需求、成功标准 | 需求评审、验收 |
| `.specify/specs/000-baseline/plan.md` | 架构、调用链路、非功能需求 | 技术方案、架构决策 |
| `.specify/specs/000-baseline/feature-map.md` | 功能特性树（7 模块 ~120 节点） | 功能全景 |
| `.specify/specs/000-baseline/codebase-map.md` | 文件树 + 职责 + 变更指南 | 改代码前查文件 |
| `.specify/specs/000-baseline/quickstart.md` | 部署、调试、测试、FAQ | 环境搭建、日常开发 |
| `.specify/specs/000-baseline/data-model.md` | 实体定义、Schema、关系 | 数据库变更 |
| `.specify/specs/000-baseline/contracts/apis.md` | REST/WS/MCP 接口规范 | 接口开发、联调 |
| `.specify/specs/000-baseline/contracts/components.md` | 32 个组件实现详解 | 深入理解实现 |
| `.specify/presets/telecom-team/templates/standards.md` | 团队标准（性能/测试/流程/编码） | 编码规范参考 |
| `.specify/memory/constitution.md` | 11 条不可妥协原则 | 架构决策、评审 |

## 编码规则分区

编码规范按路径自动加载（`.claude/rules/`），编辑对应目录的文件时 Claude 会自动读取相关规则：

| 规则文件 | 适用路径 | 内容 |
|---------|---------|------|
| `rules/general.md` | 全局（始终加载） | 通用命名、导入顺序、TypeScript 约定、国际化 |
| `rules/backend.md` | `backend/src/**` | 后端命名、导出、日志、错误处理 |
| `rules/frontend.md` | `frontend/src/**` | 前端命名、导出、组件结构 |
| `rules/mcp.md` | `mcp_servers/**` | MCP 工具定义、Zod 校验、返回格式 |
| `rules/skills.md` | `backend/skills/**` | Skill 目录结构、SKILL.md 编写、状态图标记 |
EOF

# ══════════════════════════════════════════════════════════════════════════════
# 输出摘要
# ══════════════════════════════════════════════════════════════════════════════

echo ""
echo "✓ CLAUDE.md 已生成: $OUTPUT"
echo "  行数: $(wc -l < "$OUTPUT" | tr -d ' ')"
echo ""
echo "✓ .claude/rules/ 已生成:"
for f in "$RULES_DIR"/*.md; do
  echo "  $(basename "$f"): $(wc -l < "$f" | tr -d ' ') 行"
done
echo ""
echo "  来源: standards.md (scope 标记) → rules/, plan/quickstart/codebase-map/constitution → CLAUDE.md"
