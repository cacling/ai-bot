# 功能规格说明：OpenClaw Compatible Channel Plugin Host

**功能分支**: `004-openclaw-compatible-channel-plugin-host`  
**创建日期**: 2026-04-01  
**状态**: Draft  
**输入**: 本线程内关于 OpenClaw 插件机制研究、ai-bot 渠道接入演进目标、精选兼容路线、目标插件范围与兼容矩阵的连续讨论结论

> **文档导航**：
> - 完整架构设计、模块拆分、宿主边界、运行时生命周期、与 `Interaction Platform` / `CDP` / `ACD` 的衔接见 [plan.md](plan.md)
> - `OpenClaw 2026.4.x` 兼容范围、`plugin-sdk/*` 兼容矩阵、目标插件专项面与分期策略见 [compatibility-matrix.md](compatibility-matrix.md)
> - 宿主内部子模块拆分、模块 ownership、持久化对象边界与 bridge 责任划分见 [module-ownership.md](module-ownership.md)

## 系统概述

随着 `ai-bot` 正在从“单一实时聊天后端”演进为完整的 `Interaction Platform`，渠道接入层不能继续依赖每接一个 IM 就从零开发一套接入逻辑。当前系统的核心投资方向已经明确聚焦在：

- `CDP`：客户语义层与客户事实底座
- `Interaction Platform`：统一 conversation / interaction / routing / workspace
- `ACD Routing Kernel`：分配、SLA、capacity、offer、assignment
- `Agent Workspace`：收件箱、focus、reply、wrap-up
- `Work Order`：后续任务与长生命周期处理

这意味着渠道适配本身不应继续吞噬平台的主要研发预算。  
在这种前提下，我们研究了 [OpenClaw 源码](/Users/chenjun/Documents/obsidian/workspace/ai-bot/openclaw-code)，并确认它的 IM 接入能力并不是简单的“内置几个渠道”，而是建立在一套成熟的 **channel plugin host** 机制之上：

- 插件安装与发现
- `manifest-first` 静态扫描
- `setupEntry` / `extensions` 双入口
- `setup-only / setup-runtime / full` 双阶段加载
- `defineChannelPluginEntry(...)` + central registry 注册
- 丰富的 `ChannelPlugin` adapter contract

基于多轮讨论，我们最终不选择“只参考思路”或“全面兼容整个 OpenClaw 插件生态”，而是选择：

> **路线 B：精选兼容**
>
> 在 `OpenClaw 2026.4.x` 版本线内，`ai-bot` 只兼容 `channel plugin`，并以 `WhatsApp / Feishu / LINE / Telegram` 四个目标插件为验收对象，目标是在尽量不改源码的前提下安装并运行 OpenClaw 社区 IM 插件。

这意味着我们要做的不是“普通插件支持”，而是一个新的基础模块：

> **OpenClaw Compatible Channel Plugin Host**

它将作为未来 `interaction-platform` 的渠道接入子系统存在，负责安装、发现、运行与桥接 OpenClaw 风格 IM 插件，但不接管 `CDP`、`Conversation`、`Interaction`、`Assignment` 等平台核心真相。

## 业务目标

本规格要解决的根问题是：

- `ai-bot` 需要对接越来越多的 IM，但渠道适配不应继续成为主战场
- 渠道插件生态如果完全自建，沉淀速度慢，社区复用价值低
- OpenClaw 社区已经形成可参考的 `channel plugin` 生态，值得直接吸收
- 但如果完全照搬 OpenClaw 本体，会把 `ai-bot` 的核心模型绑定到 OpenClaw 的 session/chat 主模型上，这是不可接受的

因此，本规格的设计目标不是“重写一个 OpenClaw”，也不是“重新发明一套全新渠道插件协议”，而是：

> **在 ai-bot 内部实现一个与 OpenClaw `channel plugin` 生态兼容的宿主层，并通过 bridge 将插件能力接入 ai-bot 自己的 `CDP + Interaction Platform + ACD + Workspace` 核心域。**

## 作用范围与边界

### 本模块必须负责

- 兼容 `openclaw.plugin.json`
- 兼容 `package.json.openclaw.*`
- 安装、发现、启用、禁用、诊断
- `setupEntry` / `extensions` 双入口加载
- `setup-only / setup-runtime / full` 生命周期
- `ChannelPlugin` 运行时注册与 central registry
- `plugin-sdk/*` 精选兼容层
- 插件入站事件的解析与规范化桥接
- 插件出站消息与 channel action 的发送桥接
- 渠道账号 setup/login/logout/status 控制面

### 本模块明确不负责

- 不接管 `party`、`customer_profile` 等客户真相
- 不接管 `conversation` / `interaction` / `assignment` 真相
- 不接管 `ACD Routing Kernel` 决策主流程
- 不接管 `Agent Workspace` 所有权语义
- 不兼容 `provider plugin`、`memory plugin`、`context-engine plugin`
- 不承诺兼容 OpenClaw 所有版本与所有社区插件

## 路线选择结论

本线程曾讨论过三种路线：

