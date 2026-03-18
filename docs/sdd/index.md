# 智能电信客服系统 — 软件设计文档（SDD）

> 版本：5.0.0 | 日期：2026-03-17 | 作者：Chenjun

---

## 文档目录

| 文件 | 内容 |
|------|------|
| [01-architecture.md](01-architecture.md) | 产品架构总览：系统定位、两层架构、协作模式 |
| [02-components.md](02-components.md) | 组件详解：Agent 执行器、Skills 技能包、MCP Server、外呼系统、知识管理、灰度发布 |
| [03-apis.md](03-apis.md) | API 规范：HTTP REST、WebSocket、MCP 工具、知识管理、灰度/审批/测试 API |
| [04-data-model.md](04-data-model.md) | 数据模型：用户、账单、套餐、外呼任务、知识管理（13 张表）、数据库 Schema |
| [05-nfr.md](05-nfr.md) | 非功能需求：性能、安全、可靠性 |
| [06-deployment.md](06-deployment.md) | 部署指南：一键启动、手动启动、环境配置 |
| [07-testing.md](07-testing.md) | 测试指南：1040 个测试用例（962 单元 + 78 E2E）、93% 覆盖率、运行命令 |

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
| App 使用支持 | 文字/语音 | telecom-app Skill + diagnose_app MCP | 串行 |
| 转人工客服 | 文字/语音 | handoff-analyzer（坐席侧触发）+ transfer_to_human | 异步分析 |
| 坐席辅助 | 坐席工作台 | Session Bus + emotion-analyzer + handoff-analyzer | 实时同步 |
| 外呼营销 | 语音 | outbound-marketing Skill + record_call_result / send_followup_sms | 串行 |
| 外呼催收 | 语音 | outbound-collection Skill + record_call_result / send_followup_sms | 串行 |
| 合规监控 | 坐席工作台 | keyword-filter（AC 自动机）+ compliance 卡片 | 同步拦截 |
| 技能创建 | 知识库编辑器 | skill-creator-spec（system prompt 模板）+ AI 多轮对话 | 对话式 |
| 技能渠道绑定 | 知识库编辑器 | channels 字段 → getSkillsByChannel() → 各机器人热加载 | 动态路由 |
| 版本管理 | 知识库编辑器 | skill_versions 表 + VersionPanel | Diff + 回滚 |
| 沙箱验证 | 知识库编辑器 | sandbox API + runAgent(overrideSkillsDir) + 回归测试（6 种断言） | 隔离测试 |
| 自然语言配置 | 知识库编辑器 | skill-clarify + skill-edit API（LLM 驱动） | 多轮澄清 |

---

## 目录结构

### Backend (backend/src/)

```
backend/src/
├── index.ts                 ← 服务入口（唯一根级文件）
├── db/                      ← 数据库（index.ts, schema.ts, seed.ts, nanoid.ts）
├── engine/                  ← LLM Agent 引擎
│   ├── runner.ts            （Agent 编排、工具调用）
│   ├── llm.ts               （LLM 客户端配置 - SiliconFlow）
│   ├── skills.ts            （工具定义、技能注册）
│   └── *-system-prompt.md   （5 个系统提示词文件）
├── chat/                    ← 客户侧路由
│   ├── chat.ts              （REST 同步聊天：POST /api/chat）
│   ├── chat-ws.ts           （WebSocket 实时聊天：/ws/chat）
│   ├── voice.ts             （语音入呼：/ws/voice）
│   ├── outbound.ts          （语音外呼：/ws/outbound）
│   ├── mock-data.ts         （GET /api/mock-users, /api/outbound-tasks）
│   ├── outbound-mock.ts     （mock 外呼任务数据）
│   └── outbound-types.ts    （外呼类型定义）
├── agent/                   ← 坐席工作台（人工客服侧）
│   ├── chat/
│   │   └── agent-ws.ts      （WebSocket: /ws/agent）
│   ├── card/
│   │   ├── emotion-analyzer.ts
│   │   ├── handoff-analyzer.ts
│   │   ├── progress-tracker.ts
│   │   └── compliance.ts    （关键词管理 API）
│   └── km/
│       ├── kms/             （知识管理 - 11 个文件）
│       │   ├── index.ts, documents.ts, candidates.ts, evidence.ts
│       │   ├── conflicts.ts, review-packages.ts, action-drafts.ts
│       │   ├── assets.ts, tasks.ts, audit.ts, helpers.ts
│       └── skills/          （技能管理 - 10 个文件）
│           ├── skills.ts, skill-creator.ts, skill-edit.ts
│           ├── skill-versions.ts, version-manager.ts
│           ├── sandbox.ts, canary.ts, files.ts
│           ├── test-cases.ts, change-requests.ts
└── services/                ← 共享服务（16 个文件）
    ├── logger.ts, i18n.ts, session-bus.ts, lang-session.ts
    ├── paths.ts, auth.ts
    ├── keyword-filter.ts, hallucination-detector.ts
    ├── translate-lang.ts, tts.ts
    ├── mermaid.ts, tool-result.ts
    ├── voice-common.ts, voice-session.ts, mcp-client.ts
```

