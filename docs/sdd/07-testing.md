# 07 - 测试指南

## 1. 概览

项目包含三套测试体系：

| 测试类型 | 框架 | 位置 | 测试数 | 覆盖范围 |
|---------|------|------|--------|---------|
| **后端单元测试** | Bun 内置（`bun:test`） | `tests/unittest/backend/` | 580 | services、engine、chat、agent、db |
| **前端单元测试** | Vitest + @testing-library/react | `tests/unittest/frontend/` | 382 | 组件、hooks、API helpers、工具函数 |
| **端到端测试（E2E）** | Playwright | `tests/e2e/` | 78 | UI 交互、HTTP API、卡片渲染、会话管理 |

**总计：962 个单元测试 + 78 个 E2E 测试 = 1040 个测试用例**

### 文件覆盖率

| | 源文件 | 测试文件 | 覆盖率 |
|---|---|---|---|
| 前端 | 53 | 53 | 100% |
| 后端 | 59 | 52 | 88% |
| **合计** | **112** | **105** | **93%** |

> **注意：** 语音客服（`/ws/voice`）依赖真实 GLM-Realtime 连接和麦克风权限，目前没有自动化测试，需手动验证。

---

## 2. 目录结构

```
tests/
├── scripts/
│   ├── start.sh          # 启动全栈服务（后台，含健康检查）
│   ├── stop.sh           # 停止所有测试服务
│   └── seed.sh           # 重置测试数据（schema sync + seed）
├── e2e/                  # Playwright E2E 测试
│   ├── *.spec.ts         # 6 个测试文件
│   ├── playwright.config.ts
│   ├── global-setup.ts   # 每次运行前重置 DB
│   └── package.json
└── unittest/
    ├── backend/          # Bun 后端单元测试（52 文件）
    │   ├── services/     # 共享服务（16 个测试）
    │   ├── engine/       # LLM 引擎（2 个测试）
    │   ├── chat/         # 客户侧（4 个测试）
    │   ├── agent/        # 坐席侧（card/chat/km 共 21 个测试）
    │   ├── db/           # 数据库 schema（1 个测试）
    │   └── ...
    └── frontend/         # Vitest 前端单元测试（53 文件）
        ├── chat/         # 客户侧组件（7 个测试）
        ├── agent/        # 坐席侧组件（12 个测试）
        ├── km/           # 知识管理（22 个测试）
        ├── shared/       # 共享工具（3 个测试）
        ├── vitest.config.ts
        ├── setup.ts
        └── package.json
```

---

## 3. 技术栈

### 后端单元测试

| 项目 | 说明 |
|------|------|
| **运行器** | Bun 内置（`bun:test`），无需额外安装 |
| **断言** | `expect` from `bun:test`（Jest 兼容 API） |
| **测试文件** | `*.test.ts`，Bun 原生 TypeScript 支持 |

### 前端单元测试

| 项目 | 说明 |
|------|------|
| **运行器** | Vitest `^3.2.0` |
| **组件测试** | @testing-library/react + @testing-library/dom |
| **DOM 环境** | jsdom |
| **路径别名** | `@` → `frontend/src/`（在 vitest.config.ts 中配置） |

### E2E 测试

| 项目 | 说明 |
|------|------|
| **框架** | Playwright `^1.50.0` |
| **浏览器** | 系统 Chrome（`channel: 'chrome'`） |
| **并发** | `workers: 1`（顺序执行） |
| **重试** | `retries: 1`（LLM 响应偶发超时自动重试） |
| **超时** | 全局 90s；LLM 用例 120s–200s |

---

## 4. 运行测试

### 4.1 前置条件

```bash
# 安装前端测试依赖
cd tests/unittest/frontend && npm install

# 安装 E2E 测试依赖
cd tests/e2e && npm install
```

### 4.2 后端单元测试

```bash
cd backend

# 运行全部后端单元测试
bun test ../tests/unittest/backend/

# 运行特定模块
bun test ../tests/unittest/backend/services/     # 共享服务
bun test ../tests/unittest/backend/engine/        # LLM 引擎
bun test ../tests/unittest/backend/chat/          # 客户侧
bun test ../tests/unittest/backend/agent/         # 坐席侧
bun test ../tests/unittest/backend/db/            # 数据库
```

预期输出：
```
580 pass
0 fail
Ran 580 tests across 52 files. [<1s]
```

### 4.3 前端单元测试

```bash
cd tests/unittest/frontend

# 运行全部前端单元测试
npx vitest run

# 带覆盖率报告
npx vitest run --coverage

# 监听模式（开发时用）
npx vitest

# 运行特定模块
npx vitest run chat/          # 客户侧
npx vitest run agent/         # 坐席侧
npx vitest run km/            # 知识管理
npx vitest run shared/        # 共享工具
```

预期输出：
```
Test Files  53 passed (53)
Tests       382 passed (382)
```

### 4.4 E2E 测试

E2E 测试需要先启动服务：