1. **路线 A：接口形似**
   - 只参考 OpenClaw 的 manifest 与 registry 设计
   - 不承诺直接运行社区插件
2. **路线 B：精选兼容**
   - 只兼容 `channel plugin`
   - 锁定 `OpenClaw 2026.4.x`
   - 锁定首批目标插件
   - 尽量不改源码运行社区插件
3. **路线 C：广义兼容宿主**
   - 试图兼容大多数 OpenClaw 社区插件与更大插件宇宙

本设计明确采用 **路线 B**。原因是：

- 路线 A 太弱，达不到“吃社区插件”的目标
- 路线 C 太重，会把平台长期锁定到 OpenClaw 完整 SDK 演进节奏
- 路线 B 在复用社区能力与控制工程范围之间最平衡

## 目标插件与版本线

### 版本基线

- `OpenClaw 2026.4.x`

### 首批验收插件

1. `@openclaw/whatsapp`
2. `@openclaw/feishu`
3. `@openclaw/line`
4. `@openclaw/telegram`

### 说明

- 首批只承诺这四个目标插件
- 其他渠道插件如果可运行，视为 bonus，不作为第一阶段承诺范围
- 其中 `Telegram` 插件的 SDK 依赖面最宽，计划在首批中最后完成

## 用户场景与测试

### 用户故事 1 — 平台管理员安装 OpenClaw 社区渠道插件（Priority: P1）

平台管理员希望直接安装 OpenClaw 社区中的 IM 插件，而不是要求团队为每个渠道开发一套全新适配器。

**为什么是 P1**：这是本模块存在的根理由。如果不能稳定安装和发现插件，就谈不上兼容宿主。

**独立测试**：对目标插件执行安装，宿主能识别 manifest、package metadata、channel catalog 项并产出 diagnostics。

**验收场景**：

1. **Given** 一个符合 OpenClaw 规范的 WhatsApp 插件包，**When** 管理员安装插件，**Then** 宿主应能识别 `openclaw.plugin.json` 与 `package.json.openclaw.*`，并在 channel catalog 中展示该渠道。
2. **Given** 一个插件版本不符合 `OpenClaw 2026.4.x` 兼容线，**When** 尝试安装插件，**Then** 宿主应给出明确 diagnostics，而不是在运行期黑盒失败。

---

### 用户故事 2 — 平台通过 setup 控制面完成渠道账号接入（Priority: P1）

平台管理员需要在不启动完整 channel runtime 的情况下，对插件执行 setup、login、status、logout 等控制面动作。

**为什么是 P1**：这直接依赖 `setupEntry` 与 `setup-only / setup-runtime` 生命周期，是 OpenClaw 机制最关键的价值之一。

**独立测试**：对目标插件执行 `channels add/login/status` 类操作，宿主能只加载 setup surface 并完成账号绑定。

**验收场景**：

1. **Given** 一个 Feishu 插件已安装，**When** 管理员进入渠道 setup，**Then** 宿主应只加载 setup runtime 而非完整 gateway runtime。
2. **Given** 一个 LINE 渠道账号已完成绑定，**When** 管理员查看 status，**Then** 宿主应能调用插件状态面返回健康信息。

---

### 用户故事 3 — 插件入站消息进入 ai-bot 的统一互动内核（Priority: P1）

当渠道插件收到 Webhook、WS 或 Poller 入站事件时，它不应直接写平台核心真相，而应通过宿主 bridge 进入 `Conversation / Interaction` 的统一接入链路。

**为什么是 P1**：这是避免渠道插件污染核心领域边界的关键。

**独立测试**：通过目标插件模拟入站消息，验证宿主将其规范化为内部 ingress event，并由 `Interaction Platform` materialize 成 conversation/message。

**验收场景**：

1. **Given** Telegram 插件收到入站文本消息，**When** 插件触发 inbound 处理，**Then** 宿主应将其转换成 ai-bot 内部统一 ingress event，而不是让插件直写 conversation 表。
2. **Given** WhatsApp 插件收到媒体消息，**When** 插件完成 channel 级解析，**Then** 宿主应将媒体规范化后交给平台统一的消息处理链路。

---

### 用户故事 4 — 坐席回复经宿主桥接回原渠道（Priority: P1）

当坐席或系统通过 `Agent Workspace` / `Interaction Platform` 发起回复时，系统需要将内部 outbound 请求桥接到插件的 channel runtime，再回发到原渠道。

**为什么是 P1**：只有入站和出站都打通，兼容宿主才具备实际价值。

**独立测试**：对目标插件执行 agent reply / system outbound，验证消息经宿主桥接后能发往原 IM。

**验收场景**：

1. **Given** 坐席在 Workspace 中回复一条 WhatsApp 对话，**When** 平台发起 outbound，**Then** 宿主应调用插件的 outbound/runtime surface 成功发送消息。
2. **Given** 一个 Feishu 会话需要执行 channel-specific action，**When** 平台调用 action bridge，**Then** 宿主应将动作转发到插件，而非在核心域内硬编码。

---