### Frontend (frontend/src/)

```
frontend/src/
├── main.tsx, App.tsx, i18n.ts
├── chat/                    ← 客户侧
│   ├── api.ts, CardMessage.tsx
│   ├── VoiceChatPage.tsx, OutboundVoicePage.tsx
│   ├── mockUsers.ts, outboundData.ts, userSync.ts
│   └── hooks/useVoiceEngine.ts
├── agent/                   ← 坐席工作台
│   ├── AgentWorkstationPage.tsx
│   └── cards/ (CardPanel, CardShell, registry, contents/*)
├── km/                      ← 知识 + 技能管理
│   ├── KnowledgeManagementPage.tsx + 子页面
│   ├── EditorPage.tsx, SkillManagerPage.tsx
│   ├── components/ (FileTree, MarkdownEditor, PipelinePanel 等)
│   └── hooks/useSkillManager.ts
└── shared/                  ← 共享工具
    ├── DiagramPanel.tsx, mermaid.ts, audio.ts
```

### Tests (tests/) — 962 单元 + 78 E2E = 1040 测试用例，93% 文件覆盖率

```
tests/
├── scripts/
│   ├── start.sh              （启动测试服务）
│   ├── stop.sh               （停止测试服务）
│   └── seed.sh               （重置测试数据）
├── e2e/                      （Playwright E2E，78 tests / 6 files）
│   ├── *.spec.ts
│   ├── playwright.config.ts, global-setup.ts
│   └── package.json
└── unittest/
    ├── backend/              （Bun 单元测试，580 tests / 52 files）
    │   ├── services/         （16 个测试文件）
    │   ├── engine/           （2 个测试文件）
    │   ├── chat/             （4 个测试文件）
    │   ├── agent/{card/,chat/,km/kms/,km/skills/}
    │   └── db/
    └── frontend/             （Vitest 单元测试，382 tests / 53 files）
        ├── chat/             （7 个测试文件）
        ├── agent/cards/      （12 个测试文件）
        ├── km/               （22 个测试文件）
        ├── shared/           （3 个测试文件）
        ├── vitest.config.ts, setup.ts
        └── package.json
```

### 其他目录

```
ai-bot/
├── backend/
│   ├── mcp_servers/ts/
│   │   └── telecom_service.ts      # Telecom MCP Server（:8003，7 个工具）
│   └── skills/                     # Skills 知识层
│       ├── biz-skills/             # 业务技能（状态图驱动，v3 规范）
│       │   ├── _shared/                # 共享类型定义（BaseCheckStep 等）
│       │   ├── bill-inquiry/           # 账单查询 [online, voice]
│       │   ├── plan-inquiry/           # 套餐咨询 [online, voice]
│       │   ├── service-cancel/         # 业务退订 [online, voice]
│       │   ├── fault-diagnosis/        # 故障诊断 [online, voice]（含诊断脚本）
│       │   ├── telecom-app/            # App 使用支持 [online, voice]
│       │   ├── outbound-collection/    # 外呼催收 [outbound-collection]
│       │   └── outbound-marketing/     # 外呼营销 [outbound-marketing]
│       └── tech-skills/            # 技术技能
│           ├── skill-creator-spec/     # 技能创建器 system prompt + 编写规范
│           ├── compliance-rules/       # 合规规则
│           ├── emotion-detection/      # 情感分类提示词
│           ├── handoff-analysis/       # 转人工分析提示词
│           ├── hallucination-detection/# 幻觉检测
│           └── transfer-detection/     # 转接模式检测
├── frontend/
├── tests/                          # 测试目录
├── docs/sdd/                       # 本文档目录
├── logs/                           # 运行日志
├── start.sh                        # 一键启动脚本
└── stop.sh                         # 一键停止脚本
```
