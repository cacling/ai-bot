# 测试用例 — telecom-app v1

> 自动生成于 2026-04-02T06:48:17.342Z | source_checksum: `c964f45cfdac085c` | generator: v1.1

## Overview

- 需求数: 26
- 用例数: 13
- 分类: functional(7) / edge(2) / error(3) / state(1)

## Requirements

- **REQ-001** [frontmatter]: 技能应仅处理 App 登录、闪退、安装更新、设备安全与页面技术异常，不处理账单解读、套餐咨询、业务退订等业务问题
- **REQ-002** [trigger]: 客户反映 App 无法打开、闪退、卡顿时应触发本技能
- **REQ-003** [trigger]: 客户无法登录（密码错误、OTP 未收到、账号被锁）时应触发本技能
- **REQ-004** [trigger]: App 内功能异常（查话费、缴费、办理业务等页面报错或无响应）时应触发本技能
- **REQ-005** [trigger]: 客户无法安装 App 或无法升级至新版本时应触发本技能
- **REQ-006** [trigger]: App 提示设备环境异常、安全检测不通过时应触发本技能
- **REQ-007** [trigger]: 账号显示可疑活动、被风控限制或疑似被盗时应触发本技能
- **REQ-008** [trigger]: 客户询问附近营业厅地址、线下网点位置、如何前往营业厅时应触发本技能
- **REQ-009** [workflow]: 系统应根据客户描述准确分类问题类型为 app_crash、login_issue、feature_error、install_update、security_check 或 store_locator
- **REQ-010** [tool]: 对于 security_check 和登录安全相关场景，系统应调用 diagnose_app 工具执行安全诊断并获取诊断结果
- **REQ-011** [workflow]: 对于 app_crash 问题，系统应先检查 App 版本，版本过旧则引导更新，版本正常则引导清缓存、重启、清存储
- **REQ-012** [workflow]: 对于 login_issue 问题，系统应根据具体场景分别处理：账号被锁进行安全诊断、密码错误引导重置、OTP 未收到进行排查、生物识别失败引导重新设置
- **REQ-013** [workflow]: 对于 feature_error 问题，系统应先确认具体异常类型（页面/按钮/支付/账号状态），再针对性排查
- **REQ-014** [tool]: 对于 feature_error 中的账号状态异常，系统应调用 query_subscriber 工具核实用户账号状态
- **REQ-015** [workflow]: 对于 install_update 问题，系统应引导客户检查系统版本、存储空间、网络，并在失败时提供官方下载渠道
- **REQ-016** [workflow]: 对于 security_check 问题，系统应调用 diagnose_app 工具进行安全诊断，并根据风险等级采取不同处理措施
- **REQ-017** [tool]: 对于 store_locator 问题，系统应调用 maps_around_search 工具搜索附近营业厅，并可根据用户需求调用 maps_direction_walking 规划路线
- **REQ-018** [workflow]: 所有问题处理流程中，用户要求转人工时应立即转接人工客服
- **REQ-019** [workflow]: 所有问题解决路径后应确认用户问题是否已解决，未解决则升级 frontline
- **REQ-020** [workflow]: 对于高风险安全场景（Root/永久锁定/诈骗嫌疑/屏幕共享），系统应升级 security_team 并进行反诈提醒
- **REQ-021** [workflow]: 对于设备硬性限制（Root或模拟器），系统应告知用户须使用正常设备，并在用户声明未Root时升级 frontline 人工核查
- **REQ-022** [compliance]: 系统不得凭空猜测设备状态，安全诊断数据必须通过 diagnose_app 工具获取
- **REQ-023** [compliance]: 系统不得向客户索要密码、OTP 验证码内容或完整身份证号码
- **REQ-024** [compliance]: 系统不得未经用户确认擅自执行账号变更操作
- **REQ-025** [compliance]: 系统不得未经 query_subscriber 核实就直接断言账户欠费/停机
- **REQ-026** [compliance]: OTP 场景中系统不得反复引导重发超过 2 次，仍失败应切换验证方式或升级

## Functional Tests

### TC-001: App 闪退 - 正常版本引导清缓存

- **Priority**: P1
- **Requirements**: REQ-002, REQ-009, REQ-011, REQ-019
- **Turns**:
  1. "App 一打开就闪退，根本进不去"
- **Assertions**:
  - `contains`: 缓存
  - `contains`: 重启
  - `response_has_next_step`: 
  - `tool_not_called`: diagnose_app

### TC-002: 登录失败 - 密码错误引导重置

- **Priority**: P1
- **Requirements**: REQ-003, REQ-009, REQ-012, REQ-019, REQ-024
- **Turns**:
  1. "密码明明是对的，但就是登不进去"
- **Assertions**:
  - `contains`: 忘记密码
  - `not_contains`: 重置您的密码
  - `response_has_next_step`: 

### TC-003: 功能异常 - 页面白屏加载失败

- **Priority**: P1
- **Requirements**: REQ-004, REQ-009, REQ-013, REQ-019
- **Turns**:
  1. "查话费页面一直白屏，啥也看不到"
- **Assertions**:
  - `contains`: 网络
  - `contains`: 缓存
  - `response_has_next_step`: 

### TC-004: 安装更新失败 - 引导检查空间和网络

