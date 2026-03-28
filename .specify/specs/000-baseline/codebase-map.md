# 代码库文件树：智能电信客服系统

**功能**: 000-baseline | **日期**: 2026-03-19

> 本文档列出项目全部源码文件，标注每个文件的职责。
> 不包含 node_modules、.versions（版本快照）、.sandbox（沙箱副本）、日志文件等运行时产物。

---

## 项目根目录

```
ai-bot/
├── start.sh                     # 一键启动（清理→依赖安装→DB 初始化→启动全部服务）
├── stop.sh                      # 一键停止所有服务
├── win-start.sh                 # Windows 启动脚本
├── win-stop.sh                  # Windows 停止脚本
├── package.sh                   # 打包脚本
├── package.json                 # 根 package.json
├── backend/                     # 后端服务
├── frontend/                    # 前端应用
└── tests/                       # 测试套件
```

---

## backend/

### 入口与配置

```
backend/
├── src/index.ts                 # Hono 服务入口（:18472），注册路由、CORS、静态文件、健康检查
├── package.json                 # 后端依赖（Bun + Hono + Vercel AI SDK + Drizzle）
├── tsconfig.json                # TypeScript 配置
├── drizzle.config.ts            # Drizzle Kit 配置（指向 schema/，SQLite 路径）
└── .env                         # 环境变量（需手动创建，不入库）
```

### 数据库层（db/）

```
backend/src/db/
├── index.ts                     # 数据库连接实例（BunSQLite + Drizzle ORM）
├── nanoid.ts                    # 短 ID 生成器（NanoID，自定义字符集）
├── seed.ts                      # 种子数据（3 用户 + 4 套餐 + 4 增值业务 + 6 外呼任务 + 模拟用户 + MCP 服务器 + mock 规则）
└── schema/
    ├── index.ts                 # 统一导出 business + platform
    ├── business.ts              # 电信业务表（9 张）：plans, subscribers, bills, value_added_services,
    │                            #   subscriber_subscriptions, mock_users, outbound_tasks, callback_tasks, device_contexts
    └── platform.ts              # 平台基础设施表（21 张）：sessions, messages, users, skill_registry, skill_versions,
                                 #   change_requests, test_cases, 13 张 km_* 表, mcp_servers
```

### LLM Agent 引擎（engine/）

```
backend/src/engine/
├── runner.ts                    # Agent 编排核心：Vercel AI SDK generateText + ReAct 循环（maxSteps=10）
│                                #   卡片提取、Mermaid 高亮（highlightMermaidTool/Branch）、onStepFinish 钩子
├── llm.ts                       # LLM 客户端配置（SiliconFlow OpenAI 适配器）
├── skills.ts                    # Skills 注册与加载：get_skill_instructions / get_skill_reference 工具定义
│                                #   getSkillsByChannel() 渠道路由、refreshSkillsCache() 缓存刷新
├── sop-guard.ts                 # SOP 状态机守卫：BFS 遍历状态图验证工具调用合规性
├── system-prompt.md             # 文字客服主系统提示词（已弃用，由下方拆分文件替代）
├── inbound-base-system-prompt.md    # 入呼基础系统提示词（共享部分）
├── inbound-online-system-prompt.md  # 在线文字客服系统提示词（含 {{PHONE}}、{{CURRENT_DATE}}）
├── inbound-voice-system-prompt.md   # 语音客服系统提示词（含语言指令、日期注入）
└── outbound-system-prompt.md        # 外呼系统提示词（含 {{TASK_TYPE}}、{{TASK_INFO}}、{{VOICE_STYLE}}）
```

### 客户侧路由（chat/）

```
backend/src/chat/
├── chat-ws.ts                   # WebSocket /ws/chat：持久连接、流式 text_delta、Session Bus 集成
│                                #   合规拦截、i18n 问候、session_summary 指标采集
├── chat.ts                      # HTTP POST /api/chat：同步请求-响应（历史/简单集成模式）
├── voice.ts                     # WebSocket /ws/voice：通过 GlmRealtimeController 代理 GLM-Realtime
│                                #   hook 注入：SOP Guard、Mock 引擎、合规检查、进度追踪、agent 订阅
├── outbound.ts                  # WebSocket /ws/outbound：外呼语音/文本双模式
│                                #   mode=voice → GlmRealtimeController；mode=text → OutboundTextSession
├── outbound-types.ts            # 外呼类型定义（CollectionCase、MarketingTask、CallbackTask）
├── outbound-mock.ts             # 外呼 mock 数据（CALLBACK_TASKS 运行时列表）
└── mock-data.ts                 # GET /api/mock-users、GET /api/outbound-tasks
```

### 坐席工作台（agent/）

