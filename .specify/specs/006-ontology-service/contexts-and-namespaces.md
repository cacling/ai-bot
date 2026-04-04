# 专题：本体 namespace、bounded context 与模块化 import 策略

**功能分支**: `006-ontology-service` | **日期**: 2026-04-04 | **规格说明**: [spec.md](spec.md)

---

## 1. 总原则

> One semantic language, multiple bounded ontologies

统一语义语言，但按领域拆分本体模块。

---

## 2. 推荐 bounded context

至少拆分为：

- `shared`
- `customer`
- `interaction`
- `workforce`
- `ticketing`
- `knowledge`
- `integration`
- `incident-response`

---

## 3. namespace 设计

建议按稳定业务域命名，例如：

- `.../ontology/shared#`
- `.../ontology/customer#`
- `.../ontology/interaction#`
- `.../ontology/workforce#`
- `.../ontology/ticketing#`
- `.../ontology/knowledge#`
- `.../ontology/integration#`
- `.../ontology/incident-response#`

---

## 4. import 策略

- 各域可 import `shared`
- `incident-response` 可 import 多个业务域
- 跨域 canonical relation 优先放在 `integration`
- 禁止无控制横向乱 import

---

## 5. 文件组织

采用：

> 按 context 分目录 + 每个 context 按 `M1-M7 + Event` 分文件

---

## 6. 决策清单

1. 不做超级大共享本体
2. namespace 按业务域，不按技术实现名
3. `shared` 只放少量跨域基础概念
4. `integration` 专门管理跨域关系
5. `incident-response` 作为 orchestration context
6. 文件组织按 context + model family 双层划分
7. review 与发布都必须考虑 context 边界
8. 跨域关系必须显式治理，不能自由扩散
