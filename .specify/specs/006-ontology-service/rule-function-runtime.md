# 专题：规则引擎、函数引擎与 OWL 执行边界

**功能分支**: `006-ontology-service` | **日期**: 2026-04-04 | **规格说明**: [spec.md](spec.md)

---

## 1. 总原则

> 本体模型层负责表达语义  
> 规则/函数运行时负责执行语义  
> OWL 负责标准化表达、浏览与校验辅助  
> OWL 不是生产执行主引擎

---

## 2. 角色分工

### 2.1 模型层

负责：

- 对象、关系、规则、函数、动作模板定义
- 版本管理
- 输入输出契约声明

### 2.2 OWL 层

负责：

- 标准语义发布件
- Protégé / WebVOWL 浏览
- 形式化校验辅助
- ABox 快照导出

不负责：

- 在线规则执行
- 在线预测函数
- 在线写回决策

### 2.3 规则引擎

负责：

- Validation Rules
- Policy Rules
- Compliance Rules
- Structural Rules

### 2.4 函数引擎

负责：

- calculation functions
- forecast functions
- evaluation functions

---

## 3. V1 执行方式

V1 建议采用：

> **声明式模型 + 内建 TypeScript handler registry**

模型中只声明：

- `rule_id / function_id`
- `type`
- `scope`
- `input_schema / output_schema`
- `handler`
- 解释信息

运行时通过 handler registry 执行，不把复杂逻辑压到纯 OWL 或通用 DSL 中。

---

## 4. 规则与函数边界

### 4.1 规则回答

- 能不能
- 应不应该
- 合不合法
- 谁优先

### 4.2 函数回答

- 现在是多少
- 将来会是多少
- 成本和质量如何权衡

---

## 5. 执行顺序

建议固定为：

1. 投影时规则
2. 规划前规则
3. 方案生成时规则
4. 执行前规则
5. 执行后规则

函数主要参与：

- 状态计算
- 预测
- 方案评估

---

## 6. 决策清单

1. YAML/Registry 是设计与执行桥梁
2. OWL 不是在线业务主执行引擎
3. 规则与函数严格分离
4. V1 不先做通用 DSL
5. 函数必须无副作用、可版本化、可回放
6. Planner 只做组合与排序，不内嵌业务真规则
