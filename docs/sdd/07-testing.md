# 07 - 测试指南

## 1. 概览

项目包含两套独立的测试体系：

| 测试类型 | 框架 | 位置 | 覆盖范围 |
|---------|------|------|---------|
| **单元测试** | Bun 内置测试运行器 | `backend/skills/fault-diagnosis/scripts/` | 故障诊断逻辑（纯函数） |
| **单元测试（新功能）** | Bun 内置测试运行器 | `backend/src/compliance/`, `backend/src/routes/`, `backend/src/middleware/` | 合规拦截、版本管理、Diff 算法、语音指标、沙箱校验、权限控制 |
| **端到端测试（E2E）** | Playwright | `testcase/e2e/` | 前端 UI、HTTP API、结构化卡片渲染、会话管理 |

两套测试均需要先通过 `./win-start.sh` 启动所有服务（backend :18472、telecom-mcp :8003、frontend :5173）。

> **注意：** 语音客服（`/ws/voice`）依赖真实 GLM-Realtime 连接（需 `ZHIPU_API_KEY`）和麦克风权限，目前没有自动化测试，需手动通过浏览器验证。

---

## 2. 技术栈

### 单元测试

| 项目 | 说明 |
|------|------|
| **运行器** | Bun 内置（`bun:test`），无需额外安装 |
| **断言** | `expect` from `bun:test`（Jest 兼容 API） |
| **测试文件** | `*.test.ts`，Bun 原生 TypeScript 支持，无需编译 |

### E2E 测试

| 项目 | 说明 |
|------|------|
| **框架** | Playwright `^1.50.0` |
| **浏览器** | 系统 Chrome（`channel: 'chrome'`），无需下载 Playwright Chromium |
| **并发** | `workers: 1`（顺序执行，避免并发写文件冲突） |
| **重试** | `retries: 1`（LLM 响应偶发超时时自动重试） |
| **超时** | 全局 90s；含 LLM 调用的用例单独设 120s–200s |
| **报告** | 终端 list + HTML 报告（`testcase/playwright-report/`） |
| **截图/录像** | 仅在用例失败时保留 |

---

## 3. 前置条件

### 安装依赖

```bash
# 安装 E2E 测试依赖
cd testcase
npm install
```

> 单元测试无需额外安装，Bun 内置测试运行器开箱即用。

### 启动所有服务

E2E 测试和单元测试均需要后端服务在线：

```bash
# 项目根目录，一键启动（Windows）
./win-start.sh
```

等待终端出现 `✅ 所有服务启动成功` 后再运行测试。

> Playwright 配置了 `reuseExistingServer: true`，会复用 start.sh 已启动的实例，不会重复启动。

### 确认测试数据

`start.sh` 会自动执行 `bun run db:seed`，种入三个测试用户：

| 手机号 | 姓名 | 套餐 | 状态 | 余额 |
|--------|------|------|------|------|
| `13800000001` | 张三 | 畅享 50G（¥50/月） | active | ¥45.80 |
| `13800000002` | 李四 | 无限流量（¥128/月） | active | ¥128.00 |
| `13800000003` | 王五 | 基础 10G（¥19/月） | suspended（欠费） | ¥-23.50 |

套餐、增值业务、账单的完整数据见 **[04-data-model.md §§ 1、3、4](04-data-model.md)**。

> **退订测试注意：** `cancel_service` 会真正删除数据库中的订阅记录，建议退订相关用例使用独立的 `session_id`，避免同一用户重复退订导致第二次失败。

---

## 4. 运行测试

### 4.1 单元测试

```bash
cd backend
bun test skills/fault-diagnosis/scripts/run_diagnosis.test.ts
```

```bash
# 新增功能模块测试
bun test src/compliance/keyword-filter.test.ts src/compliance/version-manager.test.ts src/routes/voice.metrics.test.ts src/routes/sandbox.test.ts src/routes/skill-versions.test.ts src/middleware/auth.test.ts
```

预期输出（约 <1s）：