```
backend/src/agent/
├── chat/
│   └── agent-ws.ts              # WebSocket /ws/agent：Session Bus 订阅、情感分析触发、
│                                #   Handoff 分析触发、坐席消息处理、合规拦截
├── card/
│   ├── emotion-analyzer.ts      # 情绪分析：5 类分类（平静/礼貌/焦虑/不满/愤怒），单次 LLM 调用
│   ├── handoff-analyzer.ts      # 转人工分析：单次 LLM 调用 → HandoffAnalysis JSON + 自然语言摘要
│   ├── progress-tracker.ts      # 进度跟踪：从 VoiceSessionState 提取对话进展
│   └── compliance.ts            # 合规关键词管理 API（CRUD + 热重载 + 在线检测）
└── km/
    ├── kms/                     # 知识资产管理（KMS）— 见下方
    ├── mcp/                     # MCP 服务管理 — 见下方
    └── skills/                  # 技能管理 — 见下方
```

### 知识资产管理（agent/km/kms/）

```
backend/src/agent/km/kms/
├── index.ts                     # KMS 路由聚合入口（/km/* 路由注册）
├── documents.ts                 # 文档管理 API（上传、版本、解析管线 parse→chunk→generate→validate）
├── candidates.ts                # QA 候选 API（CRUD + 三门验证 gate-check）
├── evidence.ts                  # 证据引用 API（创建、审核 pass/fail）
├── conflicts.ts                 # 冲突管理 API（创建、仲裁 keep_a/keep_b/coexist/split）
├── review-packages.ts           # 审核包 API（提交→审核→批准/驳回，含三门检查）
├── action-drafts.ts             # 动作执行 API（publish/rollback/rescope/unpublish/downgrade/renew）
├── assets.ts                    # 已发布资产 API（列表、详情、版本历史）
├── tasks.ts                     # 治理任务 API（到期审查/内容缺口/冲突仲裁等）
├── audit.ts                     # 审计日志 API（只读查询）
└── helpers.ts                   # 共享辅助函数（分页、过滤、nanoid 等）
```

### MCP 服务管理（agent/km/mcp/）

```
backend/src/agent/km/mcp/
├── index.ts                     # MCP 管理路由注册
├── servers.ts                   # MCP Server CRUD API（创建/更新/删除/discover/invoke/mock-invoke）
└── tools-overview.ts            # 工具概览 API（工具与技能引用映射关系）
```

### 技能管理（agent/km/skills/）

```
backend/src/agent/km/skills/
├── skills.ts                    # 技能列表 API（GET /api/skills）
├── skill-versions.ts            # 版本管理 API（create-from / test / publish / diff）
├── version-manager.ts           # 版本管理核心逻辑（快照创建/文件复制/状态更新）
├── sandbox.ts                   # 沙箱测试（overrideSkillsDir + mock 模式运行 Agent）
├── skill-creator.ts             # AI 技能创建器（多轮访谈 → 草稿 → 确认 → 保存 + 自动生成测试用例）
├── skill-edit.ts                # 自然语言配置编辑（clarify → diff → apply）
├── canary.ts                    # 灰度发布（手机尾号百分比路由 + deploy/promote/rollback）
├── change-requests.ts           # 高风险变更审批（检测模式 + pending→approved/rejected 流程）
├── test-cases.ts                # 回归测试用例 CRUD（6 种断言类型 + 批量创建）
└── files.ts                     # 文件管理 API（tree / read / write / create-file / create-folder）
```

### 共享服务（services/）

```
backend/src/services/
├── logger.ts                    # 结构化 JSON 日志（info/warn/error + extra 参数）
├── i18n.ts                      # 国际化（zh/en 双语，t() 静态字符串 + 模板函数 + TOOL_LABELS/SMS_LABELS）
├── session-bus.ts               # Session Bus：内存发布/订阅，按 phone 隔离，解耦 chat-ws 与 agent-ws
├── lang-session.ts              # 语言会话管理：按手机号维护客户侧/坐席侧语言选择
├── paths.ts                     # 路径解析器：SKILLS_ROOT / BIZ_SKILLS_DIR / TECH_SKILLS_DIR
├── auth.ts                      # RBAC 中间件：requireRole(minRole)，5 级角色层级
├── keyword-filter.ts            # 合规关键词过滤：AC 自动机（O(n)），banned/warning/pii 三类，热重载
├── hallucination-detector.ts    # 幻觉检测：空回复/无工具调用的早期返回
├── mermaid.ts                   # Mermaid 工具函数：extract/highlight/strip/extractStates/extractTransitions/determineBranch
├── tool-result.ts               # 工具结果判定：isNoDataResult 正则匹配
├── mcp-client.ts                # MCP 客户端连接器（@modelcontextprotocol/sdk）
├── translate-lang.ts            # 翻译服务：LLM 翻译（zh→en），Mermaid 图标签翻译，结果缓存
├── tts.ts                       # TTS 语音合成：SiliconFlow CosyVoice2，zh/en 双语音色，输出 base64 MP3
├── voice-session.ts             # VoiceSessionState：对话轮次/工具调用/槽位/指标（首包时延/打断/冷场/时长）
├── voice-common.ts              # 语音共享函数：sendSkillDiagram / runEmotionAnalysis / runProgressTracking / triggerHandoff
├── glm-realtime-controller.ts   # GlmRealtimeController：统一 GLM 事件循环（voice.ts + outbound.ts 共享）
│                                #   GlmSessionHooks 接口注入 handler 特有行为（~10 个 hook）
├── tts-override.ts              # TtsOverride：非中文 TTS 覆盖（翻译 + 生成目标语言语音，按句分割队列）
├── outbound-text-session.ts     # OutboundTextSession：文本模式外呼（Vercel AI SDK generateText + maxSteps=10）
└── mock-engine.ts               # Mock 引擎：匹配 mock 规则并返回模拟响应
```

