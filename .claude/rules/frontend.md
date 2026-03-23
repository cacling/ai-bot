---
paths:
  - "frontend/src/**"
---
<!-- auto-generated on 2026-03-23 from standards.md -->

# 前端编码规则

### 前端命名约定

| 场景 | 风格 | 示例 |
|------|------|------|
| React 组件 | PascalCase | `EmotionContent`、`CardPanel` |
| 接口 | PascalCase | `EmotionData`、`HandoffContext` |

### 前端导出风格

| 模块类型 | 导出方式 |
|---------|---------|
| React 组件 | `export const XxxContent = memo(function XxxContent(...) { ... })` |
| API 辅助函数 | `export async function fetchXxx()` |

### 前端 UI 组件规范

- **组件库**：统一使用 shadcn/ui（`@/components/ui/`），禁止使用原生 HTML 表单元素（`<button>`、`<input>`、`<select>`、`<textarea>`、`<table>` 等）
- **配色**：统一使用 shadcn 语义色变量（`text-primary`、`bg-destructive`、`border-border` 等），禁止硬编码 Tailwind 色值（如 `text-red-500`、`bg-blue-600`）
- **例外**：数据可视化（如情绪渐变条）可保留具体色值
- **路径别名**：组件导入使用 `@/components/ui/xxx`（`@/` 指向 `src/`）
- **已安装组件**：Button, Input, Textarea, Select, Checkbox, RadioGroup, Label, Badge, Card, Table, Tabs, Dialog, Alert, Separator

- **不要**在前端组件中直接调用后端 URL，统一通过 `api.ts` 辅助函数

