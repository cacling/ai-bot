# 功能特性树：智能电信客服系统

**功能**: 000-baseline | **日期**: 2026-03-19 | **版本**: v5.0.0

> 本文档以树状结构展示系统完整功能清单，聚焦"系统能做什么"。
> 源码文件映射详见 [codebase-map.md](codebase-map.md)，架构与调用链路详见 [plan.md](plan.md)。

---

## 功能总览

```
智能电信客服系统（小通）
├── 1. 文字客服
├── 2. 语音客服
├── 3. 外呼语音
├── 4. 坐席工作台
├── 5. 知识管理平台
├── 6. 知识资产管理（KMS）
└── 7. 基础能力
```

---

## 1. 文字客服

```
文字客服（/chat, /ws/chat）
├── 1.1 账单查询 ················ bill-inquiry Skill + query_bill MCP
│   ├── 当月账单查询
│   ├── 指定月份查询
│   ├── 最近 3 个月汇总
│   └── bill_card 结构化卡片展示
├── 1.2 业务退订 ················ service-cancel Skill + cancel_service MCP
│   ├── 已订增值业务列表查询
│   ├── 退订前用户确认（Human-in-the-Loop）
│   ├── 退订执行 + cancel_card 卡片
│   └── 未订阅业务的错误处理
├── 1.3 套餐咨询 ················ plan-inquiry Skill + query_plans MCP
│   ├── 当前套餐信息查询
│   ├── 全部可用套餐列表
│   ├── 套餐对比推荐
│   └── plan_card 结构化卡片展示
├── 1.4 网络故障诊断 ············ fault-diagnosis Skill + diagnose_network MCP
│   ├── 4 种故障类型：no_signal / slow_data / call_drop / no_network
│   ├── 逐步诊断（账号→信号→流量→APN→拥塞）
│   ├── 诊断脚本编排（scripts/run_diagnosis.ts）
│   ├── diagnostic_card 结构化卡片展示
│   └── Mermaid 流程图实时高亮（工具节点黄色 + 分支节点绿色）
├── 1.5 App 使用支持 ············ telecom-app Skill + diagnose_app MCP
│   ├── 4 种问题类型：app_locked / login_failed / device_incompatible / suspicious_activity
│   ├── 设备上下文查询（device_contexts 表）
│   └── 安全诊断结果
├── 1.6 电子发票 ················ issue_invoice MCP
│   └── 指定月份开具发票并发送邮箱
├── 1.7 通用能力
│   ├── 流式文本输出（text_delta）
│   ├── 会话历史持久化（SQLite sessions/messages）
│   ├── 会话重置（DELETE /api/sessions/:id）
│   ├── 5 个快捷 FAQ 按钮
│   ├── 端到端耗时展示（_ms 字段）
│   └── Skill + MCP 并行调用优化
└── 1.8 连接模式
    ├── HTTP REST（POST /api/chat）—— 历史/简单集成
    └── WebSocket（/ws/chat）—— 当前默认，支持流式 + Session Bus 集成
```

## 2. 语音客服

```
语音客服（/ws/voice）
├── 2.1 语音交互核心
│   ├── GLM-Realtime WebSocket 代理（后端有状态代理，非直连浏览器）
│   ├── 音频链路：麦克风 → AudioContext(16kHz PCM) → base64 → WS → GLM → MP3 → MediaSource → 扬声器
│   ├── Server VAD 全程免唤醒（silence_duration_ms: 1500）
│   ├── 打断机制：用户说话时自动停止当前播报
│   └── 状态机：disconnected → connecting → idle ⇄ listening ⇄ thinking ⇄ responding → transferred
├── 2.2 业务场景（复用文字客服 5 个场景）
│   ├── 查话费（query_bill）
│   ├── 查套餐（query_plans）
│   ├── 查用户信息（query_subscriber）
│   ├── 退订业务（cancel_service）
│   └── 网络诊断（diagnose_network）
├── 2.3 智能转人工
│   ├── 触发路径 ①：GLM 显式调用 transfer_to_human 工具
│   ├── 触发路径 ②：语音转写匹配 TRANSFER_PHRASE_RE 正则
│   ├── 防重复触发：VoiceSessionState.transferTriggered 标志
│   ├── 后台异步 Handoff 分析（单次 LLM 调用 → HandoffAnalysis JSON + 摘要）
│   └── 前端 Handoff 卡片展示（意图/问题/动作/风险/摘要）
├── 2.4 情绪检测
│   ├── 每次用户语音转写后异步触发（不阻塞主流程）
│   ├── 5 类情绪：平静😌 / 礼貌😊 / 焦虑😟 / 不满😤 / 愤怒😠
│   └── emotion_update 事件推送前端
├── 2.5 多语言支持
│   ├── zh（中文）：GLM 音频直接透传，延迟 < 500ms
│   ├── en（英文）：拦截中文音频 → 逐句翻译 → TTS → tts_override 事件
│   ├── 分句流式处理（按 。？！；\n 分句）
│   ├── Promise 队列保证分句顺序
│   ├── 工具结果翻译（中文 JSON → 英文，降低 GLM 回退中文概率）
│   └── 语言切换时 WebSocket 自动重连
├── 2.6 Skill 流程图推送
│   └── 连接建立后推送对应技能的 Mermaid 流程图
└── 2.7 会话指标采集
    ├── 首包响应时延（avg/p95）
    ├── 打断次数
    ├── 冷场次数（5 秒无首包音频）
    └── 会话时长
```