### MCP Server（mcp_servers/）

```
mcp_servers/src/services/
├── shared.ts                    # 共享工具函数（DB 连接、Hono 路由等）
├── user_info_service.ts         # :18003 — query_subscriber / query_bill / query_plans
├── business_service.ts          # :18004 — cancel_service / issue_invoice
├── diagnosis_service.ts         # :18005 — diagnose_network / diagnose_app
├── outbound_service.ts          # :18006 — record_call_result / send_followup_sms / create_callback_task / record_marketing_result
└── account_service.ts           # :18007 — verify_identity / check_account_balance / check_contracts
```

### Skills 知识层（skills/）

```
backend/skills/
├── biz-skills/                          # 业务技能（状态图驱动，v3 规范）
│   ├── _shared/types.ts                 # 跨技能共享类型（BaseCheckStep 等）
│   ├── bill-inquiry/
│   │   ├── SKILL.md                     # 账单查询流程（channels: [online, voice]）
│   │   └── references/billing-rules.md  # 计费规则参考
│   ├── plan-inquiry/
│   │   ├── SKILL.md                     # 套餐咨询流程（channels: [online, voice]）
│   │   └── references/plan-details.md   # 套餐详情参考
│   ├── service-cancel/
│   │   ├── SKILL.md                     # 退订流程（含用户确认步骤）
│   │   └── references/cancellation-policy.md
│   ├── fault-diagnosis/
│   │   ├── SKILL.md                     # 故障诊断流程（4 种故障类型）
│   │   ├── references/troubleshoot-guide.md
│   │   └── scripts/                     # 诊断脚本编排
│   │       ├── run_diagnosis.ts         # 诊断主入口
│   │       ├── check_account.ts         # 账号状态检查
│   │       ├── check_signal.ts          # 信号/SIM 卡检查
│   │       ├── check_data.ts            # 流量/APN 检查
│   │       ├── check_call.ts            # 语音服务检查
│   │       ├── types.ts                 # 共用类型
│   │       └── run_diagnosis.test.ts    # 诊断脚本单元测试
│   ├── telecom-app/
│   │   ├── SKILL.md                     # App 问题诊断（4 种问题类型）
│   │   ├── references/troubleshoot-guide.md
│   │   └── scripts/                     # 安全诊断脚本
│   │       ├── run_security_diagnosis.ts
│   │       ├── check_app_version.ts
│   │       ├── check_device_security.ts
│   │       ├── check_login_history.ts
│   │       ├── check_suspicious_apps.ts
│   │       ├── types.ts
│   │       └── run_security_diagnosis.test.ts
│   ├── outbound-collection/
│   │   ├── SKILL.md                     # 催收外呼话术（channels: [outbound-collection]）
│   │   ├── references/collection-guide.md
│   │   └── scripts/types.ts
│   └── outbound-marketing/
│       ├── SKILL.md                     # 营销外呼话术（channels: [outbound-marketing]）
│       ├── references/marketing-guide.md
│       └── scripts/types.ts
└── tech-skills/                         # 技术技能（内部分析/生成用途）
    ├── skill-creator-spec/
    │   ├── SKILL.md                     # 技能创建器系统提示词模板（含 {{CONTEXT}}/{{SPEC}}/{{SKILL_INDEX}} 占位符）
    │   └── references/biz-skill-spec.md # v3 SKILL.md 编写规范
    ├── compliance-rules/SKILL.md        # 合规规则提示词
    ├── emotion-detection/
    │   ├── SKILL.md                     # 情绪分类提示词（5 类）
    │   └── references/emotion-guide.md
    ├── handoff-analysis/
    │   ├── SKILL.md                     # 转人工分析提示词
    │   └── references/
    │       ├── no-data-patterns.md      # 无数据场景模式
    │       └── risk-tags.md             # 风险标签定义
    ├── hallucination-detection/SKILL.md # 幻觉检测提示词
    ├── transfer-detection/SKILL.md      # 转接模式检测提示词
    └── translate-lang/SKILL.md          # Mermaid 翻译提示词
```

---

## frontend/

