# AI-Bot 开发指南

> **本文件由 `.specify/scripts/bash/build-claude-md.sh` 自动生成，请勿手动编辑。**
> 修改内容请更新 spec-kit 源文档后重新运行脚本（或 `/sync-docs`）。
> 编码规范按路径分区在 `.claude/rules/` 中，编辑对应目录文件时自动加载。

**自动生成于**: 2026-03-21

## 项目简介

基于 Vercel AI SDK 的智能电信客服全栈系统，采用 Skills（知识层）+ MCP Tools（执行层）双层架构，支持文字/语音/坐席工作台三种交互模式。

- **架构风格**：前后端分离单体 + 事件驱动混合 + MCP 微服务化工具层
- **同步策略**：项目摘要、技术栈、基线说明、命令与规则均从 `.specify/` 源文档提取

## 技术栈

**语言/版本**: TypeScript（Bun 后端 / Node.js MCP & 前端）

| 层次 | 技术 |
|------|------|
| 前端 | React 18 + TypeScript + Vite + shadcn/ui + Tailwind CSS |
| 后端 | Hono + Bun |
| AI SDK | Vercel AI SDK（generateText + tool） |
| 文字客服 LLM | SiliconFlow 托管模型（stepfun-ai/Step-3.5-Flash） |
| 语音客服 LLM | 智谱 GLM-Realtime（glm-realtime-air） |
| MCP 协议 | @modelcontextprotocol/sdk（StreamableHTTP） |
| 数据库 | SQLite + Drizzle ORM（WAL 模式，30 张表） |
| 运行时 | Bun（后端）/ Node.js + npm（MCP Server、前端） |

## 当前基线说明

- **认证**：当前仓库默认用于本地开发/演示。管理端 API 使用 `X-User-Id` 做轻量 RBAC；客户侧聊天和语音接口未接入正式生产认证
- **数据库**：`drizzle-kit push` 仅用于本地/演示环境快速同步 schema；生产环境应切换为 PostgreSQL + 版本化 migration
- **浏览器**：文字客服、坐席工作台、知识管理建议使用最新桌面版 Chromium；语音/外呼仅正式支持桌面版 Chromium 最近两个稳定版本
- **覆盖率目标**：团队目标为文件覆盖率 ≥ 90%，但当前仓库尚未在 CI 中强制设置覆盖率阈值

## 关键命令

**启动与停止**

```bash
cd /path/to/ai-bot

# 正常启动（保留用户数据）
./start.sh

# 重置启动（删除 DB + 清理旧版本快照 + 重新 seed）
./start.sh --reset
```
```
start.sh 执行流程：
  1. 清理日志文件和残留端口进程
  2. 检查 bun / node / npm 是否可用
  3. [若 --reset] 删除 DB + 清理旧版本快照 + 重新 seed
  4. 安装依赖
     ├── backend:       bun install --frozen-lockfile
     ├── mcp_servers:   npm install
     └── frontend:      npm install
  5. 初始化 SQLite Schema（本地开发使用 `bunx drizzle-kit push`）
  6. 若数据库为空，自动 seed
  7. 启动服务（依赖顺序：MCP → 后端 → 前端）
     ├── 5 个 MCP Server（:18003-18007）  ← 必须先启动，后端依赖
     ├── backend（:18472）                ← 启动后等待 MCP 可用，执行 warmup
     └── frontend（:5173）                ← 最后启动，代理 /api → :18472
  8. 健康检查（curl :18472/health）
  9. 等待 Ctrl+C → 清理所有子进程
```
```bash
./stop.sh
# 或直接 Ctrl+C（start.sh 会捕获信号并清理）
```

**测试**

```bash
# 后端单元测试（<1s）
cd backend && bun test ../tests/unittest/backend/

# 前端单元测试（~15s）
cd tests/unittest/frontend && npx vitest run

# 前端覆盖率报告（当前生成报告，但未在 CI 强制阈值）
cd tests/unittest/frontend && npx vitest run --coverage

# E2E 测试（需先启动服务，耗时较长）
bash tests/scripts/start.sh
cd tests/e2e && npx playwright test
bash tests/scripts/stop.sh

# E2E 有头模式（调试）
cd tests/e2e && npx playwright test --headed

# 查看 E2E HTML 报告
cd tests/e2e && npx playwright show-report
```

**数据库查看**

```bash
# Drizzle Studio（Web UI 查看/编辑数据）
cd backend && bunx drizzle-kit studio
# 浏览器打开 https://local.drizzle.studio
```

## 核心原则（Constitution 摘要）

1. **I. 知行分离**
2. **II. 状态图驱动**
3. **III. 并行优先**
4. **IV. 安全操作确认**
5. **V. 热更新零停机**
6. **VI. 渠道路由**
7. **VII. 密钥零硬编码**
8. **VIII. 公共接口向后兼容**
9. **IX. 数据变更可回滚**
10. **X. 关键路径审计留痕**
11. **XI. 复杂度必须论证**

> 完整内容见 `.specify/memory/constitution.md`

## 变更指南

- 新增一个业务技能（如"宽带报修"）
- 新增一个 MCP 工具（如"查询合约"）
- 新增一种坐席卡片
- 新增一个 KMS 子模块
- 修改系统提示词
- 详细文件位置：见 `.specify/specs/000-baseline/codebase-map.md` 的“文件位置速查索引”

## 代码模式范例

- 新增 Hono REST 路由
- 新增 MCP 工具
- 新增坐席卡片
- 新增业务 Skill
- 具体模板、代码片段与目录示例见 `.specify/specs/000-baseline/codebase-map.md`

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
| `rules/mcp.md` | `backend/mcp_servers/**` | MCP 工具定义、Zod 校验、返回格式 |
| `rules/skills.md` | `backend/skills/**` | Skill 目录结构、SKILL.md 编写、状态图标记 |
