# 输入输出示例

> 本文档在 Stage 1 和 Stage 2 均加载，提供具体的输入输出示例。

---

## Stage 1 示例

### 输入（部分 SKILL.md）

```markdown
---
name: bill-inquiry
description: 电信账单查询技能，处理月账单查询、费用明细解读、欠费催缴、发票申请等问题
metadata:
  mode: inbound
  trigger: user_intent
  channels: ["online", "voice"]
---

## 触发条件
- 用户询问本月/上月话费金额
- 用户对账单某项费用有疑问
- 用户账号欠费停机，需要了解欠费原因

## 工具与分类
- `query_subscriber(phone)` — 查询用户信息
- `query_bill(phone, month?)` — 查询账单明细

## 状态图（简化）
stateDiagram-v2
  [*] --> IdentifyUser
  IdentifyUser --> QueryBill: %% tool:query_subscriber
  QueryBill --> ExplainCharges: %% tool:query_bill
  ExplainCharges --> HandleAction: user has follow-up
  ExplainCharges --> [*]: user satisfied
  HandleAction --> [*]
```

### 输出（Requirement IR）

```json
[
  {
    "id": "REQ-001",
    "source": "frontmatter",
    "description": "技能应在用户表达查询账单意图时被加载"
  },
  {
    "id": "REQ-002",
    "source": "trigger",
    "description": "用户询问本月话费金额时应触发账单查询流程"
  },
  {
    "id": "REQ-003",
    "source": "trigger",
    "description": "用户对某项费用有疑问时应进入费用解读流程"
  },
  {
    "id": "REQ-004",
    "source": "tool",
    "description": "系统应先查询用户身份信息，再查询账单明细"
  },
  {
    "id": "REQ-005",
    "source": "tool",
    "description": "查询账单后应向用户展示费用组成和金额"
  },
  {
    "id": "REQ-006",
    "source": "workflow",
    "description": "费用解读后若用户有后续操作需求，应引导至对应处理流程"
  },
  {
    "id": "REQ-007",
    "source": "workflow",
    "description": "用户表示满意或无其他问题时，应礼貌结束对话"
  }
]
```

---

## Stage 2 示例

### 输入

- Requirements：上述 7 条
- SKILL.md：完整的 bill-inquiry 技能定义

### 输出（Stage2Output）

```json
{
  "coverage_matrix": [
    { "requirement_id": "REQ-001", "covered_by": ["TC-001"] },
    { "requirement_id": "REQ-002", "covered_by": ["TC-001", "TC-002"] },
    { "requirement_id": "REQ-003", "covered_by": ["TC-003"] },
    { "requirement_id": "REQ-004", "covered_by": ["TC-001", "TC-002", "TC-003"] },
    { "requirement_id": "REQ-005", "covered_by": ["TC-001", "TC-002"] },
    { "requirement_id": "REQ-006", "covered_by": ["TC-003"] },
    { "requirement_id": "REQ-007", "covered_by": ["TC-004"] }
  ],
  "cases": [
    {
      "id": "TC-001",
      "title": "查询当月账单-正常流程",
      "category": "functional",
      "priority": 1,
      "requirement_refs": ["REQ-001", "REQ-002", "REQ-004", "REQ-005"],
      "turns": ["帮我查一下这个月的话费账单"],
      "assertions": [
        { "type": "skill_loaded", "value": "bill-inquiry" },
        { "type": "tool_called", "value": "query_subscriber" },
        { "type": "tool_called", "value": "query_bill" },
        { "type": "tool_called_before", "value": "query_subscriber, query_bill" },
        { "type": "contains", "value": "账单" }
      ],
      "notes": "核心主路径测试"
    },
    {
      "id": "TC-002",
      "title": "查询上月账单-指定月份",
      "category": "functional",
      "priority": 2,
      "requirement_refs": ["REQ-002", "REQ-004", "REQ-005"],
      "turns": ["上个月的话费是多少钱"],
      "assertions": [
        { "type": "tool_called", "value": "query_bill" },
        { "type": "response_mentions_any", "value": "账单, 话费, 金额, 费用" }
      ]
    },
    {
      "id": "TC-003",
      "title": "不明扣费查询-费用解读后追问",
      "category": "functional",
      "priority": 1,
      "requirement_refs": ["REQ-003", "REQ-004", "REQ-006"],
      "turns": [
        "我账单里有个不认识的费用，帮我看看是什么",
        "这个视频包我没订过啊，帮我退掉"
      ],
      "assertions": [
        { "type": "tool_called", "value": "query_bill" },
        { "type": "contains", "value": "视频" }
      ],
      "notes": "多轮对话，从解读过渡到后续操作"
    },
    {
      "id": "TC-004",
      "title": "查完账单无问题-礼貌结束",
      "category": "state",
      "priority": 2,
      "requirement_refs": ["REQ-007"],
      "turns": [
        "查一下这个月话费",
        "好的我知道了，没问题，谢谢"
      ],
      "assertions": [
        { "type": "response_mentions_any", "value": "还有, 其他, 帮到, 再见" }
      ]
    },
    {
      "id": "TC-005",
      "title": "模糊表达-口语化查账",
      "category": "edge",
      "priority": 2,
      "requirement_refs": ["REQ-002"],
      "turns": ["话费多少钱"],
      "assertions": [
        { "type": "tool_called_any_of", "value": "query_subscriber, query_bill" }
      ],
      "notes": "极简口语输入，验证意图识别"
    },
    {
      "id": "TC-006",
      "title": "超出范围的请求",
      "category": "error",
      "priority": 3,
      "requirement_refs": ["REQ-001"],
      "turns": ["帮我办理宽带安装"],
      "assertions": [
        { "type": "tool_not_called", "value": "query_bill" },
        { "type": "response_mentions_any", "value": "抱歉, 无法, 其他, 转" }
      ],
      "notes": "验证不在技能范围内的请求不会误触发账单工具"
    }
  ]
}
```

### 要点说明

- TC-001 是 P1 核心路径，断言最完整（skill_loaded + tool_called + tool_called_before + contains）
- TC-003 是多轮对话（2 turns），测试从查询到后续操作的过渡
- TC-005 用极简输入测试意图识别的鲁棒性
- TC-006 是超范围请求的负面测试（tool_not_called）
- coverage_matrix 中每条 REQ 都被至少一个 TC 覆盖