```
frontend/
├── package.json                 # 前端依赖（React 18 + Vite + shadcn/ui + Tailwind）
├── tsconfig.json                # TypeScript 配置（@/ 路径别名指向 src/）
├── vite.config.ts               # Vite 配置（代理 /api → :18472，@/ 路径别名）
├── tailwind.config.js           # Tailwind CSS 配置（shadcn/ui 主题变量）
├── components.json              # shadcn/ui 组件配置
├── index.html                   # HTML 入口
└── src/
    ├── main.tsx                 # React 入口（ReactDOM.createRoot）
    ├── App.tsx                  # 路由定义（/、/agent、/voice、/outbound、/km/*）
    ├── i18n.ts                  # 前端国际化配置
    ├── index.css                # 全局样式（Tailwind + shadcn/ui CSS 变量主题）
    ├── lib/utils.ts             # shadcn/ui 工具函数（cn 类名合并）
    └── components/ui/           # shadcn/ui 组件（Button, Input, Select, Table 等 15 个）
```

### 客户侧（chat/）

```
frontend/src/chat/
├── api.ts                       # HTTP API 辅助函数（URL 构建、response 解析）
├── CardMessage.tsx              # 4 种结构化卡片渲染（bill_card / cancel_card / plan_card / diagnostic_card）
├── VoiceChatPage.tsx            # 语音客服页面：AudioContext + MediaSource 管线、状态机、Handoff 卡片
├── OutboundVoicePage.tsx        # 外呼语音页面：任务选择、麦克风门控、任务切换
├── mockUsers.ts                 # fetchMockUsers / fetchInboundUsers
├── outboundData.ts              # fetchOutboundTasks / taskToCardData / findOutboundTaskByPhone
├── userSync.ts                  # BroadcastChannel 跨窗口用户同步（broadcastUserSwitch / useAgentUserSync）
└── hooks/
    └── useVoiceEngine.ts        # 语音共享 Hook：WebSocket 管理、音频采集/播放、状态管理、消息 upsert
```

### 坐席工作台（agent/）

```
frontend/src/agent/
├── AgentWorkstationPage.tsx     # 坐席工作台主页面：用户选择器、WS 连接、对话区、卡片面板
└── cards/
    ├── index.ts                 # 卡片注册（6 种卡片 registerCard 调用）
    ├── registry.ts              # 卡片注册表：registerCard / getCardDef / findCardByEvent / buildInitialCardStates
    ├── CardPanel.tsx            # 卡片面板：2 列 Grid、拖拽排序、关闭/恢复
    ├── CardShell.tsx            # 卡片壳组件：header、折叠/展开、关闭按钮
    └── contents/
        ├── EmotionContent.tsx   # 情感横条（渐变轨道 + 滑动指示器）
        ├── HandoffContent.tsx   # 转人工摘要（意图/问题/动作/风险/摘要）
        ├── DiagramContent.tsx   # Mermaid 流程图（渲染 + 实时高亮）
        ├── ComplianceContent.tsx # 合规告警列表（累积模式）
        ├── OutboundTaskContent.tsx # 外呼任务详情（客户信息/欠款/套餐）
        └── UserDetailContent.tsx  # 用户信息详情（套餐/余额/已订业务）
```

### 知识管理（km/）

```
frontend/src/km/
├── api.ts                       # KM 全部 API 端点辅助函数（34 个函数）
├── KnowledgeManagementPage.tsx  # KM 主页面（导航 + 子页面路由）
├── EditorPage.tsx               # 技能编辑器（三栏：文件树 | 编辑器 | 聊天/测试）
├── SkillManagerPage.tsx         # 技能管理列表页
├── DocumentListPage.tsx         # 文档列表页
├── DocumentDetailPage.tsx       # 文档详情页（含版本列表）
├── CandidateListPage.tsx        # QA 候选列表页
├── CandidateDetailPage.tsx      # QA 候选详情页（含证据、冲突、三门状态）
├── ReviewPackageListPage.tsx    # 审核包列表页
├── ReviewPackageDetailPage.tsx  # 审核包详情页（含候选列表）
├── ActionDraftListPage.tsx      # 动作草案列表页
├── AssetListPage.tsx            # 已发布资产列表页
├── AssetDetailPage.tsx          # 资产详情页（含版本历史）
├── TaskListPage.tsx             # 治理任务列表页
├── AuditLogPage.tsx             # 审计日志页（只读）
├── components/
│   ├── FileTree.tsx             # 文件树组件（展开/折叠/选中/draft 指示器）
│   ├── MarkdownEditor.tsx       # Markdown 编辑器（编辑 + 预览切换）
│   ├── VersionPanel.tsx         # 版本面板（版本列表/创建/发布/diff）
│   ├── PipelinePanel.tsx        # 解析管线面板（状态可视化）
│   ├── SandboxPanel.tsx         # 沙箱测试面板（对话式 UI + 回归测试）
│   ├── NLEditPanel.tsx          # 自然语言编辑面板（澄清 → diff → 确认）
│   └── SkillEditorWidgets.tsx   # 编辑器辅助组件（按钮、状态指示、工具栏）
├── hooks/
│   └── useSkillManager.ts       # 技能管理 Hook（版本操作、文件操作、缓存）
└── mcp/
    ├── api.ts                   # MCP 管理 API 辅助函数
    ├── McpManagementPage.tsx    # MCP 管理主页面
    ├── McpServerList.tsx        # MCP Server 列表组件
    ├── McpServerForm.tsx        # MCP Server 创建/编辑表单
    └── McpToolTestPanel.tsx     # 工具测试面板（invoke / mock-invoke）
```

