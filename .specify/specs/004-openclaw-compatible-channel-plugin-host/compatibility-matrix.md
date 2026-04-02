# 兼容矩阵：OpenClaw Channel Plugin 精选兼容范围

**功能分支**: `004-openclaw-compatible-channel-plugin-host`  
**日期**: 2026-04-01  
**适用版本线**: `OpenClaw 2026.4.x`

> 本文档是 `路线 B：精选兼容` 的正式兼容边界说明。  
> 它回答三个问题：
>
> 1. 我们到底兼容哪些 OpenClaw 能力层  
> 2. 首批目标插件真实依赖了哪些 `plugin-sdk/*` surface  
> 3. 哪些 surface 是 `Required / Later / Not Supported`

---

## 1. 兼容目标与边界

### 1.1 兼容对象

- 只兼容 `OpenClaw channel plugin`

### 1.2 不兼容对象

- `provider plugin`
- `memory plugin`
- `context-engine plugin`
- 非 IM 生态的其他插件类别

### 1.3 首批目标插件

1. `@openclaw/whatsapp`
2. `@openclaw/feishu`
3. `@openclaw/line`
4. `@openclaw/telegram`

### 1.4 兼容分层

| 层级 | 含义 |
|---|---|
| `L0 Package/Host` | 包结构、安装、发现、registry、loader |
| `L1 Common SDK` | 多数目标插件共享的 `plugin-sdk/*` 运行时 |
| `L2 Target Plugin SDK` | 某个目标插件专用的 surface |
| `L3 Optional/Test/Long-tail` | 测试、调试、长尾 helper、后置能力 |

---

## 2. 目标插件真实依赖概览

以下结论基于对目标插件源码的直接复核：

- [openclaw-code/extensions/whatsapp](/Users/chenjun/Documents/obsidian/workspace/ai-bot/openclaw-code/extensions/whatsapp)
- [openclaw-code/extensions/feishu](/Users/chenjun/Documents/obsidian/workspace/ai-bot/openclaw-code/extensions/feishu)
- [openclaw-code/extensions/line](/Users/chenjun/Documents/obsidian/workspace/ai-bot/openclaw-code/extensions/line)
- [openclaw-code/extensions/telegram](/Users/chenjun/Documents/obsidian/workspace/ai-bot/openclaw-code/extensions/telegram)

### 2.1 结论摘要

- `WhatsApp / Feishu / LINE` 共享底座较集中
- `Telegram` 的依赖面最宽，是路线 B 中风险最高的目标插件
- 如果第一阶段想先拿到真实收益，应优先打通：
  - `WhatsApp`
  - `Feishu`
  - `LINE`
- `Telegram` 建议在共享底座稳定后再补专项兼容

---

## 3. L0 Package/Host 兼容矩阵

这层是路线 B 的基础，没有它就不存在“兼容 OpenClaw 插件”。

| 能力 | 状态 | 说明 |
|---|---|---|
| `openclaw.plugin.json` | `Required` | manifest-first discovery 基础 |
| `package.json.openclaw.extensions` | `Required` | full runtime 入口 |
| `package.json.openclaw.setupEntry` | `Required` | setup-only / setup-runtime 入口 |
| `package.json.openclaw.channel` | `Required` | channel catalog 元数据 |
| `package.json.openclaw.install` | `Required` | 安装与诊断元数据 |
| npm/path/archive 安装 | `Required` | 社区插件安装前提 |
| 静态 manifest 扫描 | `Required` | discovery 阶段不执行插件代码 |
| `setup-only / setup-runtime / full` | `Required` | OpenClaw 真实加载语义 |
| central registry: `plugins` | `Required` | 宿主基础 |
| central registry: `channels` | `Required` | channel lookup 基础 |
| central registry: `channelSetups` | `Required` | setup 控制面基础 |
| central registry: `diagnostics` | `Required` | 边界可见性基础 |
| enable / disable / allow / deny | `Required` | 控制面治理必需 |

---

## 4. L1 Common SDK 兼容矩阵

这些 surface 在多个目标插件之间共享，是路线 B 的“共性底座”。