```bash
# 启动服务
bash tests/scripts/start.sh

# 重置测试数据（可选，start.sh 已包含）
bash tests/scripts/seed.sh

# 运行全部 E2E 测试
cd tests/e2e && npx playwright test

# 运行特定文件
npx playwright test 01-chat-page.spec.ts
npx playwright test 06-fault-diagnosis.spec.ts

# 按 ID 过滤
npx playwright test --grep "TC-CARD-01"

# 有头模式（调试）
npx playwright test --headed

# 停止服务
bash tests/scripts/stop.sh
```

---

## 5. 测试用例清单

### 5.1 后端单元测试（580 tests / 52 files）

#### services/（16 个测试文件）

| 文件 | 测试数 | 覆盖内容 |
|------|--------|---------|
| logger.test.ts | 6 | info/warn/error 方法、extra 参数 |
| i18n.test.ts | 12 | t() 静态字符串、模板函数、TOOL_LABELS、SMS_LABELS |
| session-bus.test.ts | 8 | 发布/订阅、历史缓冲、phone 隔离 |
| lang-session.test.ts | 6 | setCustomerLang、setAgentLang、getLangs、隔离性 |
| paths.test.ts | 4 | SKILLS_ROOT、BIZ_SKILLS_DIR、TECH_SKILLS_DIR |
| keyword-filter.test.ts | 16 | AC 自动机、banned/warning/pii 检测、脱敏、词库管理 |
| hallucination-detector.test.ts | 3 | 空回复/无工具的早返回 |
| translate-lang.test.ts | 2 | translateMermaid 中文透传 |
| mermaid.test.ts | 38 | extract/highlight/strip/extractStates/extractTransitions/determineBranch |
| tool-result.test.ts | 8 | isNoDataResult 正则匹配 |
| voice-session.test.ts | 18 | VoiceSessionState（轮次、工具、指标、打断）、TRANSFER_PHRASE_RE |
| voice-common.test.ts | 11 | sendSkillDiagram、runEmotionAnalysis、runProgressTracking、triggerHandoff |
| nanoid.test.ts | 4 | ID 长度、字符集、唯一性 |
| progress-tracker.test.ts | 2 | 空状态/空轮次早返回 |
| tts.test.ts | 7 | TTS fetch mock、错误处理、base64 编码 |
| mcp-client.test.ts | 3 | 服务器不可达时的错误处理 |

#### engine/（2 个测试文件）

| 文件 | 测试数 | 覆盖内容 |
|------|--------|---------|
| llm.test.ts | 4 | LLM provider 和 model 导出 |
| skills.test.ts | 8 | getSkillsByChannel、getSkillsDescriptionByChannel、refreshSkillsCache |

#### chat/（4 个测试文件）

| 文件 | 测试数 | 覆盖内容 |
|------|--------|---------|
| outbound-types.test.ts | 3 | CollectionCase、MarketingTask、CallbackTask 类型 |
| outbound-mock.test.ts | 2 | CALLBACK_TASKS 运行时列表 |
| chat-ws.test.ts | 9 | 模块加载、lang-session 集成、合规、i18n 问候 |
| mock-data.test.ts | 7 | mock-users/outbound-tasks 列表、过滤、数据结构 |

#### agent/（21 个测试文件）

| 目录 | 文件数 | 测试数 | 覆盖内容 |
|------|--------|--------|---------|
| agent/chat/ | 1 | 16 | agent-ws handoff 逻辑、i18n、合规 |
| agent/card/ | 4 | 25 | emotion-analyzer、handoff-analyzer、progress-tracker、compliance |
| agent/km/kms/ | 10 | 95 | documents、candidates、evidence、conflicts、review-packages、action-drafts、assets、tasks、audit、helpers |
| agent/km/skills/ | 6 | 57 | canary、change-requests、files、skill-creator、skill-edit、test-cases |

#### db/（1 个测试文件）

| 文件 | 测试数 | 覆盖内容 |
|------|--------|---------|
| schema.test.ts | 6 | 20+ 表定义验证 |

#### 其他（runner.diagram 等 4 个文件继承自早期）

| 文件 | 测试数 | 覆盖内容 |
|------|--------|---------|
| runner.diagram.test.ts | 50+ | highlightMermaidTool/Branch/Progress、extractMermaid、determineBranch、onDiagramUpdate 管线 |
| skill-versions.test.ts | 9 | 行级 Diff 算法 |
| sandbox.test.ts | 6 | 沙箱静态校验逻辑 |
| outbound.test.ts | 5 | 外呼数据结构 |

---

### 5.2 前端单元测试（382 tests / 53 files）

#### chat/（7 个测试文件）