```
bun test v1.x
 ✓ checkAccount > 账号正常时返回 ok
 ✓ checkAccount > 账号停机时返回 error
 ✓ checkSignal > 返回 3 个检测步骤
 ...
 19 pass, 0 fail
```

### 4.2 E2E 测试

```bash
cd testcase

# 无头模式（CI / 推荐）
npm test

# 有头模式（调试时可观察浏览器行为）
npm run test:headed

# 交互式 UI 模式（选择特定用例运行）
npm run test:ui

# 查看上次运行的 HTML 报告
npm run report
```

### 4.3 运行单个 E2E 测试文件

```bash
cd testcase
npx playwright test e2e/01-chat-page.spec.ts
npx playwright test e2e/06-fault-diagnosis.spec.ts
```

### 4.4 运行指定用例（按 ID 过滤）

```bash
cd testcase
npx playwright test --grep "TC-CARD-01"
npx playwright test --grep "TC-FD"
```

---

## 5. 用例清单

### 5.1 单元测试 — 故障诊断逻辑

**文件：** `backend/skills/fault-diagnosis/scripts/run_diagnosis.test.ts`
**运行器：** Bun
**总数：** 19 条

#### checkAccount（账号状态检查）

| # | 描述 | 测试场景 |
|---|------|---------|
| 1 | 账号正常时返回 ok | `status: 'active'` → `step.status === 'ok'` |
| 2 | 账号停机时返回 error | `status: 'suspended'` → `step.status === 'error'`，detail 含"停机" |

#### checkSignal（信号检测）

| # | 描述 | 测试场景 |
|---|------|---------|
| 3 | 返回 3 个检测步骤 | `steps.length === 3` |
| 4 | 包含基站、SIM、APN 三项 | 步骤名称集合校验 |
| 5 | APN 配置返回 warning | APN 步骤状态为 `'warning'` |

#### checkData（流量检测）

| # | 描述 | 测试场景 |
|---|------|---------|
| 6 | 返回 3 个检测步骤 | `steps.length === 3` |
| 7 | 流量未超 90% 返回 ok | 32.5/50GB（65%）→ `status: 'ok'`，detail 含 `65%` |
| 8 | 流量耗尽返回 error | 50/50GB → `status: 'error'` |
| 9 | 流量超 90% 返回 warning | 46/50GB → `status: 'warning'` |
| 10 | 无限流量套餐显示不限量 | `data_total_gb: -1` → detail 含"不限量" |

#### checkCall（语音检测）

| # | 描述 | 测试场景 |
|---|------|---------|
| 11 | 返回 3 个检测步骤 | `steps.length === 3` |
| 12 | 正确计算剩余通话分钟数 | 500 - 280 = 220 分钟 |
| 13 | 不限量通话时显示不限量 | `voice_total_min: -1` → detail 含"不限量" |
| 14 | 基站切换检测返回 warning | 基站切换步骤固定为 `'warning'` |

#### runDiagnosis（诊断编排器）

| # | 描述 | 测试场景 |
|---|------|---------|
| 15 | no_signal：账号 + 信号 = 4 步 | `diagnostic_steps.length === 4` |
| 16 | no_network：同 no_signal = 4 步 | `diagnostic_steps.length === 4` |
| 17 | slow_data：账号 + 流量 = 4 步 | `diagnostic_steps.length === 4` |
| 18 | call_drop：账号 + 通话 = 4 步 | `diagnostic_steps.length === 4` |
| 19 | 停机账号 conclusion 含"严重问题" | `suspendedSub` + `no_signal` → conclusion 匹配 |
| 20 | 正常账号有 warning 时 conclusion 含"潜在问题" | `activeSub` + `slow_data` → conclusion 匹配 |
| 21 | 结果包含必要字段 | `issue_type`、`diagnostic_steps`、`conclusion` |

---

### 5.2 E2E — 客服对话页（01-chat-page.spec.ts）

**覆盖：** 前端 UI 交互，需要浏览器
**总数：** 15 条（TC-CHAT-01 ～ TC-CHAT-15）