| `plugin-sdk/*` | 状态 | 主要依赖插件 | 备注 |
|---|---|---|---|
| `core` | `Required` | 全部 | 入口 helper 与注册核心 |
| `setup` | `Required` | 全部 | setup flow 高频依赖 |
| `account-id` | `Required` | Feishu, LINE | 账号标识规范 |
| `account-core` | `Required` | WhatsApp, Telegram | 账号运行态能力 |
| `account-resolution` | `Required` | WhatsApp, Feishu, LINE | 账号解析 |
| `account-helpers` | `Required` | WhatsApp, Feishu, LINE | 账号辅助 |
| `config-runtime` | `Required` | 全部 | 运行时配置 |
| `channel-config-schema` | `Required` | WhatsApp, LINE, Telegram | config schema |
| `channel-config-helpers` | `Required` | 全部 | schema/helper 高频依赖 |
| `channel-contract` | `Required` | 全部 | channel contract |
| `channel-pairing` | `Required` | 全部 | pairing/login |
| `channel-policy` | `Required` | 全部 | allow/policy 控制 |
| `channel-send-result` | `Required` | 全部 | 发送结果归一 |
| `channel-actions` | `Required` | WhatsApp, Feishu, Telegram | channel actions |
| `channel-inbound` | `Required` | WhatsApp, Feishu, LINE, Telegram | inbound bridge |
| `channel-runtime` | `Required` | WhatsApp, LINE, Telegram | runtime 核心 |
| `conversation-runtime` | `Required` | 全部 | thread/session bridge |
| `routing` | `Required` | 全部 | 共享 routing helper |
| `outbound-runtime` | `Required` | WhatsApp, Feishu, Telegram | 出站核心 |
| `reply-runtime` | `Required` | WhatsApp, Feishu, LINE, Telegram | 回复执行 |
| `reply-payload` | `Required` | 全部 | 回复载荷 |
| `reply-history` | `Required` | WhatsApp, LINE, Telegram | 回复历史 |
| `channel-reply-pipeline` | `Required` | WhatsApp, LINE, Telegram | 回复流水线 |
| `status-helpers` | `Required` | 全部 | status/health 高频依赖 |
| `runtime-env` | `Required` | WhatsApp, LINE, Telegram | runtime env |
| `runtime-store` | `Required` | 全部 | 本地状态抽象 |
| `text-runtime` | `Required` | 全部 | 文本消息处理 |
| `media-runtime` | `Required` | WhatsApp, Feishu, Telegram | 媒体消息处理 |
| `directory-runtime` | `Required` | WhatsApp, Feishu, LINE, Telegram | account/channel 目录 |
| `approval-runtime` | `Required` | WhatsApp, Feishu, Telegram | 审批类场景 |
| `allow-from` | `Required` | Feishu, LINE, Telegram | allow-from 规则 |
| `setup-tools` | `Required` | WhatsApp, Telegram | setup helper |
| `command-auth` | `Later` | WhatsApp, Feishu, LINE, Telegram | 可先由 host bridge 部分兜底 |
| `zod` | `Required for targets` | Feishu, LINE | 类型/schema 支持 |
| `temp-path` | `Later` | WhatsApp, Feishu, LINE | 可先由 host 提供简化版本 |

---

## 5. L2 Target Plugin SDK 兼容矩阵

### 5.1 WhatsApp

| surface | 状态 | 说明 |
|---|---|---|
| `whatsapp-core` | `Required` | 专项核心 |
| `whatsapp-shared` | `Required` | 专项共享层 |
| `gateway-runtime` | `Required` | 渠道 gateway 语义 |
| `security-runtime` | `Required` | 安全与 allowlist 相关 |
| `web-media` | `Required` | Web 媒体处理 |
| `cli-runtime` | `Required` | 控制面/ops 相关 |
| `state-paths` | `Required` | 状态目录 |
| `reply-chunking` | `Later` | 可先简化 |
| `channel-feedback` | `Later` | 第一阶段可不完整支持 |
| `allowlist-config-edit` | `Later` | 可由 host 控制面代管 |
| `fetch-runtime` | `Later` | 先通过 host fetch bridge 兜底 |
| `ssrf-runtime` | `Later` | 如涉及外部 fetch 再补强 |
| `testing` | `Not in runtime scope` | 测试面不属于第一阶段运行时 |

### 5.2 Feishu

| surface | 状态 | 说明 |
|---|---|---|
| `feishu` | `Required` | 专项 SDK |
| `webhook-ingress` | `Required` | webhook-first |
| `lazy-runtime` | `Required` | 实际依赖存在 |
| `secret-input` | `Required` | setup/config 输入 |
| `temp-path` | `Later` | 可先提供最小实现 |

### 5.3 LINE