| 文件 | 测试数 | 覆盖内容 |
|------|--------|---------|
| api.test.ts | 4 | URL 构建、response 解析 |
| mockUsers.test.ts | 4 | fetchMockUsers、fetchInboundUsers |
| outboundData.test.ts | 8 | fetchOutboundTasks、taskToCardData、findOutboundTaskByPhone |
| userSync.test.ts | 3 | BroadcastChannel 包装 |
| CardMessage.test.tsx | 31 | 4 种卡片类型渲染 |
| VoiceChatPage.test.tsx | 5 | 语音页面渲染、空状态 |
| OutboundVoicePage.test.tsx | 5 | 外呼页面渲染 |
| hooks/useVoiceEngine.test.ts | 8 | hook 初始化、状态管理、upsertMsg、reset |

#### agent/（12 个测试文件）

| 文件 | 测试数 | 覆盖内容 |
|------|--------|---------|
| AgentWorkstationPage.test.tsx | 5 | 工作台渲染、导航、Tab |
| cards/CardPanel.test.tsx | 3 | 空/有数据/关闭状态 |
| cards/CardShell.test.tsx | 8 | 卡片壳组件、拖拽、折叠 |
| cards/registry.test.ts | 7 | 注册/查找/事件匹配 |
| cards/index.test.ts | 8 | 6 种卡片注册验证 |
| cards/contents/*.test.tsx (6) | 43 | Emotion、Handoff、Compliance、Diagram、OutboundTask、UserDetail 内容组件 |

#### km/（22 个测试文件）

| 文件 | 测试数 | 覆盖内容 |
|------|--------|---------|
| api.test.ts | 34 | 所有 KM API 端点 |
| mcp/api.test.ts | 11 | MCP API 端点 |
| mcp/McpManagement*.test.tsx (5) | 12 | MCP 管理组件 |
| hooks/useSkillManager.test.ts | 20 | 工具函数 |
| KM 页面 (12 files) | ~60 | 文档/候选/评审/资产/操作/审计/任务列表和详情 |
| 编辑器组件 (7 files) | ~35 | FileTree、MarkdownEditor、Pipeline、Sandbox、Version、SkillEditorWidgets、NLEditPanel |

#### shared/（3 个测试文件）

| 文件 | 测试数 | 覆盖内容 |
|------|--------|---------|
| audio.test.ts | 18 | float32ToInt16、arrayBufferToBase64、base64ToUint8 |
| mermaid.test.ts | 4 | renderMermaid（mocked） |
| DiagramPanel.test.tsx | 3 | 有/无 diagram 渲染 |

---

### 5.3 E2E 测试（78 tests / 6 files）

| 文件 | 测试数 | 覆盖内容 |
|------|--------|---------|
| 01-chat-page.spec.ts | 13 | 页面结构、消息收发、FAQ、快捷按钮、打字指示器 |
| 03-api-endpoints.spec.ts | 26 | 文件树、文件读写、Chat API（4 种卡片）、会话管理 |
| 04-telecom-cards.spec.ts | 10 | 账单/退订/套餐/诊断卡片前端渲染 |
| 05-real-backend.spec.ts | 11 | 健康检查、文件树、Chat API、多轮上下文、会话管理 |
| 06-fault-diagnosis.spec.ts | 5 | 4 种故障诊断 + 停机/不存在号码边界 |
| 07-skill-lifecycle.spec.ts | 13 | 技能创建→沙盒验证→发布→生效→清理 |

---

## 6. 超时与重试策略

| 场景 | 超时 | 说明 |
|------|------|------|
| 后端单元测试 | <1s | 纯逻辑测试，无外部依赖 |
| 前端单元测试 | ~15s | jsdom 环境启动 + 组件渲染 |
| E2E 全局默认 | 90s | 单个 HTTP 请求或页面操作 |
| E2E LLM 用例 | 120s–200s | `test.setTimeout()` 覆盖 |
| Playwright 重试 | 1 次 | LLM 偶发超时自动重试 |

---

## 7. 测试脚本

```bash
# 启动测试服务
bash tests/scripts/start.sh

# 停止测试服务
bash tests/scripts/stop.sh

# 重置测试数据
bash tests/scripts/seed.sh

# 一键运行全部单元测试
cd backend && bun test ../tests/unittest/backend/ && cd ../tests/unittest/frontend && npx vitest run

# 一键运行 E2E
cd tests/e2e && npx playwright test

# 查看 E2E HTML 报告
cd tests/e2e && npx playwright show-report
```

---

## 8. 测试数据

`start.sh` / `seed.sh` 会自动执行 `bun run db:seed`，种入测试用户：

| 手机号 | 姓名 | 套餐 | 状态 |
|--------|------|------|------|
| `13800000001` | 张三 | 畅享 50G（¥50/月） | active |
| `13800000002` | 李四 | 无限流量（¥128/月） | active |
| `13800000003` | 王五 | 基础 10G（¥19/月） | suspended（欠费） |

外呼任务（催收 3 个 + 营销 3 个）、套餐、增值业务、账单等完整数据见 **[04-data-model.md](04-data-model.md)**。

> **退订测试注意：** `cancel_service` 会真正删除数据库记录，建议使用独立 session_id 避免重复退订。
