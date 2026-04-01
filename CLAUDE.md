# AI-Bot 开发指南

> **本文件由 `.specify/scripts/bash/build-claude-md.sh` 自动生成，请勿手动编辑。**
> 修改内容请更新 spec-kit 源文档后重新运行脚本（或 `/sync-docs`）。
> 编码规范按路径分区在 `.claude/rules/` 中，编辑对应目录文件时自动加载。

**自动生成于**: 2026-04-01

## 项目简介

基于 Vercel AI SDK 的智能电信客服系统，Agent 名为"小通"。前后端分离单体 + 事件驱动混合 + MCP 微服务化工具层。

- **知识层（Skills）**：Markdown 文件，按需懒加载，热更新无需重启
- **执行层（MCP Tools）**：5 个独立 MCP Server（:18003-18007），StreamableHTTP stateless
- **交互模式**：文字客服（/ws/chat）、语音客服（/ws/voice）、外呼（/ws/outbound）、坐席工作台（/ws/agent）

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

## 变更指南


> 新增一类需求时，通常需要改哪些文件？

### 新增一个业务技能（如"宽带报修"）

| 步骤 | 文件 | 说明 |
|------|------|------|
| 1 | `km_service/skills/biz-skills/broadband-repair/SKILL.md` | 新建技能目录 + 主文件（含状态图） |
| 2 | `km_service/skills/biz-skills/broadband-repair/references/*.md` | 参考文档（政策/规则） |
| 3 | （可选）`km_service/skills/biz-skills/broadband-repair/scripts/*.ts` | 诊断/执行脚本 |
| 4 | 无需修改 | skills.ts 自动发现新目录，refreshSkillsCache() 热加载 |
| 5 | `tests/` | 新增回归测试用例（POST /api/test-cases） |

**零代码变更**：如果不需要新 MCP 工具，只需创建 Skill 文件，系统自动加载。

### 新增一个 MCP 工具（如"查询合约"）

| 步骤 | 文件 | 说明 |
|------|------|------|
| 1 | `mcp_servers/src/services/account_service.ts` | 在对应 Server 中添加 `server.tool(...)` |
| 2 | `backend/src/db/schema/business.ts` | 若需要新表，在此添加 |
| 3 | `backend/src/db/seed.ts` | 添加种子数据 |
| 4 | 相关 SKILL.md | 在"工具与分类"节添加工具说明 + 状态图中打 `%% tool:` 标记 |
| 5 | `backend/src/engine/runner.ts` | 若需要 Mermaid 高亮，在 SKILL_TOOL_MAP 中添加映射 |
| 6 | `frontend/src/chat/CardMessage.tsx` | 若需要新卡片类型，添加渲染逻辑 |
| 7 | `tests/` | 后端单元测试 + E2E 测试 |

### 新增一种坐席卡片

| 步骤 | 文件 | 说明 |
|------|------|------|
| 1 | `frontend/src/agent/cards/contents/XxxContent.tsx` | 新建卡片内容组件 |
| 2 | `frontend/src/agent/cards/index.ts` | 调用 `registerCard()` 注册 |
| 3 | 后端对应路由 | 发送新的 WS 事件类型 |
| 4 | `frontend/tests/unittest/agent/cards/` | 组件测试 |

### 新增一个 KMS 子模块

| 步骤 | 文件 | 说明 |
|------|------|------|
| 1 | `backend/src/db/schema/platform.ts` | 添加 km_ 表 |
| 2 | `backend/src/agent/km/kms/xxx.ts` | 实现 API 路由 |
| 3 | `backend/src/agent/km/kms/index.ts` | 注册路由 |
| 4 | `frontend/src/km/XxxPage.tsx` | 前端页面 |
| 5 | `frontend/src/km/api.ts` | API 辅助函数 |
| 6 | `frontend/src/App.tsx` | 添加路由 |
| 7 | `tests/` | 后端 + 前端测试 |

### 新增 CDP 子模块

CDP 已独立为 `cdp_service/`（端口 18020），Schema 在 `packages/shared-db/src/schema/cdp.ts`。