### 共享工具（shared/）

```
frontend/src/shared/
├── audio.ts                     # 音频工具函数（float32ToInt16 / arrayBufferToBase64 / base64ToUint8）
├── mermaid.ts                   # Mermaid 渲染工具（renderMermaid）
├── MermaidRenderer.tsx          # Mermaid 渲染共享组件（可复用）
└── DiagramPanel.tsx             # 流程图面板组件（有/无 diagram 状态）
```

---

## tests/

### 测试脚本

```
tests/scripts/
├── start.sh                     # 启动全栈服务（后台，含健康检查）
├── stop.sh                      # 停止所有测试服务
└── seed.sh                      # 重置测试数据（schema sync + seed）
```

### 前端 E2E 测试（Playwright）

命名规则：`<主题>.<测试类型>.spec.ts`（类型：sop/api/ui/crud/contract/validate/constraint/audit）

```
frontend/tests/e2e/
├── fixtures/
│   └── chat-helpers.ts                          # 共享辅助：waitForChatWs, sendMessage, waitForBotReply, getLastBotReply
├── skills/                                      # 业务技能 SOP 测试（动态，跟随技能变更）
│   ├── inbound/
│   │   ├── bill-inquiry.sop.spec.ts             # 账单查询 SOP 多轮对话（2 场景）
│   │   ├── fault-diagnosis.api.spec.ts          # 故障诊断 API 工具调用（5 场景）
│   │   ├── fault-diagnosis.sop.spec.ts          # 故障诊断 SOP 多轮对话（1 场景）
│   │   ├── plan-inquiry.sop.spec.ts             # 套餐查询 SOP（8 场景框架）
│   │   ├── service-cancel.sop.spec.ts           # 增值退订 SOP + Workflow Engine（6 场景）
│   │   └── telecom-app.sop.spec.ts              # App 支持 SOP（10 场景框架）
│   ├── outbound/
│   │   ├── outbound-collection.sop.spec.ts      # 催收外呼 SOP（9 场景框架）
│   │   └── outbound-marketing.sop.spec.ts       # 营销外呼 SOP（7 场景框架）
│   ├── sandbox-validation.validate.spec.ts      # 全技能沙箱验证 + Mock 运行
│   └── sop-guard.constraint.spec.ts             # SOPGuard V2 约束验证
├── platform/                                    # 平台功能测试（稳定，跟随代码变更）
│   ├── chat/
│   │   ├── chat-page.ui.spec.ts                 # 文字聊天 UI（13 用例）
│   │   ├── telecom-cards.ui.spec.ts             # 结构化卡片渲染（10 用例）
│   │   ├── voice-chat.ui.spec.ts                # 语音客服 UI（8 用例框架）
│   │   └── outbound-voice.ui.spec.ts            # 外呼语音 UI（7 用例框架）
│   ├── agent/
│   │   ├── diagram-rendering.ui.spec.ts         # 坐席流程图渲染（2 用例）
│   │   └── agent-workstation.ui.spec.ts         # 坐席工作台卡片+交互（20 用例框架）
│   ├── api/
│   │   ├── endpoints.contract.spec.ts           # REST API 契约（28 用例）
│   │   ├── compliance.contract.spec.ts          # 合规词库 API（8 用例框架）
│   │   └── canary.contract.spec.ts              # 灰度发布 API（5 用例框架）
│   ├── skill-mgmt/
│   │   ├── skill-lifecycle.crud.spec.ts         # 技能生命周期 CRUD（13 用例）
│   │   ├── skill-test-flow.crud.spec.ts         # 版本测试+发布（14 用例）
│   │   ├── skill-diagram.ui.spec.ts             # 技能管理器流程图（2 用例）
│   │   ├── skill-creator.crud.spec.ts           # AI 技能创建器（6 用例框架）
│   │   └── change-request.crud.spec.ts          # 高风险变更审批（4 用例框架）
│   ├── km/
│   │   ├── document-management.crud.spec.ts     # 文档管理 CRUD（7 用例框架）
│   │   ├── candidate-management.crud.spec.ts    # QA 候选 + 三门验证（8 用例框架）
│   │   ├── review-workflow.crud.spec.ts         # 审核包 + 动作执行（8 用例框架）
│   │   ├── asset-management.crud.spec.ts        # 已发布资产管理（5 用例框架）
│   │   └── governance.audit.spec.ts             # 治理任务 + 审计日志（6 用例框架）
│   └── mcp/
│       ├── mcp-management.crud.spec.ts          # MCP Server/Tool CRUD（53 用例）
│       ├── tool-skill-mapping.contract.spec.ts  # Tool-Skill 映射（6 用例）
│       └── connector-management.crud.spec.ts    # Connector CRUD（6 用例框架）
└── playwright.config.ts                         # projects: skills / platform
```

