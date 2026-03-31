# 需求提取详细规则

> 本文档在 Stage 1（Requirement Extraction）时加载，补充 SKILL.md 中的提取方法论。

---

## 1. Frontmatter 来源提取

从 YAML frontmatter 中关注：

| 字段 | 提取内容 |
|------|---------|
| `name` | 技能标识，用于 skill_loaded 断言 |
| `description` | 核心能力描述 → 转化为功能需求 |
| `mode` | inbound/outbound → 对话发起方不同，测试结构不同 |
| `trigger` | 触发方式（user_intent / system_event） |
| `channels` | 渠道约束 → 部分功能可能仅限特定渠道 |

从描述性文字中关注：
- "本技能负责…" → 功能范围
- "不处理…" / "超出范围时…" → 边界需求
- 角色定位（"你是…专家"） → 回复风格需求

## 2. 触发条件来源提取

从"触发条件"章节提取：
- 每个触发意图/关键词 → 一条 trigger 需求
- 注意隐含的负面触发（"当用户问 XX 但不是 YY 时"）

## 3. 工具来源提取

从"工具与分类"和"Tool Call Plan"提取：
- 每个工具的调用条件 → 一条 tool 需求
- 工具间的顺序依赖 → 一条 tool 需求（如"必须先查询再退订"）
- 工具失败时的处理方式 → error 需求

注意：**需求应描述业务语义，不描述技术实现**。

| 不要写 | 应该写 |
|--------|--------|
| "调用 query_bill API" | "系统应查询用户当月账单" |
| "cancel_service 返回 success" | "退订操作成功后应告知用户生效时间" |

## 4. Workflow 来源提取

从 Mermaid 状态图提取：
- 每条状态迁移路径 → 功能需求
- `<<choice>>` 节点的每个分支 → 分支需求
- guard 条件（`[user.confirm]`、`[tool.success]`） → 确认/状态需求
- 终止节点（`[*]`） → 终止条件需求
- `%% tool:xxx` 标记 → 工具调用需求
- 转人工路径 → 升级需求

## 5. 去重与合并

- 若不同来源产出了语义相同的需求，合并为一条，source 取最具体的来源
- 优先保留 workflow 来源（最权威），其次 tool，再次 trigger 和 frontmatter
- 最终需求数一般在 8-30 条之间；若超出，考虑合并过于细碎的条目
