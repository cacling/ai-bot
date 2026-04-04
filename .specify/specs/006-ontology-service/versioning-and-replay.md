# 专题：模型版本迁移、运行时钉住与回放策略

**功能分支**: `006-ontology-service` | **日期**: 2026-04-04 | **规格说明**: [spec.md](spec.md)

---

## 1. 版本对象

至少区分：

- `schema_version`
- `domain_model_version`
- `runtime_projection_version`
- `execution_semantics_version`

---

## 2. 运行时绑定策略

### 2.1 `floating`

总是跟随当前激活版本。  
适用于浏览和默认视图。

### 2.2 `pinned`

创建时绑定具体版本。  
适用于：

- `plan_session`
- `action_draft`
- `execution_run`
- 事故复盘快照

### 2.3 `migratable`

可迁移但不自动迁移。  
适用于部分投影和长期存在对象。

---

## 3. ABox 两层

- `current projection`
- `snapshot projection`

前者服务当前运行与浏览，后者服务复盘、回放和导出。

---

## 4. migration policy

每次模型变更必须声明：

- `compatible_additive`
- `compatible_behavioral`
- `breaking_model`
- `breaking_execution`

---

## 5. Publish / Activate 分离

- `Publish`：成为可引用版本
- `Activate`：成为某租户/场景的新默认版本

---

## 6. replay 分类

- `semantic replay`
- `planning replay`
- `execution replay`

---

## 7. 决策清单

1. 版本分四类，不混用
2. `plan_session / action_draft / execution_run` 必须强钉住
3. ABox 分 current 与 snapshot
4. 模型变更必须声明 migration policy
5. Publish 与 Activate 分离
6. replay 分语义、规划、执行三类
7. 旧 draft 的可执行性取决于变更等级
8. current projection 升级采用后台 reproject