### 后端 API 测试（apitest，全 mock）

1:1 映射所有提供 API 接口的源文件，目录结构镜像 `src/`。

```
backend/tests/apitest/
├── chat/
│   ├── chat.test.ts                             # POST /api/chat, DELETE /api/sessions/:id（12 用例）
│   └── mock-data.test.ts                        # GET /api/test-personas, /api/outbound-tasks（4 用例）
├── agent/
│   ├── card/
│   │   └── compliance.test.ts                   # /api/compliance/*（12 用例）
│   └── km/
│       ├── skills/
│       │   ├── files.test.ts                    # /api/files/*（14 用例）
│       │   ├── skills.test.ts                   # /api/skills（7 用例）
│       │   ├── tool-bindings.test.ts            # /api/skills/:id/tool-bindings（5 用例）
│       │   ├── skill-versions.test.ts           # /api/skill-versions/*（11 用例）
│       │   ├── sandbox.test.ts                  # /api/sandbox/*（12 用例）
│       │   ├── skill-edit.test.ts               # /api/skill-edit/*（6 用例）
│       │   ├── canary.test.ts                   # /api/canary/*（9 用例）
│       │   ├── change-requests.test.ts          # /api/change-requests/*（8 用例）
│       │   ├── test-cases.test.ts               # /api/test-cases/*（7 用例）
│       │   └── skill-creator.test.ts            # /api/skill-creator/*（9 用例）
│       ├── kms/
│       │   ├── documents.test.ts                # /api/km/documents/*（8 用例）
│       │   ├── candidates.test.ts               # /api/km/candidates/*（11 用例）
│       │   ├── evidence.test.ts                 # /api/km/evidence/*（6 用例）
│       │   ├── conflicts.test.ts                # /api/km/conflicts/*（7 用例）
│       │   ├── review-packages.test.ts          # /api/km/review-packages/*（8 用例）
│       │   ├── action-drafts.test.ts            # /api/km/action-drafts/*（8 用例）
│       │   ├── assets.test.ts                   # /api/km/assets/*（5 用例）
│       │   ├── tasks.test.ts                    # /api/km/tasks/*（5 用例）
│       │   ├── audit.test.ts                    # /api/km/audit-logs（5 用例）
│       │   └── reply-copilot.test.ts            # /api/km/reply-copilot/*（4 用例）
│       └── mcp/
│           ├── servers.test.ts                  # /api/mcp/servers/*（15 用例）
│           ├── connectors.test.ts               # /api/mcp/connectors/*（10 用例）
│           ├── tool-management.test.ts          # /api/mcp/tool-management/*（20 用例）
│           └── tools-overview.test.ts           # /api/mcp/tools（3 用例）
```

### MCP Servers API 测试（apitest，全 mock）

1:1 映射 5 个 MCP Server 源文件，mock `backendGet`/`backendPost`。

```
mcp_servers/tests/apitest/
├── user_info_service.test.ts                    # 18003: query_subscriber, query_bill, query_plans, analyze_bill_anomaly（24 用例）
├── business_service.test.ts                     # 18004: cancel_service, issue_invoice（12 用例）
├── diagnosis_service.test.ts                    # 18005: diagnose_network, diagnose_app（17 用例）
├── outbound_service.test.ts                     # 18006: record_call_result, send_followup_sms, create_callback_task, record_marketing_result（31 用例）
└── account_service.test.ts                      # 18007: verify_identity, check_account_balance, check_contracts, apply_service_suspension（13 用例）
```

### MCP Servers E2E 测试

contracts/ 下 1:1 映射 seed 中 16 个 tool contracts（`packages/shared-db/src/schemas/*.json`），验证实际返回结构。

```
mcp_servers/tests/e2e/
├── contracts/                                   # 工具契约验证（1 tool = 1 file）
│   ├── query_subscriber.contract.spec.ts        # :18003 user-info
│   ├── query_bill.contract.spec.ts              # :18003 user-info
│   ├── query_plans.contract.spec.ts             # :18003 user-info
│   ├── analyze_bill_anomaly.contract.spec.ts    # :18003 user-info
│   ├── cancel_service.contract.spec.ts          # :18004 business
│   ├── issue_invoice.contract.spec.ts           # :18004 business
│   ├── diagnose_network.contract.spec.ts        # :18005 diagnosis
│   ├── diagnose_app.contract.spec.ts            # :18005 diagnosis
│   ├── record_call_result.contract.spec.ts      # :18006 outbound
│   ├── send_followup_sms.contract.spec.ts       # :18006 outbound
│   ├── create_callback_task.contract.spec.ts    # :18006 outbound
│   ├── record_marketing_result.contract.spec.ts # :18006 outbound
│   ├── verify_identity.contract.spec.ts         # :18007 account
│   ├── check_account_balance.contract.spec.ts   # :18007 account
│   ├── check_contracts.contract.spec.ts         # :18007 account
│   └── apply_service_suspension.contract.spec.ts # :18007 account
└── platform/                                    # MCP 平台功能
    ├── server-lifecycle.spec.ts                  # 启动/端口/工具数/停止
    ├── tool-discovery.spec.ts                    # MCP tools/list 协议
    ├── transport.spec.ts                         # StreamableHTTP 合规
    ├── error-handling.spec.ts                    # 异常降级
    └── logging.spec.ts                           # 日志格式
```

