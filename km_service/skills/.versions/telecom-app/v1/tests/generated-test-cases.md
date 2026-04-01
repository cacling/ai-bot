# 测试用例 — telecom-app v1

> 自动生成于 2026-03-31T16:25:09.670Z | source_checksum: `c964f45cfdac085c` | generator: v1.1

## Overview

- 需求数: 21
- 用例数: 10
- 分类: functional(6) / edge(1) / error(1) / state(2)

## Requirements

- **REQ-001** [frontmatter]: 技能应仅处理 App 登录、闪退、安装更新、设备安全与页面技术异常，不处理账单解读、套餐咨询、业务退订等业务问题
- **REQ-002** [trigger]: 当用户反映 App 无法打开、闪退、卡顿时，应进入 app_crash 问题处理流程
- **REQ-003** [trigger]: 当用户无法登录（密码错误、OTP 未收到、账号被锁）时，应进入 login_issue 问题处理流程
- **REQ-004** [trigger]: 当用户报告 App 内功能异常（查话费、缴费、办理业务等页面报错或无响应）时，应进入 feature_error 问题处理流程
- **REQ-005** [trigger]: 当用户无法安装 App 或无法升级至新版本时，应进入 install_update 问题处理流程
- **REQ-006** [trigger]: 当 App 提示设备环境异常、安全检测不通过，或账号显示可疑活动、被风控限制时，应进入 security_check 问题处理流程
- **REQ-007** [trigger]: 当用户询问附近营业厅地址、线下网点位置或如何前往营业厅时，应进入 store_locator 问题处理流程
- **REQ-008** [workflow]: 对于高冲突场景（如'App 里查不了话费'），应先澄清是 App 技术问题还是业务需求，仅在确认为 App 技术问题时继续本技能
- **REQ-009** [tool]: 系统应根据客户描述准确分类 issue_type，并调用相应工具进行诊断或查询
- **REQ-010** [tool]: 对于安全类问题和登录中涉及安全的场景，应使用 diagnose_app 工具执行安全诊断，不得凭空猜测设备状态
- **REQ-011** [tool]: 对于功能异常中涉及账号状态的问题，应先调用 query_subscriber 工具核实账号状态，再给出处理建议
- **REQ-012** [tool]: 对于营业厅查询请求，应先获取用户位置，再调用 maps_around_search 工具搜索附近营业厅
- **REQ-013** [workflow]: TC1_闪退流程中，应先检查 App 版本，版本过旧则引导更新，版本正常则引导清缓存、重启、清存储
- **REQ-014** [workflow]: TC2_登录流程中，应根据不同登录问题类型（账号被锁、密码错误、OTP 未收到、生物识别失败）提供针对性处理方案
- **REQ-015** [workflow]: TC3_功能异常流程中，应先确认具体异常类型（页面/按钮/支付/账号），再进行针对性排查
- **REQ-016** [workflow]: TC4_安装更新流程中，应先进行基础排查（系统版本、存储空间、网络），仍失败则提供官方下载渠道
- **REQ-017** [workflow]: TC5_安全流程中，应先调用 diagnose_app 进行安全诊断，根据诊断结果区分高风险、硬性限制和可修复情况
- **REQ-018** [workflow]: 对于硬性限制（如 Root 或模拟器），应告知用户须使用正常设备，若用户声明未 Root 则升级 frontline 人工核查
- **REQ-019** [workflow]: 所有问题处理流程中，若自助解决方案无效，应升级至相应路径（frontline 或 security_team）
- **REQ-020** [workflow]: 所有问题解决路径最后应确认问题是否已解决，用户确认解决则结束对话，否则升级 frontline
- **REQ-021** [workflow]: 用户可随时要求转人工，系统应立即转接人工客服

## Functional Tests

### TC-001: App 闪退 - 正常流程（版本过旧）

- **Priority**: P1
- **Requirements**: REQ-002, REQ-009, REQ-013, REQ-020
- **Turns**:
  1. "App 一打开就闪退，根本进不去"
- **Assertions**:
  - `tool_called_any_of`: diagnose_app, query_subscriber
  - `contains`: 版本
  - `response_mentions_any`: 更新, 升级, 应用商店
  - `response_has_next_step`: 

### TC-002: 登录失败 - OTP 未收到

- **Priority**: P1
- **Requirements**: REQ-003, REQ-009, REQ-014, REQ-020
- **Turns**:
  1. "登录时收不到验证码，试了好几次都没收到"
