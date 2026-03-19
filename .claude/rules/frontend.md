---
paths:
  - "frontend/src/**"
---
<!-- auto-generated on 2026-03-19 from standards.md -->

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

- **不要**在前端组件中直接调用后端 URL，统一通过 `api.ts` 辅助函数

