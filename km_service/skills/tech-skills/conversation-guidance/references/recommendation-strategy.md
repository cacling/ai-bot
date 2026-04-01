# 推荐策略

## 候选池生成

来源：
- 已发布 `biz-skills` 的元数据（name, description, tags, triggerKeywords）
- 当前渠道可用的 skill（按 channels 过滤）
- 预定义的推荐模板（suggestion-templates.json）

## 排序规则

一期采用模板固定排序，优先级：
1. 高频场景优先（账单查询 > 故障诊断 > 套餐推荐）
2. 高风险动作降权（退订类不放首位）
3. 转人工始终末位

## 数量控制

- 最多 6 条推荐（含转人工）
- 如果可用 skill 不足 6 个，按实际数量展示
- 至少保留 1 条转人工选项

## 去重规则

- 同一 skill 不重复推荐
- label 文案不重复

## 兜底策略

- 无已发布 skill 时：返回通用推荐（"有什么可以帮您？" + 转人工）
- 模板加载失败时：返回 i18n 中的静态 fallback