### Mock APIs API 测试（apitest，全 mock）

1:1 映射 13 个 mock 路由源文件，mock db。

```
mock_apis/tests/apitest/
├── customer.test.ts                             # /api/customer/*（13 用例）
├── billing.test.ts                              # /api/billing/*（10 用例）
├── catalog.test.ts                              # /api/catalog/*（5 用例）
├── orders.test.ts                               # /api/orders/*（9 用例）
├── diagnosis.test.ts                            # /api/diagnosis/*（14 用例）
├── identity.test.ts                             # /api/identity/*（7 用例）
├── invoice.test.ts                              # /api/invoice/*（4 用例）
├── outreach.test.ts                             # /api/outreach/*（9 用例）
├── callback.test.ts                             # /api/callback/*（4 用例）
├── network.test.ts                              # /api/network/*（3 用例）
├── offers.test.ts                               # /api/offers/*（4 用例）
├── payments.test.ts                             # /api/payments/*（5 用例）
└── risk.test.ts                                 # /api/risk/*（3 用例）
```

### 后端单元测试

```
tests/unittest/backend/
├── db/schema.test.ts                    # 30 张表定义验证
├── engine/
│   ├── llm.test.ts                      # LLM provider/model 导出
│   └── skills.test.ts                   # getSkillsByChannel、refreshSkillsCache
├── chat/
│   ├── chat-ws.test.ts                  # 模块加载、lang-session、合规、i18n 问候
│   ├── mock-data.test.ts                # mock-users/outbound-tasks 列表
│   ├── outbound-mock.test.ts            # CALLBACK_TASKS 运行时列表
│   └── outbound-types.test.ts           # CollectionCase/MarketingTask 类型
├── agent/
│   ├── chat/agent-ws.test.ts            # agent-ws handoff、i18n、合规
│   ├── runner.diagram.test.ts           # highlightMermaid/Branch/Progress、extractMermaid、determineBranch
│   ├── km/kms/
│   │   ├── documents.test.ts            # 文档管理 CRUD
│   │   ├── candidates.test.ts           # 候选 QA CRUD + gate-check
│   │   ├── evidence.test.ts             # 证据引用 CRUD
│   │   ├── conflicts.test.ts            # 冲突管理
│   │   ├── review-packages.test.ts      # 审核包工作流
│   │   ├── action-drafts.test.ts        # 动作执行
│   │   ├── assets.test.ts               # 资产管理
│   │   ├── tasks.test.ts                # 治理任务
│   │   ├── audit.test.ts                # 审计日志
│   │   └── helpers.test.ts              # 辅助函数
│   └── km/skills/
│       ├── canary.test.ts               # 灰度发布
│       ├── change-requests.test.ts      # 变更审批
│       ├── files.test.ts                # 文件管理
│       ├── skill-creator.test.ts        # AI 技能创建器
│       ├── skill-edit.test.ts           # 自然语言配置编辑
│       └── test-cases.test.ts           # 回归测试用例
├── services/
│   ├── logger.test.ts                   # info/warn/error
│   ├── i18n.test.ts                     # t()、TOOL_LABELS、SMS_LABELS
│   ├── mermaid.test.ts                  # extract/highlight/strip/states/transitions
│   ├── voice-session.test.ts            # 轮次、工具、指标、打断
│   ├── voice-common.test.ts             # sendSkillDiagram、triggerHandoff
│   ├── lang-session.test.ts             # setCustomerLang/setAgentLang
│   ├── paths.test.ts                    # SKILLS_ROOT 等路径
│   ├── nanoid.test.ts                   # ID 长度/字符集/唯一性
│   ├── tts.test.ts                      # TTS fetch mock、错误处理
│   ├── translate-lang.test.ts           # translateMermaid 中文透传
│   ├── tool-result.test.ts              # isNoDataResult
│   ├── mcp-client.test.ts              # 服务器不可达错误处理
│   ├── hallucination-detector.test.ts   # 空回复/无工具早返回
│   └── progress-tracker.test.ts         # 空状态/空轮次早返回
├── compliance/
│   ├── keyword-filter.test.ts           # AC 自动机、banned/warning/pii
│   └── version-manager.test.ts          # 行级 Diff 算法
├── middleware/auth.test.ts              # RBAC requireRole
├── routes/
│   ├── compliance.test.ts               # 合规 API 路由
│   ├── km/km.test.ts                    # KM API 路由
│   ├── outbound.test.ts                 # 外呼数据结构
│   ├── sandbox.test.ts                  # 沙箱静态校验
│   ├── skill-versions.test.ts           # 版本 Diff
│   ├── voice.test.ts                    # 语音路由
│   └── voice.metrics.test.ts            # 语音指标
├── session-bus.test.ts                  # 发布/订阅、历史缓冲
└── skills/
    ├── emotion-analyzer.test.ts         # 情绪分析
    └── handoff-analyzer.test.ts         # 转人工分析
```

