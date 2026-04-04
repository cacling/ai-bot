# 模型治理：本体建模、YAML 资产与 OWL 语义文件

**功能分支**: `006-ontology-service` | **日期**: 2026-04-04 | **规格说明**: [spec.md](spec.md)

> 本文档严格归纳参考材料中的成功经验，重点覆盖：  
> `M1-M7 + Event` 模型组织方式、`TBox / ABox` 分层、YAML 到 OWL 的关系、以及运营管理中的本体建模治理方式。

---

## 1. 参考结论

根据资料中的文字和配图，可以明确抽取出以下结论：

1. 本体建模的核心是：
   - 对象建模
   - 行为建模
   - 规则建模
2. 本体建模必须采用两层语义结构：
   - `TBox` 抽象层
   - `ABox` 实例层
3. 设计态应先沉淀为多份 YAML 模型文件
4. 完成后可转换成标准 OWL 语义文件并导入 Protégé / WebVOWL 查看
5. UI 模型不是核心本体，应与业务本体分层管理

这些结论直接来自以下资料：

- 跨越鸿沟本体论建模与AI原生应用-从数据孤岛到企业AI语义操作系统的革命（外部参考资料）
- 本体模型-AI原生应用UI建模规范与原型实践总结（外部参考资料）

---

## 2. 设计真相源

### 2.1 建议原则

`ontology_service` 不应把 OWL 当成手工主维护文件。  
更贴近参考材料的方式是：

> **YAML 模型文件是设计真相源**  
> **OWL 是标准语义发布件 / 浏览件**

### 2.2 治理链路

建议采用以下链路：

`YAML 模型文件`
-> `Model Registry 解析与校验`
-> `编译成运行时元数据`
-> `导出 OWL`
-> `Protégé / WebVOWL 浏览与校验`
-> `运行态根据活动模型版本生成 ABox 快照`

---

## 3. YAML 模型文件组织

参考资料中的 `M1-M7 + Event` 组织方式，建议目录结构如下：

```text
ontology-models/
  contact-center/
    manifest.yaml
    m1-object-model.yaml
    m2-behavior-model.yaml
    m3-rule-model.yaml
    m4-scenario-model.yaml
    m5-actor-model.yaml
    m6-compensation-model.yaml
    m7-quality-model.yaml
    event-model.yaml
```

### 3.1 各文件职责

| 文件 | 职责 |
|---|---|
| `m1-object-model.yaml` | 对象、属性、关系、聚合根 |
| `m2-behavior-model.yaml` | 行为、状态迁移、前后置条件 |
| `m3-rule-model.yaml` | 规则、约束、校验、优先级 |
| `m4-scenario-model.yaml` | 场景模板与场景步骤 |
| `m5-actor-model.yaml` | 角色、权限、审批主体 |
| `m6-compensation-model.yaml` | 回滚、补偿、人工接管 |
| `m7-quality-model.yaml` | SLA、AHT、放弃率、风险等质量约束 |
| `event-model.yaml` | 事件类型、事件链、订阅关系 |

---

## 4. OWL 文件组织

建议把 OWL 作为发布件输出为以下结构：

```text
owl/
  contact-center-ontology.owl
  ontology-metamodel.owl
  m1-object-model.owl
  m2-behavior-model.owl
  m3-rule-model.owl
  m4-scenario-model.owl
  m5-actor-model.owl
  m6-compensation-model.owl
  m7-quality-model.owl
  event-model.owl
  abox/
    runtime-current.owl
    incident-2026-04-04-1015.owl
```

### 4.1 根本体

`contact-center-ontology.owl` 负责统一 imports：

- `ontology-metamodel.owl`
- `m1-object-model.owl`
- `m2-behavior-model.owl`
- `m3-rule-model.owl`
- `m4-scenario-model.owl`
- `m5-actor-model.owl`
- `m6-compensation-model.owl`
- `m7-quality-model.owl`
- `event-model.owl`

### 4.2 ABox 快照

`abox/*` 用于：

- 当前运行时实例快照
- 某次场景模拟快照
- 某个事件窗口的实例导出

注意：

- `ABox` 不应和主 `TBox` 文件混在一起长期维护
- `ABox` 应被视为运行态导出件，而非设计态真相源

---

## 5. YAML 到 OWL 的映射建议

### 5.1 `m1-object-model`

映射为：

- `Class`
- `ObjectProperty`
- `DatatypeProperty`
- `domain / range`
- 基本约束

### 5.2 `m2-behavior-model`

映射为：

- `BehaviorDefinition`
- `Precondition`
- `Postcondition`
- `StateTransition`

这里不建议把复杂行为完全压成纯 OWL 公理。  
更适合把行为定义成可被运行时解释的语义对象。

### 5.3 `m3-rule-model`

映射为：

- `RuleDefinition`
- `ValidationRule`
- `PolicyRule`
- `PriorityRule`
- `ComplianceRule`

复杂运营规则仍应由运行时规则引擎解释，OWL 负责语义表达和可视化承载。

### 5.4 `m4-m7` 与 `event-model`

映射为：

- 场景定义
- 角色与权限主体
- 补偿策略
- 质量指标与阈值
- 事件类型与依赖链

---

## 6. Model Registry 的治理流程

建议采用以下标准流程：

1. `Draft`
2. `Validate`
3. `Review`
4. `Publish`
5. `Activate`
6. `Rollback`

### 6.1 Validate 阶段必须检查

- 类型定义重复
- 关系两端是否合法
- 属性类型是否一致
- 规则引用的对象/属性是否存在
- 行为依赖的事件和规则是否存在
- 场景链路是否可闭合

### 6.2 Publish / Activate 阶段必须保留

- 发布版本
- 激活租户
- 发布人 / 审批人
- 影响范围
- 回滚目标版本

---

## 7. UI 编辑器与 OWL 的关系

参考资料中的编辑器经验，建议把编辑器定位为：

> **对 YAML 模型文件的可视化编辑器**

而不是：

- 手工直接改 OWL
- 手工直接改运行时实例
- UI 页面即模型真相源

### 7.1 正确关系

- YAML 是设计真相源
- 编辑器负责可视化编辑 YAML
- OWL 负责标准语义导出和浏览
- Runtime 负责运行时投影和实例事实

### 7.2 UI 模型边界

`m9-ui-model.yaml` 可以消费业务本体，但不属于核心本体文件。  
这与参考资料中的结论一致：UI 是交互媒介，不应进入核心业务本体。

---

## 8. 本体建模治理决策清单

1. 采用 `M1-M7 + Event` 组织方式
2. 设计真相源为 YAML，不直接手改 OWL
3. OWL 作为标准发布件和可视化浏览件
4. `TBox` 与 `ABox` 严格分层
5. UI 模型与业务本体分层治理
6. 运行时规则执行仍由服务内核承担，不把复杂规则强行外包给 OWL reasoner