| ID | 描述 |
|----|------|
| TC-CHAT-01 | 页面标题和导航栏可见（智能客服小通、7×24 小时） |
| TC-CHAT-02 | 初始欢迎消息包含正确文案 |
| TC-CHAT-03 | FAQ 快捷选项卡片渲染（查话费、退订视频会员等 4 个） |
| TC-CHAT-04 | 底部快捷问题栏（查话费、退订业务、查套餐、故障报修、人工客服） |
| TC-CHAT-05 | 输入框发送消息，用户气泡出现 |
| TC-CHAT-06 | Bot 收到消息并回复（打字指示器消失） |
| TC-CHAT-07 | Bot 回复内容非空（气泡可见） |
| TC-CHAT-08 | Shift+Enter 换行不触发发送 |
| TC-CHAT-09 | 点击 FAQ 卡片按钮自动发送消息并等待 Bot 回复 |
| TC-CHAT-10 | 点击底部快捷按钮自动发送消息并等待 Bot 回复 |
| TC-CHAT-11 | 发送中显示三点打字动画（animate-bounce） |
| TC-CHAT-12 | 输入框为空时发送按钮禁用 |
| TC-CHAT-13 | 输入内容后发送按钮激活 |
| TC-CHAT-14 | 重置对话按钮清空消息，欢迎语重新出现 |
| TC-CHAT-15 | 点击"转人工客服"触发对话并等待回复 |

---

### 5.3 E2E — REST API 端点（03-api-endpoints.spec.ts）

**覆盖：** 所有 HTTP API，使用 Playwright `request` fixture（无浏览器渲染）
**总数：** 26 条（TC-API-01 ～ TC-API-26）

#### GET /api/files/tree（5 条）

| ID | 描述 |
|----|------|
| TC-API-01 | 返回 200 和 tree 数组字段 |
| TC-API-02 | tree 包含 skills 目录节点（type: dir） |
| TC-API-03 | skills 下包含 4 个电信 skill 子目录 |
| TC-API-04 | tree 中有 4 个 SKILL.md 文件节点 |
| TC-API-05 | tree 包含 4 个参考文档（billing-rules.md 等） |

#### GET /api/files/content（7 条）

| ID | 描述 |
|----|------|
| TC-API-06 | 正常读取 bill-inquiry/SKILL.md，返回 path 和 content |
| TC-API-07 | 正常读取 billing-rules.md 参考文档 |
| TC-API-08 | 缺少 path 参数 → 400，error 含"path" |
| TC-API-09 | 请求非 .md 文件 → 400（安全限制） |
| TC-API-10 | 请求不存在的文件 → 404 |
| TC-API-11 | 读取 fault-diagnosis/references/troubleshoot-guide.md，content 含"故障" |
| TC-API-12 | 读取 plan-inquiry/references/plan-details.md，content 含"套餐" |

#### PUT /api/files/content（5 条）

| ID | 描述 |
|----|------|
| TC-API-13 | 保存文件内容（读后原样写回），返回 ok: true 和 path |
| TC-API-14 | 写入 marker 后重新读取可验证（读写一致性），测试后还原 |
| TC-API-15 | 缺少 content 参数 → 400 |
| TC-API-16 | 缺少 path 参数 → 400 |
| TC-API-17 | 写入非 .md 文件 → 400（安全限制） |

#### POST /api/chat（7 条）

| ID | 描述 |
|----|------|
| TC-API-18 | 正常返回 200、response 字符串、card 字段 |
| TC-API-19 | response 为非空字符串 |
| TC-API-20 | session_id 原样返回 |
| TC-API-21 | 账单查询意图触发合法 card 类型 |
| TC-API-22 | 退订业务意图触发合法 card 类型 |
| TC-API-23 | 套餐查询意图触发合法 card 类型 |
| TC-API-24 | 网络诊断意图触发合法 card 类型 |

#### DELETE /api/sessions/:id（2 条）

| ID | 描述 |
|----|------|
| TC-API-25 | 清除会话返回 ok: true |
| TC-API-26 | 清除不存在的会话也返回 ok（幂等操作） |