| 步骤 | 文件 | 说明 |
|------|------|------|
| 1 | `packages/shared-db/src/schema/cdp.ts` | 添加 cdp_ 表 |
| 2 | `cdp_service/src/routes/xxx.ts` | 实现 API 路由 |
| 3 | `cdp_service/src/routes/index.ts` | 注册路由 |
| 4 | `cdp_service/src/seed.ts` | 添加种子数据映射 |
| 5 | `cdp_service/tests/` | API 测试 |

### 修改系统提示词

| 步骤 | 文件 | 说明 |
|------|------|------|
| 1 | `backend/src/engine/*-system-prompt.md` | 修改对应的提示词文件 |
| 2 | 无需重启 | 但需要新建会话才能生效（旧会话保留旧 prompt） |

---


## 代码模式范例


> 照着以下模板写新代码，保持与现有代码风格一致。编码规范详见 [团队标准 §8-§9](../../presets/telecom-team/templates/standards.md)。

### 新增 Hono REST 路由

```typescript
import { Hono } from 'hono';
import { db } from '../db';
import { myTable } from '../db/schema';
import { eq } from 'drizzle-orm';
import { requireRole } from '../services/auth';
import { logger } from '../services/logger';

const router = new Hono();

router.get('/', async (c) => {
  const rows = await db.select().from(myTable).all();
  return c.json({ items: rows });
});

router.post('/', requireRole('config_editor'), async (c) => {
  const body = await c.req.json();
  if (!body.name) return c.json({ error: 'name 不能为空' }, 400);
  // ... 业务逻辑
  logger.info('my-module', 'created', { name: body.name });
  return c.json({ ok: true });
});

export default router;
```

### 新增 MCP 工具

```typescript
// 在对应的 mcp_servers/ts/*_service.ts 中添加
server.tool("my_tool", "工具描述（中文）", {
  phone: z.string().describe('用户手机号'),
  param: z.string().optional().describe('可选参数'),
}, async ({ phone, param }) => {
  try {
    const rows = await db.select().from(subscribers)
      .where(eq(subscribers.phone, phone)).all();
    if (rows.length === 0) {
      return { content: [{ type: "text", text: JSON.stringify({ found: false }) }] };
    }
    return { content: [{ type: "text", text: JSON.stringify({ found: true, data: rows[0] }) }] };
  } catch (err) {
    return { content: [{ type: "text", text: JSON.stringify({ success: false, message: String(err) }) }] };
  }
});
```

### 新增坐席卡片

```typescript
// 1. 创建 frontend/src/agent/cards/contents/MyContent.tsx
import { memo } from 'react';
import { type Lang } from '../../../i18n';

interface MyData { /* 数据结构 */ }

export const MyContent = memo(function MyContent({ data, lang }: { data: MyData | null; lang: Lang }) {
  if (!data) return <p className="text-gray-400 text-sm">{lang === 'zh' ? '等待数据…' : 'Waiting...'}</p>;
  return <div className="p-3 text-sm">{ /* 渲染内容 */ }</div>;
});

// 2. 在 frontend/src/agent/cards/index.ts 中注册
import { MyIcon } from 'lucide-react';
import { MyContent } from './contents/MyContent';

registerCard({
  id: 'my_card',
  title: { zh: '我的卡片', en: 'My Card' },
  Icon: MyIcon,
  headerClass: 'bg-gray-100',
  colSpan: 1,
  defaultOpen: true,
  defaultCollapsed: false,
  wsEvents: ['my_event'],
  dataExtractor: (msg) => msg.data,
  component: MyContent,
});
```

### 新增业务 Skill

```
km_service/skills/biz-skills/my-skill/
├── SKILL.md                  # 必须：frontmatter + 状态图 + 流程逻辑
└── references/
    └── my-guide.md           # 可选：参考文档
```

SKILL.md frontmatter 模板：

```yaml
---
name: my-skill
description: 一句话技能描述
metadata:
  version: "1.0.0"
  tags: [tag1, tag2]
  mode: inbound
  trigger: user_intent
  channels: ["online", "voice"]
---
```

创建后无需修改任何代码文件，系统自动发现并加载。如需 Mermaid 高亮，在状态图中添加 `%% tool:<name>` 和 `%% branch:<name>` 注解，并在 `engine/runner.ts` 的 `SKILL_TOOL_MAP` 中添加映射。

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
| `rules/skills.md` | `km_service/skills/**` | Skill 目录结构、SKILL.md 编写、状态图标记 |