## 3. 外呼语音

```
外呼语音（/ws/outbound）
├── 3.1 催收外呼 ················ outbound-collection Skill
│   ├── 催收话术流程（状态图驱动）
│   ├── 自动开场白（连接建立后机器人主动发起）
│   ├── 催收专用工具
│   │   ├── record_call_result（10 种结果：ptp/refusal/dispute/callback 等）
│   │   ├── send_followup_sms（payment_link/callback_reminder）
│   │   ├── create_callback_task（创建回访任务）
│   │   └── transfer_to_human
│   └── 催收数据：客户信息、逾期金额、逾期天数
├── 3.2 营销外呼 ················ outbound-marketing Skill
│   ├── 营销话术流程（状态图驱动）
│   ├── 营销专用工具
│   │   ├── record_marketing_result
│   │   ├── send_followup_sms（plan_detail/product_detail）
│   │   └── transfer_to_human
│   └── 营销数据：当前套餐、推荐套餐、活动名称
├── 3.3 共享能力
│   ├── GLM-Realtime 代理（与入呼共享架构）
│   ├── 多语言支持（与入呼共享翻译流）
│   ├── 情绪检测 + Session Bus 发布
│   ├── 麦克风门控（micReadyRef，等开场白结束后才允许发送音频）
│   └── Skill 流程图推送 + 工具高亮
└── 3.4 灰度路由
    └── resolveSkillsDir() 按手机尾号百分比分流生产/.canary/ 目录
```

## 4. 坐席工作台

```
坐席工作台（/agent, /ws/agent）
├── 4.1 实时对话监控
│   ├── Session Bus 订阅：实时接收客户侧所有事件
│   ├── 对话记录展示（客户消息 + AI 回复）
│   ├── 流式文本增量（text_delta）
│   └── 消息去重（msg_id + Set<string>）
├── 4.2 坐席主动介入
│   ├── 坐席输入框：向 AI 发送消息
│   ├── 坐席消息通过 Session Bus 推送给客户侧
│   └── 坐席消息也触发 Agent 响应
├── 4.3 卡片系统（可扩展框架）
│   ├── 情感分析卡片（EmotionContent）
│   │   └── 渐变轨道 + 滑动指示器（green→amber→orange→red）
│   ├── 转人工摘要卡片（HandoffContent）
│   │   └── 意图/问题/动作/风险标签/自然语言摘要
│   ├── 流程图卡片（DiagramContent）
│   │   └── Mermaid 渲染 + 实时高亮
│   ├── 合规告警卡片（ComplianceContent）
│   │   └── 累积模式展示实时告警列表
│   ├── 外呼任务卡片（OutboundTaskContent）
│   │   └── 客户信息、欠款/套餐详情
│   └── 用户信息卡片（UserDetailContent）
│       └── 套餐、余额、已订业务
├── 4.4 卡片交互
│   ├── 2 列 Grid 布局（grid-flow-dense）
│   ├── HTML5 拖拽排序
│   ├── 折叠/展开
│   ├── 关闭 + 底部恢复芯片
│   └── 注册机制：registerCard() + findCardByEvent()
├── 4.5 跨窗口用户同步
│   ├── BroadcastChannel('ai-bot-user-sync')
│   └── 客户侧切换用户时坐席自动跟随
└── 4.6 坐席侧分析（不暴露给客户端）
    ├── 情感分析：每条客户消息 → analyzeEmotion() → emotion_update
    └── Handoff 分析：transfer_data → runHandoffAnalysis() → handoff_card
```

## 5. 知识管理平台

