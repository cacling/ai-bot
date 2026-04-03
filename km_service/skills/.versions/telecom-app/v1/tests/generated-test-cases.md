# 测试用例 — telecom-app v1

> 自动生成于 2026-04-02T10:22:23.666Z | source_checksum: `c964f45cfdac085c` | generator: v1.1

## Overview

- 需求数: 20
- 用例数: 11
- 分类: functional(6) / edge(1) / error(2) / state(2)

## Requirements

- **REQ-001** [frontmatter]: 技能应仅处理 App 登录、闪退、安装更新、设备安全与页面技术异常，不处理账单解读、套餐咨询、业务退订等业务问题
- **REQ-002** [trigger]: 当用户反映 App 无法打开、闪退、卡顿时，应触发 app_crash 类型的诊断流程
- **REQ-003** [trigger]: 当用户无法登录（密码错误、OTP 未收到、账号被锁）时，应触发 login_issue 类型的处理流程
- **REQ-004** [trigger]: 当用户报告 App 内功能异常（如查话费、缴费、办理业务页面报错或无响应）时，应触发 feature_error 类型的排查流程
- **REQ-005** [trigger]: 当用户无法安装 App 或无法升级至新版本时，应触发 install_update 类型的引导流程
- **REQ-006** [trigger]: 当 App 提示设备环境异常、安全检测不通过，或账号显示可疑活动、被风控限制时，应触发 security_check 类型的安全诊断
- **REQ-007** [trigger]: 当用户询问附近营业厅地址、线下网点位置或如何前往营业厅时，应触发 store_locator 类型的位置服务流程
- **REQ-008** [workflow]: 系统应在接收问题后根据用户描述准确分类 issue_type，并进入对应的子流程（app_crash / login_issue / feature_error / install_update / security_check / store_locator）
- **REQ-009** [workflow]: 对于 app_crash 问题，应先检查 App 版本，若版本过旧则引导更新；若版本正常则引导清缓存、重启、清存储，并在无效时升级 frontline
- **REQ-010** [workflow]: 对于 login_issue 问题，应根据具体子类型（密码错误、OTP 未达、账号锁定、生物识别失败）分别引导重置密码、OTP 排查、安全诊断或重新录入生物特征
- **REQ-011** [tool]: 涉及账号安全或设备风险的登录问题，必须调用 diagnose_app 工具获取诊断结果，不得凭空推断
- **REQ-012** [workflow]: 对于 feature_error 问题，应先确认具体异常类型（页面/按钮/支付/账号状态），再针对性排查网络、版本、缓存或账户状态
- **REQ-013** [tool]: 当 feature_error 涉及账号状态异常提示时，必须先调用 query_subscriber 工具核实用户真实状态，再决定是否引导缴费或继续排查
- **REQ-014** [workflow]: 对于 install_update 问题，应引导用户检查系统版本、存储空间和网络，并在自助无效时提供官方下载渠道
- **REQ-015** [workflow]: 对于 security_check 问题，必须调用 diagnose_app 工具执行安全诊断，并根据风险等级决定是告知硬性限制、引导修复还是升级 security_team
- **REQ-016** [workflow]: 当 diagnose_app 返回设备存在 Root/模拟器等硬性限制时，若用户否认，应升级 frontline 人工核查设备状态
- **REQ-017** [workflow]: 对于 store_locator 问题，应先获取用户位置，再调用 maps_around_search 搜索附近营业厅，并可按需调用 maps_direction_walking 提供步行导航
- **REQ-018** [workflow]: 所有问题处理流程中，若用户表示问题已解决，应礼貌结束对话；若未解决，应统一升级 frontline
- **REQ-019** [workflow]: 用户在任何阶段要求转人工时，应立即转接人工客服并结束流程
- **REQ-020** [boundary]: 当用户提到'App 里 XXX 不行'时，应先澄清是 App 技术故障还是业务操作问题，仅在确认为技术故障时才进入本技能流程

## Functional Tests

### TC-001: App 闪退问题处理流程

- **Priority**: P1
- **Requirements**: REQ-002, REQ-008, REQ-009
- **Turns**:
  1. "App 一打开就闪退，根本进不去"
- **Assertions**:
  - `tool_called`: diagnose_app
  - `response_mentions_any`: 版本, 更新, 缓存, 重启
  - `contains`: 闪退

### TC-002: 登录失败（OTP 未收到）处理流程