### 前端单元测试

```
tests/unittest/frontend/
├── vitest.config.ts                     # Vitest 配置（jsdom 环境，@ 路径别名）
├── setup.ts                             # 测试 setup
├── i18n.test.ts                         # 前端国际化
├── chat/
│   ├── api.test.ts                      # URL 构建、response 解析
│   ├── mockUsers.test.ts                # fetchMockUsers
│   ├── outboundData.test.ts             # fetchOutboundTasks、taskToCardData
│   ├── userSync.test.ts                 # BroadcastChannel 包装
│   └── hooks/useVoiceEngine.test.ts     # hook 初始化、状态管理
├── agent/cards/
│   ├── index.test.ts                    # 6 种卡片注册验证
│   └── registry.test.ts                 # 注册/查找/事件匹配
├── km/
│   ├── api.test.ts                      # KM API 端点
│   ├── hooks/useSkillManager.test.ts    # 工具函数
│   └── mcp/api.test.ts                  # MCP API 端点
└── shared/
    ├── audio.test.ts                    # float32ToInt16、arrayBufferToBase64
    └── mermaid.test.ts                  # renderMermaid
```

---

## 变更影响指南

> 新增一类需求时，通常需要改哪些文件？

### 新增一个业务技能（如"宽带报修"）

| 步骤 | 文件 | 说明 |
|------|------|------|
| 1 | `backend/skills/biz-skills/broadband-repair/SKILL.md` | 新建技能目录 + 主文件（含状态图） |
| 2 | `backend/skills/biz-skills/broadband-repair/references/*.md` | 参考文档（政策/规则） |
| 3 | （可选）`backend/skills/biz-skills/broadband-repair/scripts/*.ts` | 诊断/执行脚本 |
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

### 修改系统提示词

| 步骤 | 文件 | 说明 |
|------|------|------|
| 1 | `backend/src/engine/*-system-prompt.md` | 修改对应的提示词文件 |
| 2 | 无需重启 | 但需要新建会话才能生效（旧会话保留旧 prompt） |

---

## 文件位置速查索引

| 类型 | 位置 |
|------|------|
| **环境配置** | `backend/.env`（不入库） |
| **数据库 Schema** | `backend/src/db/schema/business.ts`（业务）、`platform.ts`（平台） |
| **种子数据** | `backend/src/db/seed.ts` |
| **系统提示词** | `backend/src/engine/*-system-prompt.md`（5 个文件） |
| **业务技能** | `backend/skills/biz-skills/<skill-name>/SKILL.md` |
| **技术技能** | `backend/skills/tech-skills/<skill-name>/SKILL.md` |
| **MCP Server** | `mcp_servers/src/services/<service>.ts`（5 个文件） |
| **启动/停止脚本** | 根目录 `start.sh` / `stop.sh` |
| **测试脚本** | `tests/scripts/start.sh` / `stop.sh` / `seed.sh` |
| **后端测试** | `tests/unittest/backend/`（Bun:test） |
| **前端测试** | `tests/unittest/frontend/`（Vitest） |
| **E2E 测试** | `tests/e2e/`（Playwright） |
| **Playwright 配置** | `tests/e2e/playwright.config.ts` |
| **Vitest 配置** | `tests/unittest/frontend/vitest.config.ts` |
| **Drizzle 配置** | `backend/drizzle.config.ts` |
| **Vite 配置** | `frontend/vite.config.ts` |
| **Tailwind 配置** | `frontend/tailwind.config.js` |
| **shadcn/ui 配置** | `frontend/components.json` |
| **shadcn/ui 组件** | `frontend/src/components/ui/` |
| **路由注册** | `backend/src/index.ts`（全部路由挂载） |
| **前端路由** | `frontend/src/App.tsx` |
| **日志文件** | `logs/backend.log`、`logs/mcp-*.log`、`logs/frontend.log` |
| **版本快照** | `backend/skills/.versions/<skill>/<vN>/` |
| **沙箱副本** | `backend/skills/.sandbox/<id>/` |
| **灰度目录** | `backend/skills/.canary/` |

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
backend/skills/biz-skills/my-skill/
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