```
知识管理平台（/km/*）
├── 5.1 技能编辑器（EditorPage）
│   ├── 三栏布局：文件树 | 编辑器 | 需求访谈/测试
│   ├── 在线 Markdown 编辑 + 预览切换
│   ├── 文件级 Draft 跟踪（黄点=未保存，绿点=已保存）
│   └── Published 版本只读保护
├── 5.2 版本管理
│   ├── 完整目录快照（SKILL.md + references/ + scripts/）
│   ├── 版本状态：saved → published
│   ├── 创建版本（从已有版本复制）
│   ├── Diff 对比（LCS 行级算法）
│   ├── 一键回滚（回滚也创建新版本记录）
│   └── .draft 文件存在时拒绝发布
├── 5.3 沙箱测试
│   ├── runAgent(overrideSkillsDir) 隔离测试
│   ├── 42 条预配置 mock 规则（useMock: true）
│   └── 回归测试：6 种断言类型
│       ├── contains / not_contains
│       ├── tool_called / tool_not_called
│       ├── skill_loaded
│       └── regex
├── 5.4 AI 技能创建器
│   ├── 多轮对话式需求访谈（9 个维度）
│   ├── 工作流：interview → draft → confirm → done
│   ├── 驱动提示词：skill-creator-spec/SKILL.md
│   ├── LLM 工具：read_skill / read_reference / list_skills
│   ├── 自动生成 3-5 条测试用例
│   └── 会话管理（内存 Map，1 小时过期）
├── 5.5 自然语言配置编辑
│   ├── 需求澄清（POST /api/skill-edit/clarify）
│   ├── LLM 生成修改 Diff（old_fragment → new_fragment）
│   └── 确认写入（验证 old_fragment 防并发冲突）
├── 5.6 灰度发布
│   ├── 按手机尾号百分比分流（尾号 0-2 → 灰度 30%）
│   ├── 部署：Skill 文件复制到 .canary/ 目录
│   ├── 转正：POST /api/canary/promote（含版本记录）
│   └── 回滚：DELETE /api/canary
├── 5.7 高风险变更审批
│   ├── 自动检测模式：转接条件 / 催收语言 / 工具权限 / 合规关键词
│   ├── 审批流程：pending → approved / rejected
│   └── 批准后自动应用变更（含版本记录）
├── 5.8 MCP 管理
│   ├── Server CRUD（创建/更新/删除服务器配置）
│   ├── 工具自动发现（discover）
│   ├── 工具调用（invoke）/ 模拟调用（mock-invoke）
│   ├── 工具启用/禁用
│   └── Mock 规则管理（42 条）
└── 5.9 技能管理页面（SkillManagerPage）
    ├── 技能列表展示
    ├── 渠道绑定管理
    └── 技能缓存刷新
```

## 6. 知识资产管理（KMS）

```
知识资产管理（/km/documents, /km/candidates, ...）
├── 6.1 文档管理
│   ├── 文档上传 + 版本管理
│   ├── 解析管线：parse → chunk → generate → validate
│   └── 分类：public / internal / sensitive
├── 6.2 QA 候选管理
│   ├── 来源：解析生成 / 用户反馈 / 手动创建
│   ├── 三门验证
│   │   ├── 证据门：至少一条 status=pass 的证据引用
│   │   ├── 冲突门：无 pending 的阻断性冲突
│   │   └── 归属门：已关联目标资产或来源为 parsing
│   └── 状态流：draft → gate_pass → in_review → published / rejected
├── 6.3 证据引用管理
│   ├── 关联候选/资产与文档段落
│   └── 审核：pending → pass / fail
├── 6.4 冲突检测与仲裁
│   ├── 冲突类型：wording / scope / version / replacement
│   ├── 阻断策略：block_submit / block_publish / warn
│   └── 仲裁：keep_a / keep_b / coexist / split
├── 6.5 审核包工作流
│   ├── 打包候选 → 提交审核 → 三门检查 → 批准/驳回
│   └── 提交时三门不通过返回 blockers 列表
├── 6.6 动作执行
│   ├── 动作类型：publish / rollback / rescope / unpublish / downgrade / renew
│   ├── 执行后创建资产 + 回滚点 + 回归窗口
│   └── 回归观察期 7 天（metrics + threshold 监控）
├── 6.7 已发布资产管理
│   ├── 资产类型：qa / card / skill
│   ├── 状态：online / canary / downgraded / unpublished
│   └── 版本历史查看
├── 6.8 治理任务
│   ├── 任务类型：到期审查 / 内容缺口 / 冲突仲裁 / 故障修复 / 回归失败 / 证据缺口
│   ├── 优先级：urgent / high / medium / low
│   └── 指派 + 状态跟踪
└── 6.9 审计日志
    └── 只读，记录所有操作（action / object_type / object_id / operator / risk_level）
```

