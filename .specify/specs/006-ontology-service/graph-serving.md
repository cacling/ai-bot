# 专题：图投影、查询 API 与大图性能策略

**功能分支**: `006-ontology-service` | **日期**: 2026-04-04 | **规格说明**: [spec.md](spec.md)

---

## 1. 总原则

> 图层是 traversal / explanation projection，不是唯一真值。

---

## 2. V1 物理结构

建议采用：

- `graph_nodes`
- `graph_edges`
- `graph_adjacency`
- `graph_scenario_paths`

---

## 3. 四类图视图

- `TBox`
- `ABox`
- `Overlay`
- `Scenario`

---

## 4. 图服务 API

建议最少提供：

- `GET /v1/graph/view`
- `GET /v1/graph/nodes/{node_id}/neighbors`
- `POST /v1/graph/path`
- `POST /v1/graph/impact`
- `GET /v1/graph/scenario-runs/{scenario_run_id}`

---

## 5. 默认裁剪策略

- 默认不返回全量图
- 默认限制 depth
- 默认限制 node / edge 上限
- 默认以聚合根或场景为中心

---

## 6. 查询路径

- 一跳/二跳查询：走 adjacency
- 最短路径：在局部子图中做 bounded traversal
- 影响分析：按受限 edge kind 和 max depth 做局部遍历

---

## 7. 决策清单

1. 图层是服务视图，不是唯一真值
2. V1 采用关系库图投影结构
3. 图视图分四类
4. 图 API 以子图查询为中心
5. 默认启用裁剪策略
6. 路径和影响分析都做 bounded traversal
7. 图投影增量更新为主
8. 图数据库不是 V1 前提
