# 智能电信客服系统 — 软件设计文档（SDD）

> 版本：3.0.0 | 日期：2026-03-13 | 作者：Chenjun

---

## 文档目录

| 文件 | 内容 |
|------|------|
| [01-architecture.md](01-architecture.md) | 产品架构总览：系统定位、两层架构、协作模式 |
| [02-components.md](02-components.md) | 组件详解：Agent 执行器、Skills 技能包、MCP Server |
| [03-apis.md](03-apis.md) | API 规范：HTTP REST 接口、MCP 工具接口、Skill 加载接口 |
| [04-data-model.md](04-data-model.md) | 数据模型：用户、账单、套餐、诊断结果、数据库 Schema |
| [05-nfr.md](05-nfr.md) | 非功能需求：性能、安全、可靠性 |
| [06-deployment.md](06-deployment.md) | 部署指南：一键启动、手动启动、环境配置 |
| [07-testing.md](07-testing.md) | 测试指南：技术栈、运行命令、单元测试与 E2E 用例清单 |

---

## 系统简介

本系统是一个基于 **Vercel AI SDK** 构建的智能电信客服 Agent 全栈应用，Agent 名为**小通**，提供**文字客服**、**语音客服**与**坐席工作台**三种交互模式。

**文字客服**核心设计理念是将"知"与"行"分离：
- **Skills（知识层）**：按需加载领域知识，如计费规则、套餐详情、退订政策、故障排查指南
- **MCP Tools（执行层）**：连接电信业务系统，执行查询账单、退订增值业务、套餐查询、网络诊断等实际操作

**语音客服**基于 **GLM-Realtime WebSocket API**，实现全程免唤醒的实时语音对话，支持 MCP 工具调用与智能转人工。

**坐席工作台**（`/agent` 页面）为人工客服提供实时辅助：
- 通过持久 WebSocket `/ws/agent` 实时接收客户侧对话内容
- 通过 **Session Bus**（服务端发布/订阅）实现客户侧与坐席侧的会话同步
- 右侧**卡片系统**展示流程图、情感分析、转人工摘要等辅助信息，支持拖拽排序
- 情感分析与 Handoff 分析均在坐席侧触发，不暴露给客户端

## 核心场景

| 场景 | 模式 | 涉及能力 | 调用模式 |
|------|------|----------|----------|
| 查话费 | 文字/语音 | bill-inquiry Skill + query_bill MCP | 并行 |
| 退订增值业务 | 文字/语音 | service-cancel Skill + cancel_service MCP | 串行 |
| 套餐咨询 | 文字/语音 | plan-inquiry Skill + query_plans MCP | 并行 |
| 网络故障诊断 | 文字/语音 | fault-diagnosis Skill + diagnose_network MCP | 串行 |
| 转人工客服 | 文字/语音 | handoff-analyzer（坐席侧触发）+ transfer_to_human | 异步分析 |
| 坐席辅助 | 坐席工作台 | Session Bus + emotion-analyzer + handoff-analyzer | 实时同步 |

---

## 目录结构

```
ai-bot/
├── backend/                        # 后端服务（Bun + Hono）
│   ├── src/
│   │   ├── index.ts                # 服务入口，Hono 应用，挂载所有路由
│   │   ├── session-bus.ts          # 会话事件总线（发布/订阅），跨路由同步客户↔坐席
│   │   ├── logger.ts               # 统一日志工具
│   │   ├── agent/
│   │   │   ├── runner.ts               # Agent 执行器（文字客服核心逻辑）
│   │   │   ├── llm.ts                  # LLM 配置（SiliconFlow + GLM）
│   │   │   ├── skills.ts               # Skill 工具定义
│   │   │   ├── system-prompt.md        # 文字客服系统提示词模板
│   │   │   └── voice-system-prompt.md  # 语音客服系统提示词模板
│   │   ├── db/
│   │   │   ├── index.ts                # 数据库连接（Drizzle ORM）
│   │   │   ├── schema.ts               # sessions / messages 等表定义
│   │   │   └── seed.ts                 # 测试数据初始化（动态月份账单）
│   │   ├── routes/
│   │   │   ├── chat.ts                 # POST /api/chat, DELETE /api/sessions/:id
│   │   │   ├── chat-ws.ts              # WS /ws/chat（持久 WebSocket，多轮对话）
│   │   │   ├── agent-ws.ts             # WS /ws/agent（坐席工作台持久 WebSocket）
│   │   │   ├── voice.ts                # WS /ws/voice（GLM-Realtime 代理）
│   │   │   └── files.ts                # GET/PUT /api/files/（知识库编辑）
│   │   └── skills/
│   │       ├── handoff-analyzer.ts     # 转人工 Handoff Context 分析器（坐席侧）
│   │       └── emotion-analyzer.ts     # 情感分析（坐席侧，每条用户消息异步触发）
│   ├── mcp_servers/ts/
│   │   └── telecom_service.ts          # Telecom MCP Server（:8003）
│   └── skills/                         # Skills 知识层（文字客服）
│       ├── bill-inquiry/               # 账单查询
│       ├── plan-inquiry/               # 套餐咨询
│       ├── service-cancel/             # 业务退订
│       ├── fault-diagnosis/            # 故障诊断
│       ├── handoff-analysis/           # 转人工分析提示词（SKILL.md）
│       └── emotion-detection/          # 情感分类提示词（SKILL.md）
├── frontend/                           # 前端（React + Vite）
│   └── src/
│       ├── App.tsx                     # 路由入口 + 卡片组件（BillCard 等）
│       ├── mockUsers.ts                # 模拟用户数据
│       ├── i18n.ts                     # 双语翻译字典（zh/en）
│       ├── pages/
│       │   ├── ChatPage.tsx                # 文字客服聊天 UI
│       │   ├── AgentWorkstationPage.tsx    # 坐席工作台（/agent 路由）
│       │   ├── VoiceChatPage.tsx           # 语音客服 UI（GLM-Realtime）
│       │   └── OutboundVoicePage.tsx       # 外呼机器人 UI
│       └── components/
│           ├── DiagramPanel.tsx            # （旧）独立流程图面板，已被卡片系统取代
│           └── cards/                      # 坐席卡片系统
│               ├── registry.ts             # 卡片注册表（CardDef / CardState 类型 + 注册函数）
│               ├── CardShell.tsx           # 可拖拽卡片壳（header + collapse/close + drag）
│               ├── CardPanel.tsx           # 2 列 Grid 卡片容器，支持拖拽排序
│               ├── index.ts                # 注册所有内置卡片（副作用导入）
│               └── contents/
│                   ├── DiagramContent.tsx  # 流程图卡片内容（colSpan:2）
│                   ├── EmotionContent.tsx  # 情感横条卡片内容（colSpan:1）
│                   └── HandoffContent.tsx  # 转人工摘要卡片内容（colSpan:1）
├── docs/sdd/                           # 本文档目录
├── logs/                               # 运行日志
├── start.sh                            # 一键启动脚本
└── stop.sh                             # 一键停止脚本
```
