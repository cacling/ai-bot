# Manifest Schema 定义

> 本文档定义 Stage 1 输出（Requirement IR）和 Stage 2 输出（TestManifest）的完整字段规范。
> 引擎使用 Zod 做硬校验，此处的规范与 Zod schema 一一对应。

---

## Requirement IR（Stage 1 输出）

```typescript
interface Requirement {
  id: string;           // "REQ-001", "REQ-002", ...（连续编号）
  source: string;       // "frontmatter" | "trigger" | "tool" | "workflow"
  description: string;  // 用户视角的可测试需求描述
}
```

输出格式：纯 JSON 数组 `Requirement[]`

校验规则：
- `id` 必须以 `REQ-` 开头，后跟三位数字
- `source` 必须是四种来源之一
- `description` 不得为空
- 数组至少包含 1 个元素

---

## TestManifest（Stage 2 输出 → 引擎组装）

Stage 2 的 LLM 输出是 `Stage2Output`，引擎会将其与 meta 信息组装为完整的 `TestManifest`。

### Stage2Output（LLM 输出）

```typescript
interface Stage2Output {
  coverage_matrix?: Array<{     // 可选但推荐
    requirement_id: string;     // "REQ-001"
    covered_by: string[];       // ["TC-001", "TC-005"]
  }>;
  cases: TestCaseEntry[];       // 至少 1 条
}
```

### TestCaseEntry

```typescript
interface TestCaseEntry {
  id: string;                   // "TC-001", "TC-002", ...（连续编号）
  title: string;                // 简短描述，如"查询当月账单-正常流程"
  category: "functional" | "edge" | "error" | "state";
  priority: number;             // 1-3（1=最高）
  requirement_refs: string[];   // ["REQ-001", "REQ-003"]（至少一个）
  persona_id?: string;          // 可选，如 "arrears_user"
  turns: string[];              // 用户输入序列（至少一条）
  assertions: Assertion[];      // 断言列表（至少一条）
  notes?: string;               // 可选备注
}
```

### Assertion

```typescript
interface Assertion {
  type: string;   // 11 种允许的断言类型之一（见 assertion-catalog.md）
  value: string;  // 断言值（格式因类型而异）
}
```

校验规则：
- `category` 必须是四种之一
- `priority` 取值 1-3
- `requirement_refs` 至少一个元素
- `turns` 至少一个元素
- `assertions` 至少一个元素

---

## TestManifest（完整结构，引擎组装）

```typescript
interface TestManifest {
  meta: {
    skill_id: string;           // 技能 ID
    version_no: number;         // 版本号
    generated_at: string;       // ISO 时间戳
    source_checksum: string;    // SKILL.md 的 SHA-256 前 16 位
    generator_version: string;  // 生成器版本号
  };
  requirements: Requirement[];  // Stage 1 输出
  cases: TestCaseEntry[];       // Stage 2 输出
}
```

`meta` 由引擎填充，LLM 不需要生成。