### 用户故事 5 — 插件兼容失败必须可诊断、可边界化（Priority: P2）

当某个 OpenClaw 社区插件依赖了未兼容的 `plugin-sdk/*` surface，宿主应给出可读的兼容诊断，而不是隐式失败。

**为什么是 P2**：路线 B 不是“全兼容”，所以必须让边界可见、可解释、可治理。

**独立测试**：加载一个依赖未支持 surface 的插件，验证宿主能给出缺失 surface、所属兼容层级与建议动作。

**验收场景**：

1. **Given** 一个插件依赖未支持的 `provider plugin` surface，**When** 尝试加载，**Then** 宿主应明确提示该插件超出路线 B 范围。
2. **Given** 一个 Telegram 插件依赖 `plugin-sdk` 的可延后 surface，**When** 当前 host 未实现该 surface，**Then** 宿主应能在 diagnostics 中标出缺失点，而不是直接崩溃。

## 边界情况

- 某些插件会 import `plugin-sdk` 的 `.js` 子路径或 test-only helper，宿主是否要一律兼容？
- 某些插件的 setup 需要长期持有本地状态文件，宿主是否统一提供 runtime store / state path 抽象？
- 不同渠道在 reply threading、allowlist、安全校验上的差异如何保持在插件层，而不泄漏进核心域？
- `Telegram` 等依赖面更大的插件是否要和 `WhatsApp / Feishu / LINE` 同批交付，还是明确后置？
- 兼容 `OpenClaw 2026.4.x` 后，如果社区插件升级到新 minor 版本，宿主如何判断“可直接运行 / 需要适配 / 不支持”？

## 需求

### 功能需求

- **FR-001**: 系统必须新增一个独立的 `OpenClaw Compatible Channel Plugin Host` 模块，作为未来 `interaction-platform` 的渠道接入子系统。
- **FR-002**: 宿主必须兼容 `openclaw.plugin.json` 与 `package.json.openclaw.*` 的包结构。
- **FR-003**: 宿主必须支持 `manifest-first` 插件发现，不应在发现阶段执行插件代码。
- **FR-004**: 宿主必须支持 `setupEntry` 与 `extensions` 双入口，并兼容 `setup-only / setup-runtime / full` 三种运行模式。
- **FR-005**: 宿主必须兼容 OpenClaw `channel plugin` 的 central registry 模型，至少支持 `plugins / channels / channelSetups / diagnostics` 四类核心注册表。
- **FR-006**: 宿主必须提供 `openclaw/plugin-sdk/*` 的精选兼容层，并以 `compatibility-matrix.md` 中定义的范围为准。
- **FR-007**: 宿主必须仅兼容 `channel plugin`，不应承诺兼容 `provider / memory / context-engine` 等其他 OpenClaw 插件类别。
- **FR-008**: 宿主必须锁定 `OpenClaw 2026.4.x` 作为第一阶段兼容版本线，并在安装/加载时执行兼容性检查。
- **FR-009**: 宿主必须以 `WhatsApp / Feishu / LINE / Telegram` 作为首批验收插件，其中 Telegram 允许在阶段上后置。
- **FR-010**: 宿主必须通过 bridge 将插件 inbound 规范化到 ai-bot 的内部 ingress，不允许插件直接写入 `CDP / Conversation / Interaction / Assignment` 真相。
- **FR-011**: 宿主必须通过 bridge 将 ai-bot 的 outbound / action 请求转发到插件 runtime，不允许核心域硬编码各渠道发送逻辑。
- **FR-012**: 宿主必须提供控制面能力，包括 install、discover、enable/disable、setup、login、status、logout 与 diagnostics。
- **FR-013**: 宿主必须对未支持的 SDK surface、超出范围的插件类别和版本不兼容情况给出显式诊断。
- **FR-014**: 宿主必须保证插件只承担渠道接入层职责，不得侵入 `CDP`、`Routing Kernel`、`Workspace` 的领域真相。
- **FR-015**: 宿主必须允许未来继续扩展兼容矩阵，但第一阶段不得无限扩大范围。

## 成功标准

### 可量化指标

- **SC-001**: 首批四个目标插件中，至少 `WhatsApp / Feishu / LINE` 三个插件可在尽量不改源码前提下完成安装、发现、setup、入站、出站闭环。
- **SC-002**: `Telegram` 插件的兼容状态必须在第一阶段结束前明确为“已支持”或“仍缺哪些 surface”，不能停留在模糊状态。
- **SC-003**: 插件发现与 setup 流程必须在不启动完整 runtime 的前提下运行成功，证明双入口与双阶段加载设计有效。
- **SC-004**: 所有目标插件的入站流量都必须经由 host bridge 进入 ai-bot 的内部 conversation/interaction ingress，而非直写核心真相。
- **SC-005**: 所有目标插件的出站消息都必须经由 host bridge 调用插件 runtime 完成发送，而非在核心域中渠道硬编码。
- **SC-006**: 对于未支持的 `plugin-sdk/*` surface，宿主必须能输出 diagnostics，帮助研发明确缺失范围，而不是在运行时静默失败。