- **Priority**: P2
- **Requirements**: REQ-005, REQ-009, REQ-015, REQ-019
- **Turns**:
  1. "App 更新一直失败，提示下载错误"
- **Assertions**:
  - `response_mentions_all`: 存储空间,网络,应用商店
  - `response_has_next_step`: 

### TC-005: 安全检测不通过 - 调用 diagnose_app 获取诊断结果

- **Priority**: P1
- **Requirements**: REQ-006, REQ-009, REQ-010, REQ-016, REQ-019, REQ-022
- **Turns**:
  1. "App 提示设备环境异常，不让登录"
- **Assertions**:
  - `tool_called`: diagnose_app
  - `contains`: 安全诊断
  - `response_has_next_step`: 

### TC-008: 功能异常 - 账号状态异常需 query_subscriber 核实

- **Priority**: P2
- **Requirements**: REQ-004, REQ-013, REQ-014, REQ-025
- **Turns**:
  1. "缴费时提示账号异常，不能操作"
- **Assertions**:
  - `tool_called`: query_subscriber
  - `not_contains`: 您已欠费
  - `contains`: 核实

### TC-011: 查询附近营业厅 - 调用地图工具并规划路线

- **Priority**: P2
- **Requirements**: REQ-008, REQ-009, REQ-017
- **Turns**:
  1. "最近的电信营业厅在哪？"
  2. "我在北京市海淀区中关村"
- **Assertions**:
  - `tool_called`: maps_around_search
  - `contains`: 营业厅
  - `response_has_next_step`: 

## Edge Case Tests

### TC-007: OTP 未收到 - 合规引导不超过2次

- **Priority**: P2
- **Requirements**: REQ-003, REQ-012, REQ-023, REQ-026
- **Turns**:
  1. "登录时收不到验证码短信"
- **Assertions**:
  - `not_contains`: 验证码内容
  - `not_contains`: 再发第三次
  - `response_mentions_any`: 等待,重发,其他方式

### TC-009: App 闪退 - 版本过旧引导更新

- **Priority**: P2
- **Requirements**: REQ-002, REQ-011
- **Turns**:
  1. "App 打不开，我手机很老了"
- **Assertions**:
  - `contains`: 版本过低
  - `contains`: 更新

## Error Tests

### TC-006: 账单查询需求 - 应转出而非处理

- **Priority**: P2
- **Requirements**: REQ-001
- **Turns**:
  1. "我想查一下这个月的话费是多少"
- **Assertions**:
  - `tool_not_called`: diagnose_app
  - `tool_not_called`: query_subscriber
  - `response_mentions_any`: 账单,费用,话费
  - `not_contains`: 缓存
- **Notes**: 验证技能边界，纯业务问题不应触发技术排障

### TC-010: 高风险安全场景 - Root 设备且用户否认，升级 security_team

- **Priority**: P1
- **Requirements**: REQ-006, REQ-007, REQ-016, REQ-020, REQ-021, REQ-022
- **Turns**:
  1. "App 说我设备被 Root 了，但我没做过啊，是不是被盗号了？"
- **Assertions**:
  - `tool_called`: diagnose_app
  - `response_mentions_any`: security_team,反诈,人工核查
  - `not_contains`: 自行修复

### TC-012: 套餐变更需求 - 应转出而非处理

- **Priority**: P2
- **Requirements**: REQ-001
- **Turns**:
  1. "我想在 App 里把套餐改成 59 元那个"
- **Assertions**:
  - `tool_not_called`: diagnose_app
  - `response_mentions_any`: 套餐,办理,变更
  - `not_contains`: 缓存
- **Notes**: 验证技能边界，业务办理需求不应触发技术排障

## State Tests

### TC-013: 用户要求转人工 - 立即转接

- **Priority**: P1
- **Requirements**: REQ-018
- **Turns**:
  1. "我不想自己弄了，直接转人工客服"
- **Assertions**:
  - `contains`: 人工客服
  - `tool_not_called`: diagnose_app
  - `tool_not_called`: query_subscriber

## Coverage Matrix

| Requirement | Covered By |
|-------------|------------|
| REQ-001 | TC-006, TC-012 |
| REQ-002 | TC-001, TC-009 |
| REQ-003 | TC-002, TC-007 |
| REQ-004 | TC-003, TC-008 |
| REQ-005 | TC-004 |
| REQ-006 | TC-005, TC-010 |
| REQ-007 | TC-010 |
| REQ-008 | TC-011 |
| REQ-009 | TC-001, TC-002, TC-003, TC-004, TC-005, TC-011 |
| REQ-010 | TC-005 |
| REQ-011 | TC-001, TC-009 |
| REQ-012 | TC-002, TC-007 |
| REQ-013 | TC-003, TC-008 |
| REQ-014 | TC-008 |
| REQ-015 | TC-004 |
| REQ-016 | TC-005, TC-010 |
| REQ-017 | TC-011 |
| REQ-018 | TC-013 |
| REQ-019 | TC-001, TC-002, TC-003, TC-004, TC-005 |
| REQ-020 | TC-010 |
| REQ-021 | TC-010 |
| REQ-022 | TC-005, TC-010 |
| REQ-023 | TC-007 |
| REQ-024 | TC-002 |
| REQ-025 | TC-008 |
| REQ-026 | TC-007 |