- **Priority**: P1
- **Requirements**: REQ-003, REQ-008, REQ-010, REQ-011
- **Turns**:
  1. "登录时收不到验证码，试了好几次都没收到"
- **Assertions**:
  - `tool_called`: diagnose_app
  - `response_mentions_any`: 验证码, 手机号, 等待, 切换
  - `not_contains`: 密码

### TC-003: 功能异常（查话费页面报错）处理流程

- **Priority**: P1
- **Requirements**: REQ-004, REQ-008, REQ-012, REQ-013
- **Turns**:
  1. "App 里查话费页面一直报错，打不开"
- **Assertions**:
  - `tool_called`: query_subscriber
  - `response_mentions_all`: 网络, 版本, 缓存
  - `contains`: 查话费

### TC-004: App 更新失败处理流程

- **Priority**: P2
- **Requirements**: REQ-005, REQ-008, REQ-014
- **Turns**:
  1. "App 提示要更新，但应用商店点更新没反应"
- **Assertions**:
  - `response_mentions_all`: 系统版本, 存储空间, 网络
  - `response_mentions_any`: 下载, 官方, 商店

### TC-005: 设备安全检测不通过处理流程

- **Priority**: P1
- **Requirements**: REQ-006, REQ-008, REQ-011, REQ-015
- **Turns**:
  1. "App 提示我的设备不安全，不让登录"
- **Assertions**:
  - `tool_called`: diagnose_app
  - `response_mentions_any`: Root, 模拟器, VPN, 安全

### TC-008: 营业厅位置查询完整流程

- **Priority**: P2
- **Requirements**: REQ-007, REQ-008, REQ-017
- **Turns**:
  1. "最近的电信营业厅在哪"
  2. "我在北京市朝阳区国贸附近"
- **Assertions**:
  - `tool_called`: maps_around_search
  - `response_mentions_any`: 营业厅, 地址, 位置

## Edge Case Tests

### TC-009: 硬性限制反馈后用户否认，升级人工核查

- **Priority**: P2
- **Requirements**: REQ-016
- **Turns**:
  1. "App 说我设备 Root 了，但我没 Root 过"
  2. "我不接受这个说法，请人工核实"
- **Assertions**:
  - `tool_called`: diagnose_app
  - `response_mentions_any`: 人工, 核实, 升级, 前线

## Error Tests

### TC-006: 边界场景：用户想查账单但误入本技能

- **Priority**: P2
- **Requirements**: REQ-001, REQ-020
- **Turns**:
  1. "App 里查不了话费，帮我看看怎么回事"
- **Assertions**:
  - `contains`: 是 App 本身出了故障
  - `tool_not_called`: diagnose_app
  - `tool_not_called`: query_subscriber
- **Notes**: 验证高冲突场景澄清逻辑

### TC-007: 边界场景：用户想退订业务但误入本技能

- **Priority**: P2
- **Requirements**: REQ-001, REQ-020
- **Turns**:
  1. "App 里退订不了视频包，怎么办"
- **Assertions**:
  - `contains`: 是 App 本身出了故障
  - `tool_not_called`: diagnose_app
  - `response_mentions_any`: 业务, 退订, 转

## State Tests

### TC-010: 问题解决后礼貌结束对话

- **Priority**: P2
- **Requirements**: REQ-018
- **Turns**:
  1. "App 登录不了"
  2. "好的，我重置密码后可以登录了，谢谢"
- **Assertions**:
  - `response_mentions_any`: 还有, 其他, 帮到, 再见

### TC-011: 用户中途要求转人工

- **Priority**: P1
- **Requirements**: REQ-019
- **Turns**:
  1. "App 闪退"
  2. "我不想自己操作了，直接转人工吧"
- **Assertions**:
  - `response_mentions_any`: 转接, 人工客服, 稍等
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
| REQ-008 | TC-001, TC-002, TC-003, TC-004, TC-005, TC-008 |
| REQ-009 | TC-001 |
| REQ-010 | TC-002 |
| REQ-011 | TC-002, TC-005 |
| REQ-012 | TC-003 |
| REQ-013 | TC-003 |
| REQ-014 | TC-004 |
| REQ-015 | TC-005 |
| REQ-016 | TC-009 |
| REQ-017 | TC-008 |
| REQ-018 | TC-010 |
| REQ-019 | TC-011 |
| REQ-020 | TC-006, TC-007 |
