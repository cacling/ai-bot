# 业务 Skill 编写规范 — 概览

> 版本：2.1.0 | 日期：2026-03-23
>
> 本规范适用于 `backend/skills/biz-skills/` 下所有业务技能的新建与维护。
> 技术技能（`tech-skills/`）不在本规范范围内。

---

## 1. 设计原则

**状态图驱动**：客户引导状态图是流程逻辑的**唯一权威定义**，文本章节只补充状态图无法表达的信息。

| 信息类型 | 放在哪里 |
|---------|---------|
| 流程分支、步骤顺序、工具调用序列 | **状态图**（节点 + 箭头 + `%% tool:` 注释） |
| 各分支的详细操作指引、话术、数据表 | **references/** 参考文档（通过 `%% ref:` 注释按需引用） |
| 用户意图关键词、issue_type 映射表、工具参数 | **工具与分类**章节 |
| 升级路径分类、触发条件、处理方式 | **升级处理**章节 |
| 合规禁令、操作确认、隐私保护 | **合规规则**章节 |
| 语气、节奏、格式、长度要求 | **回复规范**章节 |

---

## 2. 目录结构

```
{skill-name}/
├── SKILL.md              # 必须 — Skill 主定义文件
├── references/            # 必须 — 参考文档（知识库），至少包含一个 .md
│   └── *.md
├── assets/                # 默认 — 回复模板（约束 LLM 输出格式，无需时目录为空）
│   └── *.md
└── scripts/               # 可选 — 诊断/业务逻辑脚本
    ├── types.ts           #   类型定义（必须）
    ├── run_*.ts           #   编排入口
    ├── check_*.ts         #   检查子模块
    └── *.test.ts          #   单元测试
```

### 命名规则

| 项目 | 规则 | 示例 |
|------|------|------|
| 目录名 | 小写 kebab-case，2-3 个英文单词 | `fault-diagnosis`、`bill-inquiry` |
| SKILL.md | 固定文件名，全大写 | `SKILL.md` |
| 参考文档 | 小写 kebab-case，语义明确 | `troubleshoot-guide.md`、`billing-rules.md` |
| 脚本文件 | 小写 snake_case（TypeScript） | `run_diagnosis.ts`、`check_account.ts` |

---

## 3. SKILL.md 标准结构

### 3.1 YAML Frontmatter

```yaml
---
name: {skill-name}           # 必须 — 与目录名一致
description: {一句话中文描述}   # 必须 — 概括 Skill 的职责范围
metadata:
  version: "x.y.z"           # 必须 — 语义化版本号
  tags: [...]                 # 必须 — 用于技能路由和检索的关键词
  mode: inbound | outbound    # 必须 — 交互模式
  trigger: user_intent | task_dispatch  # 必须 — 触发方式
  channels: [...]             # 必须 — 绑定到哪些机器人渠道
---
```

| 字段 | 说明 |
|------|------|
| `mode: inbound` | 呼入场景：用户主动发起咨询，Agent 被动响应 |
| `mode: outbound` | 外呼场景：系统主动发起通话，Agent 主动开场 |
| `trigger: user_intent` | 由用户意图触发，Agent 根据用户消息路由到此 Skill |
| `trigger: task_dispatch` | 由任务系统下发，通话开始前已注入任务数据 |
| `channels: ["online"]` | 绑定到在线文字客服 |
| `channels: ["voice"]` | 绑定到语音客服（呼入） |
| `channels: ["outbound-collection"]` | 绑定到外呼催收 |
| `channels: ["outbound-marketing"]` | 绑定到外呼营销 |

**channels 可多选**，如 `["online", "voice"]` 表示同时绑定到在线和语音客服。未配置时默认为 `["online"]`。

**标准 channel 值：**

| channel | 机器人 | 技能加载方式 |
|---------|-------|------------|
| `online` | 在线文字客服 | 动态发现，通过 `get_skill_instructions` tool 按需加载 |
| `voice` | 语音客服（呼入） | 技能描述注入 system prompt，工具直接调用 |
| `outbound-collection` | 外呼催收 | 技能完整内容注入 system prompt |
| `outbound-marketing` | 外呼营销 | 技能完整内容注入 system prompt |

### 3.2 章节顺序

```markdown
# {Skill 中文名称}

{1-2 句角色定义}

## 触发条件

## 工具与分类

## 客户引导状态图

## 升级处理

## 合规规则

## 回复规范
```

**不可自造章节名，不可改变章节顺序。**