---

### 5.4 E2E — 结构化卡片渲染（04-telecom-cards.spec.ts）

**覆盖：** 4 种 MCP 结构化卡片的前端渲染正确性（含真实 LLM 调用）
**总数：** 10 条（TC-CARD-01 ～ TC-CARD-10）

#### bill_card（账单卡片）

| ID | 描述 |
|----|------|
| TC-CARD-01 | 查询 2026-02 账单，渲染账单总额、套餐月费、流量超额费、增值业务费、税费、已缴清 |
| TC-CARD-02 | "查询本月话费账单"也触发 bill_card（账单总额可见） |

#### cancel_card（退订卡片）

| ID | 描述 |
|----|------|
| TC-CARD-03 | 退订 video_pkg，渲染"退订确认"、退订业务、月费减少、生效时间、手机号、警告提示 |
| TC-CARD-04 | cancel_card 显示"视频会员流量包"名称和"-¥20.00/月"费用 |

#### plan_card（套餐卡片）

| ID | 描述 |
|----|------|
| TC-CARD-05 | 查询 plan_unlimited，渲染套餐详情、无限流量套餐、国内流量、通话时长、不限量 |
| TC-CARD-06 | plan_card 显示 ¥128 月费和权益列表（免费来电显示等） |

#### diagnostic_card（诊断卡片）

| ID | 描述 |
|----|------|
| TC-CARD-07 | 诊断 slow_data，渲染"网速慢诊断"、账号状态检查、流量余额检查、网络拥塞检测、后台应用检测 |
| TC-CARD-08 | 诊断步骤包含状态标识，结论显示"未发现严重故障"，detail 含 GB 用量信息 |
| TC-CARD-09 | no_signal 故障触发 diagnostic_card（诊断相关文字可见） |

#### 非卡片消息

| ID | 描述 |
|----|------|
| TC-CARD-10 | 普通问候消息不渲染任何卡片（账单总额、退订确认、套餐详情均不可见） |

---

### 5.5 E2E — 后端集成（05-real-backend.spec.ts）

**覆盖：** 直连后端 `http://localhost:18472`（绕过 Vite 代理），真实 LLM 调用
**总数：** 11 条（TC-BE-01 ～ TC-BE-11）

#### 健康检查

| ID | 描述 |
|----|------|
| TC-BE-01 | GET /health 返回 200 和 `{ status: "ok" }` |

#### 文件树 API（真实磁盘读取）

| ID | 描述 |
|----|------|
| TC-BE-02 | GET /api/files/tree 包含 4 个电信 skill 目录 |
| TC-BE-03 | tree 包含 4 个 SKILL.md 文件 |
| TC-BE-04 | 可读取 bill-inquiry/SKILL.md，content 含"账单" |

#### Chat API（真实 LLM）

| ID | 描述 |
|----|------|
| TC-BE-05 | POST /api/chat 返回 200、非空 response、session_id、card 字段 |
| TC-BE-06 | session_id 原样返回 |
| TC-BE-07 | 缺少 message → 400 |
| TC-BE-08 | 缺少 session_id → 400 |
| TC-BE-09 | 多轮对话保持上下文（第二轮能记住第一轮说的名字） |

#### 会话管理

| ID | 描述 |
|----|------|
| TC-BE-10 | DELETE /api/sessions/:id 先建后删，返回 ok: true |
| TC-BE-11 | 删除不存在的会话也返回 ok（幂等） |

---

### 5.6 E2E — 故障诊断 Agent 行为（06-fault-diagnosis.spec.ts）

**覆盖：** 不同故障类型下 Agent 调用 `diagnose_network` 的行为，以及边界场景
**总数：** 5 条（TC-FD-01 ～ TC-FD-05）