- **Assertions**:
  - `contains`: 验证码
  - `response_mentions_all`: 手机号, 等待, 重发
  - `not_contains`: 密码
  - `response_has_next_step`: 

### TC-003: 功能异常 - 查话费页面报错（账号状态正常）

- **Priority**: P1
- **Requirements**: REQ-004, REQ-009, REQ-011, REQ-015, REQ-020
- **Turns**:
  1. "App 里查话费一直报错，页面打不开"
- **Assertions**:
  - `tool_called`: query_subscriber
  - `contains`: 网络
  - `response_mentions_any`: 缓存, 重启, 版本
  - `response_has_next_step`: 

### TC-004: 安装失败 - 存储空间不足

- **Priority**: P2
- **Requirements**: REQ-005, REQ-009, REQ-016, REQ-020
- **Turns**:
  1. "App 装不上，提示存储空间不够"
- **Assertions**:
  - `contains`: 空间
  - `response_mentions_any`: 清理, 删除, 应用商店
  - `response_has_next_step`: 

### TC-005: 安全检测不通过 - 设备 Root

- **Priority**: P1
- **Requirements**: REQ-006, REQ-009, REQ-010, REQ-017, REQ-020
- **Turns**:
  1. "App 提示设备不安全，说我用了 Root"
- **Assertions**:
  - `tool_called`: diagnose_app
  - `contains`: Root
  - `response_mentions_any`: 正常设备, 非Root
  - `response_has_next_step`: 

### TC-008: 营业厅查询 - 获取位置后搜索

- **Priority**: P2
- **Requirements**: REQ-007, REQ-009, REQ-012
- **Turns**:
  1. "最近的电信营业厅在哪？"
  2. "我在北京市朝阳区国贸"
- **Assertions**:
  - `tool_called`: maps_around_search
  - `contains`: 营业厅
  - `response_mentions_any`: 地址, 距离, 导航

## Edge Case Tests

### TC-006: 高冲突场景 - App 里查不了话费（实为账单咨询）

- **Priority**: P2
- **Requirements**: REQ-001, REQ-008
- **Turns**:
  1. "App 里查不了话费，我想知道这个月花了多少钱"
- **Assertions**:
  - `contains`: 是 App 本身出了故障
  - `tool_not_called`: query_subscriber
  - `not_contains`: 账单金额

## Error Tests

### TC-007: 超出范围请求 - 套餐变更咨询

- **Priority**: P3
- **Requirements**: REQ-001
- **Turns**:
  1. "我想把套餐改成 59 元的，App 里找不到入口"
- **Assertions**:
  - `tool_not_called_any_of`: diagnose_app, query_subscriber, maps_around_search
  - `response_mentions_any`: 套餐变更, plan-inquiry

## State Tests

### TC-009: 硬性限制 - 用户声明未 Root

- **Priority**: P2
- **Requirements**: REQ-018, REQ-019
- **Turns**:
  1. "App 说我设备 Root 了，但我没 Root 过"
  2. "我不接受这个说法"
- **Assertions**:
  - `contains`: 人工核查
  - `response_mentions_any`: frontline, 客服, 工单

### TC-010: 用户中途要求转人工

- **Priority**: P1
- **Requirements**: REQ-019, REQ-021
- **Turns**:
  1. "App 登录不了"
  2. "算了，直接转人工吧"
- **Assertions**:
  - `contains`: 正在为您转接人工客服
  - `tool_not_called`: diagnose_app

## Coverage Matrix

| Requirement | Covered By |
|-------------|------------|
| REQ-001 | TC-006, TC-007 |
| REQ-002 | TC-001 |
| REQ-003 | TC-002 |
| REQ-004 | TC-003 |
| REQ-005 | TC-004 |
| REQ-006 | TC-005 |
| REQ-007 | TC-008 |
| REQ-008 | TC-006 |
| REQ-009 | TC-001, TC-002, TC-003, TC-004, TC-005, TC-008 |
| REQ-010 | TC-005 |
| REQ-011 | TC-003 |
| REQ-012 | TC-008 |
| REQ-013 | TC-001 |
| REQ-014 | TC-002 |
| REQ-015 | TC-003 |
| REQ-016 | TC-004 |
| REQ-017 | TC-005 |
| REQ-018 | TC-009 |
| REQ-019 | TC-009, TC-010 |
| REQ-020 | TC-001, TC-002, TC-003, TC-004, TC-005 |
| REQ-021 | TC-010 |
