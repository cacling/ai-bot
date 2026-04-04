# 专题：租户、安全、审批与脱敏模型

**功能分支**: `006-ontology-service` | **日期**: 2026-04-04 | **规格说明**: [spec.md](spec.md)

---

## 1. 总原则

> `ontology_service` 是高权限语义中枢，默认采用最小授权、多维权限控制和服务端脱敏。

---

## 2. 租户边界

所有核心资源必须 tenant-scoped：

- 模型版本
- 实例与关系
- 事件
- plan
- action draft
- execution
- graph projection
- audit

---

## 3. 权限维度

至少按四个维度建模：

- 资源
- 动作
- 领域
- 敏感级别

---

## 4. 角色建议

V1 固定八类角色：

- `ontology_modeler`
- `rule_admin`
- `ontology_arch_admin`
- `ops_supervisor`
- `execution_operator`
- `audit_officer`
- `domain_viewer`
- `tenant_admin`

---

## 5. 审批模型

至少分：

- 模型发布审批
- 模型激活审批
- 动作执行审批
- 高风险回滚审批

并按风险分为：

- `L1`
- `L2`
- `L3`

---

## 6. 脱敏模型

脱敏在服务端完成，适用于：

- API 响应
- 图谱节点与边
- 详情与审计视图

字段敏感级别建议：

- `public`
- `internal`
- `restricted`
- `sensitive`
- `high_sensitive`

---

## 7. AI 权限边界

AI 作为独立 actor：

- 可以解释和建议
- 不能发布、激活、审批、执行
- 不能绕过脱敏读取高敏数据

---

## 8. 决策清单

1. 最小授权是默认原则
2. 租户隔离是第一层边界
3. 权限按四个维度建模
4. V1 先固定八类角色
5. 审批至少分四类、三级风险
6. 脱敏由服务端完成
7. 图谱不同视图权限门槛不同
8. AI 只具备建议权，不具备生产控制权