## 7. 基础能力

```
基础能力（跨模块共享）
├── 7.1 合规用语拦截
│   ├── L1：AC 自动机关键词匹配（同步，< 1ms）
│   │   ├── banned：硬拦截，不可发送
│   │   ├── warning：软告警，允许发送但提醒
│   │   └── pii：个人信息脱敏（身份证号、银行卡号）
│   ├── L2：Agent 输出管道拦截（文字同步 / 语音异步）
│   ├── L3：坐席发言监控（同步拦截）
│   ├── 内置 18 个默认敏感词
│   ├── 运行时热重载（POST /api/compliance/keywords/reload）
│   └── 在线检测调试（POST /api/compliance/check）
├── 7.2 权限控制（RBAC）
│   ├── 5 级角色：admin(5) > flow_manager(4) > config_editor(3) > reviewer(2) > auditor(1)
│   ├── requireRole() 中间件保护 API
│   └── 开发模式无认证头自动放行
├── 7.3 Session Bus
│   ├── 内存发布/订阅，解耦 chat-ws 与 agent-ws
│   ├── 按 phone 隔离订阅列表
│   └── 特殊事件：transfer_data（仅供坐席侧 Handoff 分析）
├── 7.4 实时流程图高亮
│   ├── SKILL.md 注解标记（%% tool: / %% branch: / %% ref:）
│   ├── highlightMermaidTool()：黄色高亮工具调用节点
│   ├── highlightMermaidBranch()：绿色高亮结果分支
│   ├── determineBranch()：诊断结果 → 分支名称映射
│   ├── SKILL_TOOL_MAP：工具 → Skill 名称映射（可扩展）
│   └── 双语 Mermaid 块支持（<!-- lang:en --> 分隔）
├── 7.5 LLM 引擎
│   ├── Vercel AI SDK generateText + ReAct 循环（maxSteps=10）
│   ├── SiliconFlow 适配器（OpenAI 兼容接口）
│   ├── 系统提示词模板（5 个 *-system-prompt.md）
│   ├── {{PHONE}} / {{CURRENT_DATE}} 占位符替换
│   └── onStepFinish 钩子（日志 + 流程图更新）
├── 7.6 MCP 协议
│   ├── StreamableHTTP stateless 传输
│   ├── @modelcontextprotocol/sdk 客户端
│   └── 5 个独立 MCP Server（端口 18003-18007）
│       ├── user-info-service：query_subscriber / query_bill / query_plans
│       ├── business-service：cancel_service / issue_invoice
│       ├── diagnosis-service：diagnose_network / diagnose_app
│       ├── outbound-service：record_call_result / send_followup_sms / create_callback_task / record_marketing_result
│       └── account-service：verify_identity / check_account_balance / check_contracts
├── 7.7 数据持久化
│   ├── SQLite + Drizzle ORM（WAL 模式）
│   ├── 30 张表（业务表 9 张 business.ts + 平台表 21 张 platform.ts）
│   ├── 后端与 MCP Server 共享同一 DB 文件
│   └── 种子数据：3 用户 + 4 套餐 + 4 增值业务 + 6 外呼任务
├── 7.8 可观测性
│   ├── 结构化 JSON 日志（logs/ 目录）
│   ├── 请求级指标：db_session_ms / agent_ms / total_ms / llm_ms / step
│   ├── 语音指标：首包时延 / 打断次数 / 冷场次数 / 会话时长
│   ├── 文字指标：message_count / tool_success_rate / transfer_triggered / auto_resolved
│   └── 合规告警事件推送
├── 7.9 TTS 语音合成
│   ├── SiliconFlow CosyVoice2-0.5B
│   ├── 支持 zh/en 双语音色
│   └── 输出 base64 MP3
├── 7.10 翻译服务
│   ├── LLM 翻译（zh → en）
│   ├── Mermaid 图标签翻译（保持语法不变）
│   └── 翻译结果缓存
├── 7.11 幻觉检测
│   └── 空回复/无工具调用的早期返回检测
└── 7.12 国际化（i18n）
    ├── zh/en 双语支持
    ├── 工具标签本地化（TOOL_LABELS）
    └── 短信标签本地化（SMS_LABELS）
```