| ID | 手机号 | 故障描述 | 断言关键词 |
|----|--------|---------|-----------|
| TC-FD-01 | 13800000001 | 完全没有信号（no_signal） | 信号、基站、SIM、APN、诊断 |
| TC-FD-02 | 13800000001 | 网速非常慢（slow_data） | 流量、网络、网速、拥塞、诊断 |
| TC-FD-03 | 13800000001 | 通话经常断线（call_drop） | 通话、VoLTE、基站、中断、诊断 |
| TC-FD-04 | 13800000003 | 停机账号无法上网（no_network） | 停机、欠费、暂停、诊断 |
| TC-FD-05 | 19900000099 | 不存在的手机号 | 未找到、不存在、查询不到 |

---

### 5.7 单元测试 — 新增功能模块

**运行器：** Bun
**运行命令：**
```bash
cd backend
bun test src/compliance/keyword-filter.test.ts src/compliance/version-manager.test.ts src/routes/voice.metrics.test.ts src/routes/sandbox.test.ts src/routes/skill-versions.test.ts src/middleware/auth.test.ts
```

**总数：** 60 条，分布如下：

#### 合规用语拦截（keyword-filter.test.ts）— 16 条

| # | describe | 描述 |
|---|----------|------|
| 1-6 | AC 自动机关键词匹配 | banned 检测、warning 检测、正常文本、空文本、催收违规、混合类型 |
| 7-9 | PII 检测 | 身份证号、银行卡号、手机号不误报 |
| 10-11 | PII 脱敏 | 身份证脱敏、无 PII 原文返回 |
| 12-13 | 违规词替换 | banned 替换为 ***、warning 不替换 |
| 14-16 | 词库管理 | 添加/删除/热重载 |

#### 版本管理（version-manager.test.ts）— 8 条

| # | describe | 描述 |
|---|----------|------|
| 1-2 | saveSkillWithVersion | 保存并记录旧版本、连续多版本 |
| 3-4 | getVersionList | 时间倒序、不存在路径返回空 |
| 5-6 | getVersionContent | 获取存在/不存在的版本 |
| 7-8 | rollbackToVersion | 回滚并验证文件内容、不存在版本报错 |

#### Diff 算法（skill-versions.test.ts）— 9 条

| # | describe | 描述 |
|---|----------|------|
| 1-9 | 行级 Diff | 相同内容、完全不同、单行修改、新增行、删除行、空文件、SKILL.md 场景 |

#### 语音会话指标（voice.metrics.test.ts）— 12 条

| # | describe | 描述 |
|---|----------|------|
| 1-4 | 基础功能 | 初始化、轮次、工具记录、连续失败 |
| 5-12 | 可观测指标 | 首包时延、非等待返回null、重复调用、打断计数、冷场检测、getMetrics、空数据边界 |

#### 沙箱校验（sandbox.test.ts）— 6 条

| # | describe | 描述 |
|---|----------|------|
| 1-6 | 校验逻辑 | 合法文件、缺 frontmatter、Mermaid 缺类型、未知工具、内容过短、已知工具 |

#### 权限控制（auth.test.ts）— 9 条

| # | describe | 描述 |
|---|----------|------|
| 1-5 | 角色层级 | admin 全权限、flow_manager 权限、config_editor 限制、auditor 最低 |
| 6-9 | 完整性 | 5 角色定义、层级递增、未知角色、同级权限 |

---

## 6. 超时与重试策略

| 场景 | 超时 | 说明 |
|------|------|------|
| 全局默认 | 90s | 包含单个 HTTP 请求和页面操作 |
| 含 LLM 调用的用例 | 120s–200s | 用例内单独 `test.setTimeout()` 覆盖 |
| Agent 后端硬超时 | 180s | `AbortSignal` 强制终止，防止无限等待 |
| 打字指示器消失 | 150s | `waitForBotReply` 内等待上限 |
| Playwright 全局重试 | 1 次 | LLM 偶发超时时自动重试 |

---

## 7. 查看测试报告

E2E 测试运行后自动生成 HTML 报告：

```bash
cd testcase
npm run report
# 自动在浏览器打开 playwright-report/index.html
```

报告包含：
- 每条用例的执行状态（pass / fail / retry）
- 失败时的截图和录像（`screenshot: 'only-on-failure'`）
- 每步操作的耗时明细