| surface | 状态 | 说明 |
|---|---|---|
| `runtime` | `Required` | LINE 插件直接依赖 |
| `line-runtime` | `Required` | 专项 runtime |
| `group-access` | `Required` | 群组访问模型 |
| `webhook-ingress` | `Required` | webhook-first |
| `webhook-request-guards` | `Required` | webhook 安全校验 |
| `testing` | `Not in runtime scope` | 第一阶段不做测试兼容面 |

### 5.4 Telegram

| surface | 状态 | 说明 |
|---|---|---|
| `telegram-core` | `Required` | 专项核心 |
| `webhook-ingress` | `Required` | 入站关键 |
| `webhook-request-guards` | `Required` | webhook 安全 |
| `provider-auth` | `Required` | 真实依赖存在 |
| `secret-input` | `Required` | setup/config 输入 |
| `boolean-param` | `Required` | setup 参数读取 |
| `interactive-runtime` | `Required` | 交互式能力 |
| `json-store` | `Required` | 状态存储 |
| `infra-runtime` | `Required` | runtime 依赖 |
| `diagnostic-runtime` | `Required` | 诊断能力 |
| `error-runtime` | `Required` | 错误包装 |
| `retry-runtime` | `Required` | 重试逻辑 |
| `ssrf-runtime` | `Required` | 安全依赖 |
| `acp-runtime` | `Required` | 实际 import 存在 |
| `gateway-runtime` | `Required` | 运行链路存在 |
| `channel-lifecycle` | `Later` | 可在专项阶段补 |
| `command-auth-native` | `Later` | 可先用 bridge 兼容 |
| `hook-runtime` | `Later` | 非首阶段必须 |
| `reply-dispatch-runtime` | `Later` | 首阶段可简化 |
| `media-understanding-runtime` | `Later` | 高阶能力后置 |
| `plugin-runtime` | `Later` | 视真实运行闭环再补 |
| `tool-send` | `Later` | 首阶段非必需 |
| `web-media` | `Later` | 先跑基础消息闭环 |
| `testing` | `Not in runtime scope` | 测试兼容面不做 |

---

## 6. L3 延后或不支持

### 6.1 延后支持

这些能力可能在后续阶段需要，但不应阻塞精选兼容的第一阶段闭环。

| surface | 状态 | 说明 |
|---|---|---|
| `command-auth` | `Later` | 先由 host bridge 覆盖关键路径 |
| `allowlist-config-edit` | `Later` | 交给控制面 |
| `channel-feedback` | `Later` | 非首轮闭环关键 |
| `fetch-runtime` | `Later` | host fetch bridge 先兜底 |
| `reply-chunking` | `Later` | 先不追求高级回复语义 |
| `temp-path` | `Later` | 最小实现可先嵌入 host |
| `media-understanding-runtime` | `Later` | 高阶媒体理解能力后置 |
| `plugin-runtime` | `Later` | 视 Telegram 深度再定 |

### 6.2 明确不支持

| 范围 | 状态 | 说明 |
|---|---|---|
| provider/memory/context-engine 相关 SDK | `Not Supported` | 超出路线 B 范围 |
| 非目标插件专有 core | `Not Supported in phase 1` | 不进入首轮承诺 |
| test-only surface | `Not Supported in runtime scope` | 不作为生产兼容目标 |

---

## 7. 插件优先级与实施顺序建议

### 7.1 优先级排序

建议顺序如下：

1. `WhatsApp`
2. `Feishu`
3. `LINE`
4. `Telegram`

### 7.2 排序原因

- `WhatsApp / Feishu / LINE` 共享底座更集中
- `Telegram` 的专项面最宽，风险最高
- 先拿下前三者，可更快验证路线 B 是否成立

---

## 8. 兼容矩阵的工程化解释

本矩阵不是“是否 import 某个模块”的简单清单，而应转译为工程决策：

- `Required`
  - 首阶段必须实现，否则目标插件无法稳定闭环
- `Required for targets`
  - 因目标插件真实依赖而必须实现
- `Later`
  - 可以通过 host bridge 或功能降级先兜底
- `Not Supported`
  - 明确超出路线 B 范围

---

## 9. 最终结论

如果把整个兼容矩阵压成一句话：

> **路线 B 的实质，不是“兼容 OpenClaw 的 manifest”，而是“在明确版本线和目标插件边界内，兼容其 `channel plugin` 的安装、发现、双阶段加载、主要 `plugin-sdk/*` 运行时与渠道桥接语义”。**

也就是说：

- `L0` 必须完整
- `L1` 必须扎实
- `L2` 只围绕四个目标插件做
- `L3` 明确后置或拒绝

这才是一个可治理、可落地、可长期维护的精选兼容方案。
