
今天在我之前的文章《[深度解析 MCP 与 Agent Skills 架构：从孤立多智能体转向可复用技能资产](https://jx.huawei.com/community/comgroup/postsDetails?postId=116dc3467e414ec989ebc39b211e6527)》、《[Agent skills 技术深度解析：AI智能体能力扩展与工程化实践](https://jx.huawei.com/community/comgroup/postsDetails?postId=4978e5b805444888b14fd60eb13805fc)》、 《[超拟人化语音：AI如何重塑客户服务体验](https://jx.huawei.com/community/comgroup/postsDetails?postId=a6ef475098c3493eb11ee714974a307e)》 、《[构建“活”的知识库：-基于“KCS-+-数据飞轮”驱动的自演进架构](https://jx.huawei.com/community/comgroup/postsDetails?postId=2f319bf0d96b419884ff89565a0077d5)》的基础上讲解企业级智能客服机器人的实战。
源代码在 [https://clouddrive.huawei.com/p/e0446ba6fa88e8235e1f5e60a1380b96](https://clouddrive.huawei.com/p/e0446ba6fa88e8235e1f5e60a1380b96)，linux和macos 运行`start.sh`， windows需装git bash后运行 `win-start.sh`。

在企业级智能客服机器人中，衡量其商业价值与用户体验的最核心指标可以归纳为三点：**表现拟人化（说话像人）**、**业务高可靠（干活靠谱）**、**运维敏捷化（易调整）**。
- **表现拟人化：** 突破机械感，实现毫秒级响应、自然打断与稳定人设的全双工沉浸式交互。
- **业务高可靠：** 严守能力边界，杜绝模型幻觉，并在标准业务流程（SOP）内提供精准、柔性的多意图闭环处理。
- **运维敏捷化：** 面向业务变化实现零代码迭代，使需求澄清、流程调整、验证发布与安全回滚形成闭环。

# 1 表现拟人化：实时、可打断、人格稳定的自然交互
企业机器人首先感知到的不是底层架构，而是机器人"像不像一个真实客服"。因此，这一章聚焦拟人化体验的三个关键维度：**响应是否实时、打断是否自然、表达是否稳定**。
- **语音表现力：** 说话流畅自然，停顿（Filler Words，如"嗯""啊"）符合人类思考习惯。口音、语气与气质必须与设定的"客服人设"保持稳定，不出现音色跳变。
- **全双工与低延迟：** 具备毫秒级的语音端点检测（VAD）能力，支持客户在任何时刻自然打断，机器人能够即时暂停并根据新的输入调整上下文。

## 1.1 场景 Demo：外呼营销与催收

下面用两个典型场景说明系统如何在真实业务中体现自然交互能力。

**【场景1：外呼营销 - 流量套餐升级】**

> **机器人：** 您好，我是XX通信的专属客服。看您近期流量使用较高，为您推荐一款大流量套餐，需要我为您详细介绍一下吗？
> **客户：** 给我详细介绍一下吧。
> **机器人：** 好的。这款套餐包含100G全国通用流量，相比您现在的套餐，每月只需多交10元。
> **客户：** 我每个月看抖音比较多，所以流量用得比较多，比较少打电话。
> **机器人：** 我理解，刷短视频确实很耗流量。这款套餐正好适合您这种重度流量用户，而且赠送的都是通用流量，看视频基本没有限制。
> **客户：** 嗯，听起来不错，帮我升级吧。
> **机器人：** 没问题，我马上为您办理。
![[外呼营销.mp4]]


**【场景2：欠款催收 - 柔性协商】**
> **客户：** 我下个月末就还款。
> **机器人：** 好的，感谢您的配合。为了避免影响您的信用记录，请尽量在月底前完成。请问您大概会在哪天几点左右处理呢？
> **客户：** 晚上大概8点左右吧。
> **机器人：** 记录好了。那我近期就不再打扰您。
> **客户：** 行，你下个月末再回访吧，这段时间内就别再催了。
> **机器人：** 明白，我会为您备注延期至下个月末跟进。祝您生活愉快。

![[欠款催收.mp4]]

## 1.2 技术方案

拟人化体验并不是单点能力，而是由**实时语音底座、全双工会话控制、输出风格控制和量化验收体系**共同支撑的。

### 1.2.1 端到端实时语音架构

系统采用"**接入层 + 实时会话层 + 智能编排层 + 语音生成层**"的分层架构：
- **接入层：** 对接电话网络、SIP、WebRTC 或 App 内语音通道，负责音频采集、编解码转换、抖动缓冲与网络重传控制。
- **实时会话层：** 维护单会话的双向音频流、会话状态、缓存队列、时间戳对齐与打断控制。
- **智能编排层：** 承接实时语音模型与业务技能，负责意图识别、上下文维护、工具调用和对话策略切换。
- **语音生成层：** 输出稳定音色、稳定语气、稳定语速的实时语音流，并支持流式增量播报。

该架构保证语音输入、理解、决策与播报全链路流式处理，避免"客户说完一句，系统再整体处理"的半双工滞后感。

当前系统在 `voice.ts` 中通过 **GLM-Realtime WebSocket 代理**实现上述四层架构：
**接入层：** 前端通过浏览器 `MediaRecorder` 采集 16kHz PCM 音频，经 WebSocket（`/ws/voice?phone=xxx&lang=zh`）上行至后端。后端作为代理，将音频帧转发至智谱 GLM-Realtime API（`wss://open.bigmodel.cn/api/paas/v4/realtime`）。下行链路中，GLM 返回 MP3 base64 编码音频，后端透传至前端，由 `MediaSource` API 解码播放。

**实时会话层：** 每个 WebSocket 连接对应一个 `VoiceSessionState` 实例（`voice.ts:138`），维护：
- `turns[]`：完整对话轮次记录（角色 + 文本 + 时间戳）；
- `toolCalls[]`：工具调用历史（工具名、参数、结果摘要、成功/失败）；
- `collectedSlots`：已确认的槽位信息（手机号、服务ID、套餐ID、故障类型）；
- `transferTriggered` / `farewellDone`：转人工状态机标志；
- 可观测指标字段：`sessionStartTs`、`lastUserEndTs`、`firstPackLatencies[]`、`bargeInCount`、`silenceCount` 等，支持首包时延、打断次数、冷场率的实时采集。

**智能编排层：** GLM-Realtime 端到端处理语音理解与生成。后端拦截 `response.function_call_arguments.done` 事件，将 MCP 工具调用（`query_subscriber`、`query_bill` 等）路由至 MCP Server（`http://localhost:8003/mcp`），获取结果后通过 `conversation.item.create` + `response.create` 回注 GLM 上下文。

**语音生成层：** GLM-Realtime 内置 TTS，音色固定为 `tongtong`，输出格式 MP3。会话建立时通过 `session.update` 一次性锁定 `voice`、`temperature`（0.2）等参数，整个 Session 生命周期内不变。

**外呼场景：** `outbound.ts` 复用同一架构，差异在于：连接建立后立即触发 `response.create` 让机器人主动开口（不等客户先说）；使用外呼专用工具集（`record_call_result`、`send_followup_sms`、`transfer_to_human`、`create_callback_task`）；工具调用在本地 mock 处理，不走 MCP（实际生产走MCP调用API）。

### 1.2.2 全双工与自然打断机制

真正决定体验上限的，是机器人能否像真人一样"边听边说、随时被打断、即时调整"。

系统在 `voice.ts` 中实现**双向音频流并行处理**：
- **上行链路：** 持续接收客户语音帧，实时进行 VAD、静音检测、端点判断与中间文本增量识别。
- **下行链路：** 机器人语音按 chunk 流式下发，并附带序列号、时间戳与可中断标记。
- **打断控制器：** 一旦检测到客户重新开口，立即触发 `barge-in` 事件，停止当前 TTS 播放，冻结当前应答生成，并切换到重规划路径。
- **上下文修正器：** 当客户在机器人说话过程中补充新条件时，系统不会简单丢弃旧上下文，而是将"未完成应答 + 新输入"统一送入会话状态机重新计算。

为兼顾灵敏度与稳定性，系统采用两段式 VAD 参数：
- **抢话检测阈值：** 偏敏感，用于快速识别客户重新开口；
- **轮次结束阈值：** 偏稳健，用于判断客户是否真正说完。

这样既能减少"漏打断"，又能控制"误切轮"。

全双工能力由 GLM-Realtime 原生提供，后端通过以下配置启用服务端 VAD（`voice.ts`）：
```javascript

turn_detection: {
type: 'server_vad',
silence_duration_ms: 1500, // 1.5 秒静音判定轮次结束
threshold: 0.6, // 语音活动检测阈值
interrupt_response: false, // 防止 VAD 把机器人回声误判为用户说话后打断自己
}
```

**双向音频流并行处理：**
- 前端持续通过 WebSocket 上传 PCM 音频帧，后端在 `onMessage`（`voice.ts:734`）中直接转发至 GLM，无需等待机器人回复完成。
- GLM 返回的音频事件通过 `glmWs.on('message')` 实时透传至前端，实现边听边说。
- 当客户在机器人说话过程中重新开口，GLM 自动中断当前生成并基于新输入重新规划。

**转人工后的打断控制：** 系统实现了一个"告别语保护"机制——当 `transfer_to_human` 被触发后，`transferTriggered` 置为 `true`，但不立即拦截 GLM 输出；等 `response.done` 事件到达后，将 `farewellDone` 置为 `true`，此后才拦截所有后续 GLM 响应（`voice.ts`），确保客户能听完完整的告别语。

### 1.2.3 稳定人设与场景化表达控制

机器人即使"反应很快"，如果音色漂移、语气不稳、节奏失衡，也仍然会显得机械。因此，输出层还必须同时解决**人设稳定、表达自然和场景适配**三个问题。

系统通过以下机制进行统一控制：
- **会话级人设锁定：** 在会话建立时写入角色、行业身份、礼貌级别、说话风格、禁用表达与情绪边界等规则，并在整个 Session 生命周期内保持稳定。
- **音色模板绑定：** 将 TTS 音色、语速、停顿风格和口音参数与客服角色绑定，禁止同一会话中动态切换 voice profile。
- **高频话术模板约束：** 对问候、安抚、确认、结束语等高频表达采取"模板约束 + 有限生成"的方式，避免同一客服在同一通会话中出现口语风格飘移。
- **自然停顿与口语化控制：** 在需要思考缓冲、转折或安抚时，适度插入"嗯""好的""我理解"等自然衔接词，同时避免在严肃场景中过度口语化。
- **长句分段播报：** 对复杂说明执行语义分段，减少整句一次性输出造成的机器感。
- **场景化节奏模板：**
	- **营销场景：** 首句更短，更快触达利益点；
	- **催收场景：** 语气克制，优先确认意愿、时间与方式，再推进 PTP 记录；
	- **投诉场景：** 降低插话频率，提高安抚优先级；
	- **排障场景：** 适当放慢语速，强调步骤拆解和结果确认。

`outbound.ts` 可进一步将"营销、催收、回访、通知"等场景封装为不同策略配置，使同一套底层能力可复用于多类外呼任务。

**会话级人设锁定：** 系统通过分层 System Prompt 模板实现人设控制：
- `inbound-base-system-prompt.md`：定义角色身份（"你是'小通'，电信智能客服"）、用户上下文（手机号、姓名、套餐）、可用工具列表和转人工触发条件。
- `inbound-voice-system-prompt.md`：叠加语音渠道专属规则——"用专业、亲切、简洁的中文口语回答，像真人客服说话""每次回复不超过两句，不要使用 Markdown"。
- `outbound-system-prompt.md`：外呼专用规则，包含开场白模板（催收/营销分别定义）、语速语气要求、工具使用说明。
Prompt 模板通过 `buildVoicePrompt()`在会话建立时一次性注入 `session.update`，整个 Session 生命周期内不再修改。
  
**音色模板绑定：** GLM-Realtime 的 `voice` 参数在 `session.update` 中设置为 `tongtong`，同一会话不会切换。外呼场景通过 `OUTBOUND_VOICE_CONFIG`（`outbound.ts:159`）为两种任务类型定义差异化的音色与语速指令：
```javascript
{
	'collection': {
		voice: 'tongtong',
		styleLabel: '沉稳认真型',
		styleInstruction: '说话语速适中偏慢（约每分钟160字），语气沉稳认真……'
	},
	'marketing': {
		voice: 'tongtong',
		styleLabel: '热情活泼型',
		styleInstruction: '说话语速轻快活泼（约每分钟230字），语气热情积极……'
	},
}
```

**高频话术模板约束：** System Prompt 中明确规定了开场白模板（如催收场景："您好，请问是[customer_name]先生吗？我是中国电信客服小通……"），机器人必须用模板填入实际值，不能自由发挥。语音渠道规则还约束了回复长度（"每次回复不超过两句"）和工具调用前行为（"先只说一个极短的确认词，立即调用对应工具"）。

**场景化策略切换：** 外呼系统通过 URL 参数 `?task=collection|marketing` 选择任务类型，`buildOutboundPrompt()` 将对应的任务数据、语速配置和开场白模板编译为完整 Prompt，实现同一套底层架构支撑多种外呼场景。

### 1.2.4 可观测指标与验收标准

拟人化能力必须能够被持续观测和验收，否则只能停留在主观判断层面。
建立以下指标体系：
- **首包响应时延：** 从客户说完到机器人开始说话的首包耗时；
- **打断响应时延：** 客户插话后机器人停止播报的耗时；
- **音色一致性：** 单会话内音色漂移率；
- **口语自然度评分：** 基于人工质检或模型评估的综合得分；
- **误打断率 / 漏打断率：** 衡量全双工控制质量；
- **沉默冷场率：** 会话中超时无反馈的比例。

当前系统已在 `VoiceSessionState`（`voice.ts:138`）中内置了完整的可观测指标采集能力，配合结构化日志基础设施（`logger.ts`）实现持续监控。

**1）首包响应时延采集（已实现）**
`VoiceSessionState` 内置 `markUserEnd()` 和 `markFirstAudioPack()` 方法。用户转写完成时调用 `markUserEnd()` 开始计时，收到首个音频 chunk 时调用 `markFirstAudioPack()` 记录时延并存入 `firstPackLatencies[]` 数组：
```typescript
// markUserEnd() — 用户说完时调用
this.lastUserEndTs = Date.now();
this._awaitingFirstPack = true;

// markFirstAudioPack() — 首个音频 chunk 到达时调用
const latency = Date.now() - this.lastUserEndTs;
this.firstPackLatencies.push(latency);
```

**2）打断次数采集（已实现）**
GLM-Realtime 在检测到用户打断时发出 `input_audio_buffer.speech_started` 事件，触发 `markBargeIn()` 累加打断计数：
```typescript
markBargeIn() { this.bargeInCount++; }
```

**3）沉默冷场率（已实现）**
`markUserEnd()` 中同时启动 5 秒定时器，若超时仍未收到首包音频，自动累加 `silenceCount`：
```typescript
this.silenceTimer = setTimeout(() => {
  if (this._awaitingFirstPack) {
    this.silenceCount++;
  }
}, 5000);
```
收到首包音频时 `markFirstAudioPack()` 自动清除定时器。

**4）指标聚合与导出（已实现）**
会话结束时调用 `getMetrics()` 输出汇总指标，包括均值与 P95：
```typescript
getMetrics() {
  return {
    total_turns: this.turns.length,
    total_tool_calls: this.toolCalls.length,
    tool_success_count: this.toolCalls.filter(t => t.success).length,
    transfer_triggered: this.transferTriggered,
    barge_in_count: this.bargeInCount,
    silence_count: this.silenceCount,
    first_pack_latency_avg_ms: /* 均值计算 */,
    first_pack_latency_p95_ms: /* P95 计算 */,
    session_duration_ms: Date.now() - this.sessionStartTs,
  };
}
```

后续可将日志接入 Grafana / Loki 等可观测平台，建立仪表盘实现持续监控。音色一致性和口语自然度评分需要接入离线评估管道（如批量抽取录音片段，用评估模型打分），属于质检体系范畴。

---

# 2 业务高可靠：有边界、能闭环、可兜底的业务执行


企业更关心的是机器人"能不能把事情办对"。因此，这一章聚焦业务高可靠的三个核心要求：**守边界、不幻觉；能闭环、不跑偏；有兜底、不失控**。
- **坚守边界：** 当问题涉及未知领域、客户隐私或系统无权访问的数据时，机器人必须明确识别自身能力边界，并优雅引导转人工，不能胡编乱造。
- **柔性处理：** 在已授权的业务 SOP 范围内，允许客户跳跃式提问、情绪宣泄或多意图表达，机器人仍能兜底并拉回主流程。

## 2.1 场景 Demo：边界控制与灵活响应

下面用三个场景分别展示"守边界""多意图闭环"和"引导式解决"的能力。

**【边界控制 Demo：语音查询欠款】**
> **客户：** 你查下我欠了你多少钱吗？
> **机器人：** 抱歉，出于对您账户隐私的安全保护，语音助手暂时无法直接播报欠款金额。您通过官方 App 查询，或者我为您转接人工客服核实。
> **客户：** 你连这个都不知道，你帮我转人工处理吧。
> **机器人：** 好的，理解您的诉求，正在为您转接专属人工坐席，请稍候。

![[指定范围内灵活处理.mp4]]


**【灵活响应 Demo 1：账单复杂查询与情绪安抚】**
> **客户：** 帮我查这个月的账单。
> **机器人：** 您本月账单总额为350元。
> **客户：** 给我讲下这个月账单的详情。
> **机器人：** 没问题，其中基础套餐费150元，超出部分流量费200元。
> **客户：** 把这个月账单的发票发给我。
> **机器人：** 好的，电子发票已发送至您尾号为8899的邮箱。
> **客户：** 你有没有25年11月的账单？
> **机器人：** 抱歉，目前系统仅支持查询近半年的账单。25年11月的历史账单需要到营业厅打印。
> **客户：** 什么鬼？你连11月的账单也没有吗？
> **机器人：** 非常抱歉给您带来不便。历史账单归档后线上确实无法直接调取。如果您急需，我可以帮您登记加急工单，由后台人工专员尝试为您调取，您看可以吗？

**【灵活响应 Demo 2：宽带故障排查】**

> **客户：** 我的网速很慢很慢，是啥原因呢？
> **机器人：** 您的宽带线路后台检测正常。网速慢可能是光猫长时间未重启导致缓存过多。
> **客户：** 我现在很需要能上网，你看有什么办法解决呢？
> **机器人：** 您现在拔掉光猫的电源，等待30秒后再重新插上。您可以现在试一下，我在线等您。
> **客户：** 我重启后已经恢复了，谢谢。
> **机器人：** 不客气，能帮到您就好。

![[指定范围内灵活处理2.mp4]]

## 2.2 技术方案

高可靠并不是单靠模型理解力实现的，而是由**边界控制、知识与 SOP 约束、状态管理、工具闭环和风险兜底**共同构成。

### 2.2.1 多层边界控制与防幻觉架构

防幻觉不能只靠一句 Prompt，而必须建立多层防护体系：
- **能力边界声明：** 在系统级 Prompt 中明确规定，只能回答已授权领域问题，只能基于工具返回结果作答，对未知、无权限、无证据内容必须拒答或转人工。
- **Skill 白名单约束：** 每个业务技能仅允许调用预定义工具，例如 `query_bill`、`issue_invoice`、`diagnose_network` 等，模型不能自行拼装任意 API，也不能绕过工具层访问敏感系统。
- **响应前校验：** 在机器人输出前执行检查，拦截未授权字段、工具未返回数据、不确定结论的确定性表述以及合规敏感内容。
- **高风险自动转人工：** 对金额播报、身份核验失败、投诉升级、法律争议、强负面情绪等场景，直接命中转人工规则，不让模型继续自由发挥。

  

 当前实现能力边界声明： `inbound-base-system-prompt.md` 中明确规定："其余业务数据（余额、流量、账单等）必须基于工具/技能的返回结果回答，不能编造。"

并列出了 8 种必须立即触发 `transfer_to_human` 的情况：问题超出范围、用户明确要求人工、连续两轮无法识别意图、情绪激烈或投诉、高风险操作（销户、实名变更、大额退款、套餐降档）、同一工具连续失败两次、身份验证无法完成、对回答没有把握。

**Skill 白名单约束：** `skills.ts` 中 `get_skill_instructions` 工具通过 `z.string()` 接收技能名称并在运行时校验（动态扫描 `biz-skills/` 目录，每 30 秒刷新缓存）。MCP Server（`telecom_service.ts`）暴露 `query_subscriber`、`query_bill`、`query_plans`、`cancel_service`、`diagnose_network`、`diagnose_app`、`issue_invoice` 等工具，模型无法调用其他 API。

**高风险自动转人工：** `transfer_to_human` 工具的 `reason` 参数定义了 7 种枚举值（`voice.ts:327`）：`user_request`、`unrecognized_intent`、`emotional_complaint`、`high_risk_operation`、`tool_failure`、`identity_verify_failed`、`low_confidence`，确保转人工有明确分类。

**连续失败兜底：** `VoiceSessionState.consecutiveToolFails`（`voice.ts:141`）追踪连续工具调用失败次数。System Prompt 中规定"同一工具连续失败两次"必须转人工。
机器人输出前的合规拦截层，实现方案见 [3.2.4 合规治理](#324-合规治理权限控制与发布策略) 中的合规拦截部分。

### 2.2.2 SOP、知识与工具的受控闭环

仅靠"不要乱说"还不够，系统还必须明确"应该按什么流程处理"。因此，需要将企业 SOP、业务知识和执行工具组合为一个受控闭环。
- **SOP 层：** 定义标准步骤、前置条件、允许分支与异常出口；
- **知识层：** 存放业务规则、口径说明、FAQ 与边界解释；
- **工具层：** 承担具体动作执行，如查询账单、发送发票、提交工单；
- **策略层：** 决定当前是继续自动处理、补充澄清，还是转人工。

这样一来，机器人不是"自由聊天"，而是在受控业务骨架内执行柔性对话。

当前系统通过 **Skills 知识层架构** 实现四层受控闭环：
**SOP 层 → SKILL.md：** 每个业务技能（如 `bill-inquiry`、`fault-diagnosis`）都有独立的 `SKILL.md` 文件，定义：
- 触发条件（何时加载该技能）
- 标准处理流程（步骤、分支、异常出口）
- Mermaid 流程图（带 `%% tool:xxx` 和 `%% branch:xxx` 标注）
- 回复规则（口径、格式、禁止事项）

**知识层 → references/：** 每个 Skill 目录下的 `references/` 子目录存放业务规则文档（如 `billing-rules.md`、`cancellation-policy.md`、`plan-details.md`），通过 `get_skill_reference` 工具按需懒加载。

**工具层 → MCP Server：** `telecom_service.ts` 实现 MCP 工具（`query_subscriber`、`query_bill`、`query_plans`、`cancel_service`、`diagnose_network`、`diagnose_app`、`issue_invoice` 等），通过 StreamableHTTP 协议提供无状态工具调用。每个工具有明确的输入参数和返回格式。

**策略层 → Agent Runner：** `runner.ts` 中的 `generateText()` 配合 `maxSteps: 10` 的 ReAct 循环，让模型在每一步决定是"调用工具""加载技能""请求澄清"还是"转人工"。模型首先调用 `get_skill_instructions` 了解处理流程，再按 Skill 中定义的步骤执行。

**渐进式暴露机制：** Agent 不会一次性加载所有知识，而是按需分步获取：
1. 先调用 `get_skill_instructions(skill_name)` 获取 SOP 流程；
2. 需要详细规则时再调用 `get_skill_reference(skill_name, reference_path)` 获取参考文档；
3. 执行具体操作时调用 MCP 工具。

### 2.2.3 多意图承接与会话状态管理

真实客服对话并不是单线串行流程，而往往是"查账单 → 问明细 → 要发票 → 追问历史账单 → 表达不满"的多意图交织。因此，系统必须显式管理会话状态，而不能完全依赖上下文窗口。

在 `VoiceSessionState` 中维护以下信息：
- 当前主任务；
- 当前子任务栈；
- 已确认槽位（手机号、月份、邮箱等）；
- 最近一次工具调用结果；
- 当前情绪等级；
- 风险标签；
- 是否允许继续自动处理。

通过"主任务 + 子任务栈"的方式，机器人既可以承接跳跃问题，也可以在子任务处理完成后回归主流程。

当前实现语音通道（`VoiceSessionState`，`voice.ts:138`）：维护结构化状态：
```typescript

class VoiceSessionState {
turns: TurnRecord[] = []; // 完整对话历史 [{role, text, ts}]
toolCalls: ToolRecord[] = []; // 工具调用记录 [{tool, args, result_summary, success, ts}]
consecutiveToolFails = 0; // 连续失败计数（触发兜底转人工）
currentBotAccum = ''; // 当前 bot 回复累积
collectedSlots: Record<string, unknown> = {}; // 已确认槽位
transferTriggered = false; // 防重复转人工
farewellDone = false; // 告别语播完标志
}
```

槽位自动提取逻辑：每次工具调用时，从参数中提取 `phone`、`service_id`、`plan_id`、`issue_type` 等关键槽位，持久化到 `collectedSlots`，避免重复询问。

**文字通道（Agent Runner，`runner.ts`）：** 依赖 Vercel AI SDK 的 `messages` 参数传递完整对话历史（`CoreMessage[]`），配合 `maxSteps: 10` 的 ReAct 循环实现多意图处理。每一步的 `onStepFinish` 回调记录工具调用详情并推送 Mermaid 流程图高亮更新。

**跨侧状态同步（`session-bus.ts`）：** 以 `userPhone` 为 key 的内存 Pub/Sub 总线，支持 `user`、`agent`、`voice`、`system` 四种事件源。环形缓冲区（最多 100 条）保留会话历史，新订阅者连接时自动回放（`subscribeWithHistory`），确保坐席工作台能看到完整上下文。

### 2.2.4 受控推理与工具执行编排

系统解决了"记得住什么"之后，还需要解决"下一步该做什么"。因此，在决策层需要引入受控的推理与执行机制，而不是让模型无限制自由发挥。

采用受控 ReAct 机制：
- 限定 `maxSteps`；
- 每一步只能执行"思考 / 提问澄清 / 调用工具 / 结束应答 / 转人工"等有限动作；
- 工具返回后必须经过结果解释器，不能原样裸输出；
- 当连续多步没有有效推进时，触发兜底策略。

例如：
- 用户问"查这个月账单" → 调用 `query_bill`
- 用户问"把发票发我" → 调用 `issue_invoice`
- 用户追问"25年11月账单有没有" → 进入历史账单规则分支
- 用户情绪升级 → 切换安抚策略或直接升级人工

这样既保留了模型的柔性理解能力，又避免推理链条失控。

当前实现文字通道 ReAct 循环（`runner.ts:220`）：
```typescript
const result = await generateText({
model: chatModel, // SiliconFlow Qwen2.5-72B-Instruct
system: systemPrompt,
messages: [...history, { role: 'user', content: userMessage }],
tools: { ...mcpTools, ...skillsTools }, // MCP 工具 + Skill 工具
maxSteps: 10, // 严格限制推理步数
abortSignal: controller.signal, // 180 秒超时中断
onStepFinish: ({ toolCalls, toolResults, finishReason }) => {
// 记录每步耗时、工具调用详情
// 推送 Mermaid 流程图实时高亮
},
});
```


**工具结果结构化解释：** `runner.ts:299-414` 中的后处理逻辑遍历所有步骤的工具结果，提取结构化卡片数据：
- `query_bill` → `BillCardData`（月份、总额、套餐费、流量费、通话费、增值费、税费、状态）
- `cancel_service` → `CancelCardData`（服务名、月费、生效截止日）
- `query_plans` → `PlanCardData`（套餐名、月费、流量、通话、特色功能）
- `diagnose_network` → `DiagnosticCardData`（故障类型、诊断步骤、结论）

卡片数据随文字回复一起返回前端，避免裸输出 JSON。

**流程图实时高亮：** `onStepFinish` 中，当检测到工具调用属于某个 Skill（如 `diagnose_network` → `fault-diagnosis`），自动从 SKILL.md 提取 Mermaid 流程图，对当前执行的工具节点用黄色高亮（`highlightMermaidTool`），对诊断分支用绿色高亮（`highlightMermaidBranch`），通过 `onDiagramUpdate` 回调推送至前端。

**语音通道工具编排：** 拦截 GLM 的 `response.function_call_arguments.done` 事件，区分处理：
- MCP 工具：调用 `callMcpTool()`，结果通过 `function_call_output` 回注 GLM；
- `transfer_to_human`：触发转人工流程（回复 GLM 让它说告别语 + 异步启动 handoff 分析）。
  

### 2.2.5 情绪、风险与平滑交接

系统还需要识别"什么时候不该再继续自动处理"。因此，情绪识别、风险判断和人工交接不应割裂，而应统一纳入风险路由机制。

可提供 5 级情绪识别，例如：平静、疑惑、不满、愤怒、高风险激动。这些结果不只是用于质检，还要实时参与决策：
- **疑惑：** 提高解释性回复的比重；
- **不满：** 优先安抚，再给方案；
- **愤怒：** 减少争辩式说明，快速进入升级路径；
- **高风险激动：** 强制切换至安全话术并转人工。

一旦命中高优先级标签，系统立即执行：
1. 生成交接摘要；
2. 附带已确认槽位、已执行动作与客户核心诉求；
3. 转人工并保留审计日志。

这样即使自动服务失败，也能做到"失败但平滑交接"，而不是"失败即中断"。

当前实现实时情绪识别（`emotion-analyzer.ts`）：
- 在每轮用户语音转写完成后异步触发，不阻塞语音回复流程。
- 从 `tech-skills/emotion-detection/SKILL.md` 加载情绪分类体系（System Prompt）。
- 单次 LLM 调用（`maxTokens: 10, temperature: 0`），输出 5 级标签之一：

| 标签  | Emoji | 颜色     | 含义     |
| --- | ----- | ------ | ------ |
| 平静  | 😌    | gray   | 正常交流   |
| 礼貌  | 🙏    | green  | 积极配合   |
| 焦虑  | 😟    | amber  | 有疑虑/紧迫 |
| 不满  | 😒    | orange | 不满但可控  |
| 愤怒  | 😡    | red    | 需要立即升级 |

- 结果推送至前端（`emotion_update` 事件）和坐席工作台（通过 SessionBus）。
- 文字通道中，`agent-ws.ts:135` 在接收到客户消息时同样触发情绪分析。

**智能交接摘要（`handoff-analyzer.ts`）：**
- 转人工触发时启动，单次 LLM 调用生成结构化 JSON + 自然语言摘要。
- 从 `tech-skills/handoff-analysis/SKILL.md` 加载分析指令。
- 输入：最近 12 轮对话 + 最近 8 次工具调用记录。
- 输出 11 个字段的 `HandoffAnalysis` 结构：

```typescript
interface HandoffAnalysis {
customer_intent: string; // 用户核心诉求
main_issue: string; // 主要问题
business_object: string[]; // 涉及业务对象
confirmed_information: string[];// 已确认信息
actions_taken: string[]; // 已执行操作
current_status: string; // 当前处理状态
handoff_reason: string; // 转人工原因
next_action: string; // 建议坐席下一步
priority: string; // 优先级（高/中/低）
risk_flags: string[]; // 风险标签
session_summary: string; // 80-150 字自然语言摘要
}

```


**双路径转人工触发（`voice.ts:327`）：**
1. **工具调用路径：** GLM 调用 `transfer_to_human` 工具，`triggerHandoff()` 立即启动分析。
2. **语音检测路径：** 正则匹配 bot 回复文本中的转人工短语（`/转接人工|为您转接|转人工客服|正在为您转接/`），作为兜底检测。

**超时容错：** 分析过程设有超时保护，超时后使用基于工具调用历史推断的 fallback 摘要，确保不因分析卡顿阻塞转人工。

**多语言支持：** `analyzeHandoff` 接受 `lang` 参数，英文场景下输出英文字段值和摘要。

### 2.2.6 关键可靠性指标

业务高可靠同样需要量化验收。采用以下指标：
- 幻觉拦截率；
- 工具调用成功率；
- 自动闭环完成率；
- 高风险场景误处理率；
- 转人工准确率；
- 平均处理轮次；
- 情绪升级场景挽回率。

当前系统已通过结构化日志记录了丰富的运行时数据，可基于此构建指标体系：

**1）基于已有日志的指标提取**
`runner.ts` 的 `generate_done` 日志已记录 `steps`、`card`、`total_ms` 等字段；`voice.ts` 记录了每次工具调用的成功/失败、转人工原因、情绪分析结果。通过日志聚合即可计算：
- **工具调用成功率** = 成功的 `mcp_tool_result` 日志 / 总 `tool_called` 日志
- **转人工率** = 包含 `transfer_to_human` 事件的会话数 / 总会话数
- **平均处理轮次** = 每个会话的 `steps` 数均值

**2）文字通道会话汇总（已实现）**
`chat-ws.ts` 的 `onClose` 中已实现会话级指标汇总：
```typescript
logger.info('chat-ws', 'session_summary', {
  phone, session: sessionId, channel: 'chat',
  message_count: messageCount,
  tool_call_count: toolCallCount,
  tool_success_rate: toolCallCount > 0 ? Math.round((toolSuccessCount / toolCallCount) * 100) / 100 : null,
  transfer_triggered: transferTriggered,
  auto_resolved: !transferTriggered,
  duration_ms: Date.now() - sessionStartTs,
});
```
语音通道在 `voice.ts` 的 `onClose` 中通过 `state.getMetrics()` 输出包含首包时延、打断次数、冷场次数等更丰富的指标。

**3）离线评估管道（幻觉拦截率）**
幻觉拦截率无法纯靠运行时日志计算，需要建立批量评估流程：
- 定期抽取已完成会话的对话记录 + 工具返回结果；
- 用评估模型（如 Qwen2.5-72B）检查机器人回复是否有无证据依据的断言；
- 计算 `包含幻觉的回复数 / 总回复数`。

---
# 3 运维敏捷化：面向业务人员的零代码持续迭代

机器人即使"像人"且"靠谱"，如果每次业务变化都要走研发排期，就无法真正支撑企业高频运营。因此，这一章聚焦第三个核心能力：**让懂业务的人能够安全、快速、可回退地调整业务机器人**。
- **全自然语言配置：** 业务流程定义与修改通过自然语言完成，无需编写代码。
- **智能需求澄清：** 系统通过对话引导业务人员补齐场景、步骤、异常与边界条件。
- **版本控制与安全回滚：** 所有变更都支持 Diff 对比、沙箱验证、灰度发布与秒级回滚。

## 3.1 场景 Demo：通过对话完成技能变更

下面用一个简单场景说明业务人员如何直接驱动系统完成配置修改。

**【场景：修改 bill-inquiry 的发票开具时效】**
> **业务人员：** 打开知识库中的"技能管理"，进入 `bill-inquiry`，把发票开具时效改成 3 到 5 个工作日。
> **系统：** 已识别到您要修改账单查询技能中的发票时效。请确认这是修改对客户展示的话术口径，还是修改真实业务规则。
> **业务人员：** 先修改客户展示口径。
> **系统：** 明白。请确认是否需要同步修改 FAQ、短信通知和邮件模板中的相关表述。
> **业务人员：** 是，需要一起修改。
> **系统：** 已生成变更草案：将 `bill-inquiry` 中发票开具时效统一调整为"3到5个工作日"，影响范围包括对话话术、FAQ、短信模板和邮件模板。是否进入沙箱验证？
> **业务人员：** 是。
> **系统：** 沙箱验证已通过，支持查看 Diff 并发布，或保留为草案稍后处理。

![[PixPin_2026-03-16_21-17-20.gif]]
  

## 3.2 技术方案

运维敏捷化并不是做一个"可配置页面"就够了，而是要让业务人员在**不写代码**的前提下，也能完成"提出需求 → 需求访谈 → 生成变更 → 验证风险 → 发布上线 → 出现问题快速回滚"的完整闭环。

### 3.2.1 对话式技能创建与编辑引擎

系统的核心设计借鉴了 Anthropic 开源的 [skill-creator](https://github.com/anthropics/skills/tree/main/skills/skill-creator) 的**阶段感知型 workflow** 方法论，将技能的创建和编辑统一为一个多轮对话引擎，通过入口自动判断模式：
- **新建入口**（点击「新建 SKILL」按钮）：系统直接进入需求访谈，逐步收集目标角色、触发条件、处理流程和边界规范。
- **编辑入口**（点击已有技能卡片）：系统预加载该技能的完整 SKILL.md 内容到 LLM 上下文，业务人员直接描述修改需求即可。

两种模式共享同一套对话引擎，按 **interview → draft → confirm → done** 四个阶段推进：
```
用户入口判断（新建/编辑）
↓
interview：多轮需求访谈（每次只问 1-2 个问题）
↓
draft：LLM 生成完整 SKILL.md + 参考文档 → 实时同步到右侧编辑器
↓
confirm：用户审查 → 可继续微调或确认
↓
done：写入磁盘 → 刷新技能缓存 → Agent 立即可用
```

**后端：对话引擎（`skill-creator.ts`）**
系统通过两个 API 实现完整的创建/编辑闭环：
**API 1：多轮对话（`POST /api/skill-creator/chat`）**
```typescript
// 请求
{
	message: string, // 用户自然语言输入
	session_id?: string, // 会话 ID（续聊时传入）
	skill_id?: string | null, // 已有技能 ID（编辑模式），null = 新建
}
// 响应
{
	session_id: string,
	reply: string, // AI 回复（显示在左栏对话）
	phase: 'interview' | 'draft' | 'confirm' | 'done',
	draft: null | { // phase 为 draft/confirm 时携带
	skill_name: string, // kebab-case 目录名
	skill_md: string, // 完整 SKILL.md 内容（含 frontmatter）
	references: Array<{ filename: string, content: string }>,
	description: string,
}
}
```

对话引擎的核心设计：
- **独立 LLM 实例：** 技能创建使用专用的 `skillCreatorModel`（默认对接 qwen-max-latest，通过 `SKILL_CREATOR_BASE_URL/API_KEY/MODEL` 环境变量配置），与客服对话的 `chatModel` 隔离，避免互相影响。
- **阶段感知 System Prompt：** 根据当前 `phase` 和 `skill_id` 动态构建提示词。新建模式引导 LLM 逐步收集四类关键信息（目标与角色、触发条件、处理流程、边界与规范）；编辑模式将现有 SKILL.md 全文注入上下文，LLM 直接理解修改需求。
- **LLM 工具调用：** 对话过程中 LLM 可调用三个工具——`read_skill`（读取已有技能）、`read_reference`（读取参考文档）、`list_skills`（列出所有技能及其参考文档），用于参考已有技能的写法和避免命名冲突。
- **服务端会话管理：** 每个对话维护独立的 `Session` 对象（内存存储，1 小时过期自动清理），保存完整对话历史、当前阶段和草稿内容。
- **SKILL.md 生成规范：** System Prompt 中嵌入了标准 SKILL.md 范例和 Anthropic skill-creator 的写作原则（解释"为什么"而不是堆 MUST/NEVER、保持精瘦、不过拟合），确保生成的技能文件格式一致、质量可控。

**API 2：保存到磁盘（`POST /api/skill-creator/save`）**
```typescript
// 请求
{
session_id?: string,
skill_name: string, // kebab-case 目录名
skill_md: string, // 完整 SKILL.md 内容
references?: Array<{ filename: string, content: string }>,
}
// 行为
// 1. 校验 skill_name 格式（必须是 kebab-case）
// 2. 新建时创建 {skill_name}/ 目录结构（SKILL.md + references/ + scripts/）
// 3. 已有文件走 saveSkillWithVersion() 版本管理
// 4. 写入参考文档到 references/ 子目录
// 5. 调用 refreshSkillsCache() 刷新技能缓存
// → Agent 立即可以通过 get_skill_instructions 加载新技能
```

**动态技能注册（`skills.ts`）**
技能注册已从硬编码改为动态扫描。`get_skill_instructions` 和 `get_skill_reference` 两个工具的 `skill_name` 参数不再使用 `z.enum([...])` 静态枚举，而是通过 `z.string()` 接收并在运行时校验。系统启动时扫描 `biz-skills/` 目录，之后每 30 秒刷新一次缓存；保存新技能时通过 `refreshSkillsCache()` 强制刷新，确保新技能立即可用。
同时，Agent 的 System Prompt 中技能列表也从硬编码改为动态注入：`inbound-online-system-prompt.md` 中使用 `{{AVAILABLE_SKILLS}}` 占位符，由 `runner.ts` 在构建提示词时调用 `getAvailableSkillsDescription()` 替换为当前所有技能的名称和描述。

**前端：技能管理页面（`SkillManagerPage.tsx`）**

页面采用三栏布局：

| 区域          | 功能                                                                                            |
| ----------- | --------------------------------------------------------------------------------------------- |
| **左栏：对话面板** | 多轮对话界面，连接 `/api/skill-creator/chat`。顶部显示当前阶段标签（需求访谈/生成草稿/待确认/已完成）；底部有「保存技能到磁盘」按钮（draft 生成后出现） |
| **中栏：文件树**  | 显示技能目录结构（SKILL.md + references/ + scripts/），支持点击切换编辑文件                                        |
| **右栏：编辑器**  | Markdown 编辑/预览双模式 + CodeMirror 代码编辑器。支持手动编辑、版本历史查看和沙箱测试                                       |

关键交互：
- 当 LLM 生成 draft 时，前端自动将 `draft.skill_md` 同步到右侧编辑器，将 `draft.references` 同步到文件树的 references 子目录，实现**对话与编辑器的实时联动**。
- 业务人员可以在右侧手动微调 LLM 生成的内容，两个通道互补。
- 点击「保存技能到磁盘」调用 `/api/skill-creator/save`，保存成功后自动刷新技能列表并切换到已保存技能的编辑模式。


### 3.2.2 沙箱验证与预发布回归

零代码修改不能直接进入生产环境，而必须先通过隔离验证。否则，"改得快"会很快演变成"出错也快"。

建立三层验证机制：

**1）静态检查**
- 是否存在未闭合流程；
- 是否存在死循环；
- 是否引用了不存在的工具；
- 是否缺少必填槽位；
- 是否引入高风险词；
- 是否破坏版本兼容性。

**2）自动回归测试**
- 是否影响既有核心路径；
- 是否导致新旧口径冲突；
- 是否降低闭环率；
- 是否提高转人工率；
- 是否触发不合规输出。

**3）沙箱真人试跑**
- 允许业务人员在隔离环境中与机器人进行真实对话；
- 验证话术、分支、工具调用与最终结果是否符合预期；
- 支持基于历史语料做回放验证。

只有通过上述校验，变更才进入灰度发布或正式发布阶段。


实现方案核心思路：不部署第二套服务，而是在同一进程内通过**文件级影子副本 + 沙箱会话标记**实现隔离。

**1）沙箱文件管理**
```
生产路径: backend/skills/biz-skills/bill-inquiry/SKILL.md
沙箱路径: backend/skills/.sandbox/{sandbox_id}/bill-inquiry/SKILL.md
```

API 设计：
```typescript
// POST /api/sandbox/create
// Body: { skill_path: "biz-skills/bill-inquiry/SKILL.md" }
// → 复制目标文件到 .sandbox/{uuid}/ 目录，返回 sandbox_id
// PUT /api/sandbox/:id/content
// → 编辑沙箱中的副本（不影响生产）
// POST /api/sandbox/:id/test
// Body: { message: "帮我查下这个月账单", phone: "13800000001" }
// → 调用 runAgent()，但 skillsDir 指向沙箱路径
// POST /api/sandbox/:id/publish
// → 将沙箱文件覆盖到生产路径（同时创建版本记录）
// DELETE /api/sandbox/:id
// → 清理沙箱目录
```


**2）Agent Runner 改造**
`runAgent()` 和 `skillsTools` 中的 `SKILLS_DIR` 需要支持可选覆盖。最小改动方案：在 `runAgent()` 参数中增加 `skillsDir?: string`，传入时使用沙箱路径，不传时使用默认生产路径。`get_skill_instructions` 的 `execute` 函数改为接收闭包中的路径而非全局常量。
  

**3）静态检查（`POST /api/sandbox/:id/validate`）**
解析修改后的 SKILL.md，执行以下检查：
- Mermaid 流程图语法校验（`mermaid.parse()`）；
- 工具名引用检查（`%% tool:xxx` 中的 xxx 必须在已注册工具列表中）；
- 必填字段完整性（YAML frontmatter 中 name、description 不能为空）；
- 敏感词扫描（调用合规词库匹配，见 3.2.4）。

**4）前端沙箱模式**
在 EditorPage 中增加"沙箱测试"按钮。点击后创建沙箱，右侧面板切换为内嵌的简化版 ChatPage（WebSocket 连接带 `?sandbox=xxx` 参数），可直接与使用沙箱配置的机器人对话验证。满意后点击"发布到生产"。

### 3.2.3 版本 Diff、灰度发布与一键回滚

系统必须解决"改完以后如何可控上线"的问题。因此，版本管理不应只是保存历史记录，而应成为运营侧的可视化控制台。

建设以下能力：
- 每次发布生成独立版本号；
- 保存版本快照、变更说明、变更人、审核人、发布时间；
- 提供前后版本 Diff 对比，支持查看：
- 话术差异；
- 流程节点差异；
- 转人工条件差异；
- 工具参数差异；
- 风险等级变化；
- 支持小流量灰度发布；
- 支持一键秒级回滚到任意历史稳定版本。

回滚时不仅恢复配置本身，还应恢复：
- Prompt 版本；
- 流程图版本；
- 规则版本；
- 测试基线；
- 风险策略快照。

这样，业务侧既能快速发布，也能在异常发生时先止血、再定位。

实现方案选择 **SQLite 版本表**（而非直接调用 Git CLI），原因是更轻量、查询快、与现有技术栈一致。

**1）数据库扩展（`schema.ts`）**
```typescript
export const skillVersions = sqliteTable('skill_versions', {
id: integer('id').primaryKey({ autoIncrement: true }),
skillPath: text('skill_path').notNull(), // "biz-skills/bill-inquiry/SKILL.md"
content: text('content').notNull(), // 完整文件快照
changeDescription: text('change_description'), // 变更说明
createdBy: text('created_by').default('system'), // 操作人
createdAt: text('created_at').notNull()
.$defaultFn(() => new Date().toISOString()),
});
```

**2）版本管理 API**
```typescript
// GET /api/skill-versions?path=biz-skills/bill-inquiry/SKILL.md
// → [{id, changeDescription, createdBy, createdAt}]
// GET /api/skill-versions/:id
// → {id, skillPath, content, changeDescription, createdBy, createdAt}
// GET /api/skill-versions/diff?from=3&to=5
// → 使用 diff npm 包生成 unified diff
// POST /api/skill-versions/rollback
// Body: { version_id: 3 }
// → 恢复文件内容 + 创建新版本记录（标记为"回滚至 v3"）
```

**3）写入时自动创建版本**
封装统一的写入函数，所有修改 Skill 文件的路径（手动编辑、自然语言编辑、沙箱发布）都经过此函数：
```typescript
async function saveSkillWithVersion(
skillPath: string,
newContent: string,
description: string,
operator: string = 'system'
) {
const oldContent = await readFile(join(SKILLS_DIR, skillPath), 'utf-8');
// 保存旧版本快照
await db.insert(skillVersions).values({
skillPath, content: oldContent,
changeDescription: description, createdBy: operator,
});
// 写入新内容
await writeFile(join(SKILLS_DIR, skillPath), newContent, 'utf-8');
}
```
  

**4）前端版本面板**
在 EditorPage 新增版本侧栏：
- 版本列表（时间倒序，显示变更人 + 变更说明）；
- 点击任意版本展示 Diff 视图（使用 `react-diff-viewer-continued` 组件）；
- "回滚到此版本"按钮，确认后调用 rollback API。

**5）灰度发布**
对于需要灰度的场景，可在 `runAgent()` 中增加灰度路由逻辑：根据用户手机号尾号（或百分比随机）决定使用"当前版本"还是"灰度版本"的 Skill 文件。灰度版本存放在 `skills/.canary/{skill_name}/` 目录，全量发布后合并到主路径。

### 3.2.4 合规治理、权限控制与发布策略

越需要底层治理能力作为约束，否则很容易从"高敏捷"滑向"高风险"。

从三个层面建立治理体系：

**1）合规拦截**
- 生成前同步拦截敏感词、违规承诺、歧视性表述、非法催收话术、虚假营销表述和偏离品牌口径的内容；
- 生成后异步审计对已完成会话进行质检，识别不规范用语、话术漂移、情绪处理失当、未按 SOP 处理等问题。

**2）权限控制**
- **业务配置员：** 可编辑话术、FAQ 和部分流程分支；
- **流程管理员：** 可修改流程骨架与工具映射；
- **平台管理员：** 可修改底层技术技能和发布策略；
- **审核人：** 负责高风险变更审批；
- **审计员：** 只读查看版本、日志与回放。

**3）发布策略**
- 对转人工规则调整、催收口径修改、身份验证流程变更、工具权限放开、合规词库修改等高风险变更，必须走审批链；
- 支持草案保存、沙箱验证、灰度发布、全量发布和紧急回滚的完整流程；
- 支持机器人与人工坐席共用一套合规监控和审计框架，实现统一治理。

通过以上设计，运维敏捷化不再只是"改得快"，而是"改得快、发得稳、出事能退"。

#### 3.2.4.1 合规用语拦截

当前系统采用三层拦截架构：
**Layer 1：AC 自动机 — 毫秒级关键词匹配（硬拦截）**
```typescript
// backend/src/compliance/keyword-filter.ts
interface ComplianceRule {
category: 'banned' | 'warning' | 'pii';
keywords: string[];
action: 'block' | 'alert' | 'mask';
}

// 敏感词分类
const BANNED_KEYWORDS = [
'这不是我负责的', '你自己去查', '关我什么事', '不知道', '没办法',
'你怎么这么烦', '你听不懂吗',
];
const WARNING_KEYWORDS = [
'保证', '承诺', '一定能', '绝对不会', '肯定没问题', // 过度承诺
];

const PII_PATTERNS = [
/\b\d{15,18}\b/, // 身份证号
/\b\d{16,19}\b/, // 银行卡号
/\b\d{3}-\d{4}-\d{4}\b/, // 电话号码格式
];

// 启动时构建 AC 自动机（Aho-Corasick），O(n) 匹配

// 使用 ahocorasick npm 包或自行实现
const ac = buildAhoCorasick([...BANNED_KEYWORDS, ...WARNING_KEYWORDS]);
export function checkCompliance(text: string): ComplianceResult {
const keywordMatches = ac.search(text);
const piiMatches = PII_PATTERNS.filter(p => p.test(text));
return {
	matches: keywordMatches,
	piiMatches,
	hasBlock: keywordMatches.some(m => m.category === 'banned'),
	hasWarning: keywordMatches.some(m => m.category === 'warning'),
};
}

```

**Layer 2：嵌入 Agent 输出管道（机器人回复拦截）**
在 `runner.ts` 的 `generateText` 返回后、发送给前端前插入拦截点：
```typescript
const botReply = result.text;
const compliance = checkCompliance(botReply);
if (compliance.hasBlock) {
// 替换违规片段或请求模型重新生成
const sanitized = sanitizeResponse(botReply, compliance.matches);
emitComplianceAlert(phone, 'bot', compliance);
return { ...result, text: sanitized };
}
// PII 脱敏
const masked = maskPII(botReply, compliance.piiMatches);
```

语音通道中，由于音频已经流式播放无法回收，在 `response.audio_transcript.done` 时异步检查并告警。

**Layer 3：人工坐席发言监控**
在 `agent-ws.ts` 的 `agent_message` 处理中：
```typescript
case 'agent_message': {
const compliance = checkCompliance(data.message);
if (compliance.hasBlock) {
// 阻止发送，返回提示
ws.send(JSON.stringify({
type: 'compliance_block',
message: `发言被拦截：包含不规范用语，请修改后重新发送`,
}));
return; // 不转发给客户
}
if (compliance.hasWarning) {
ws.send(JSON.stringify({
type: 'compliance_warning',
message: `注意：发言包含敏感表述，建议调整措辞`,
}));
}
// 正常转发
sessionBus.publish(phone, { source: 'agent', type: 'agent_message', ... });
}
```

**词库管理 API：**
```typescript
GET /api/compliance/keywords // 获取所有词库
POST /api/compliance/keywords // 新增关键词
DELETE /api/compliance/keywords/:id // 删除
POST /api/compliance/keywords/reload // 热重载 AC 自动机
```

**前端质检卡片：** 在 AgentWorkstationPage 的 CardPanel 注册 `compliance` 卡片类型，显示实时拦截记录、告警级别和时间。

#### 3.2.4.2 权限控制实现方案

在现有系统基础上引入轻量级 RBAC：

**1）用户表 + 角色表（`schema.ts`）**
```typescript
export const users = sqliteTable('users', {
id: text('id').primaryKey(),
name: text('name').notNull(),
role: text('role').notNull(), // 'config_editor' | 'flow_manager' | 'admin' | 'reviewer' | 'auditor'
createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});
```

**2）API 中间件**
```typescript
function requireRole(...roles: string[]) {
	return async (c: Context, next: Next) => {
	const userId = c.req.header('X-User-Id');
	const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
	if (!user.length || !roles.includes(user[0].role)) {
	return c.json({ error: '权限不足' }, 403);
	}
	await next();
	};
}
// 示例：文件编辑需要 config_editor 或更高权限
files.put('/content', requireRole('config_editor', 'flow_manager', 'admin'), async (c) => { ... });
// 回滚需要 flow_manager 或更高权限
skillVersions.post('/rollback', requireRole('flow_manager', 'admin'), async (c) => { ... });
```

**3）高风险变更审批**
对涉及转人工条件、催收话术、工具权限的修改，在 `saveSkillWithVersion()` 中检测变更内容，若命中高风险规则则标记为"待审批"状态，审核人通过后才实际写入文件。

---


# 4 技能双轨制架构

为实现"易调整"的目标，底层设计必须将机器人的能力进行解耦。
## 4.1 业务技能（开放给业务人员，自然语言调优）

面向具体场景，业务人员可通过 EditorPage 或自然语言对话直接修改。

当前系统已实现 8 个业务技能，存放在 `backend/skills/biz-skills/` 目录：

| 技能名                       | 场景                          | 关联 MCP 工具                                                |
| ------------------------- | --------------------------- | -------------------------------------------------------- |
| `bill-inquiry`            | 账单查询、费用明细、发票开具              | `query_subscriber`、`query_bill`                          |
| `service-cancel`          | 退订增值业务（视频包、短信包、漫游、游戏）       | `cancel_service`                                         |
| `service-suspension`      | 停机保号（暂停服务但保留号码）             | —                                                        |
| `plan-inquiry`            | 套餐查询、升级推荐、对比                | `query_plans`                                            |
| `fault-diagnosis`         | 网络故障排查（无信号、网速慢、通话中断、无法上网）   | `diagnose_network`                                       |
| `telecom-app`             | 营业厅 App 问题（登录、闪退、功能异常、账号安全） | `diagnose_app`                                           |
| `outbound-collection`     | 外呼催收（身份核验、逾期告知、PTP、回访）      | `record_call_result`、`send_followup_sms`                 |
| `outbound-marketing`      | 外呼营销（套餐推介、异议处理、转化跟进）        | `record_call_result`、`send_followup_sms`                 |


每个技能包含：
- `SKILL.md`：YAML frontmatter + 角色定义 + 工作流程 + 回复规则 + Mermaid 流程图
- `references/`：业务规则文档（计费规则、退订政策、套餐详情等）
- `scripts/`（部分技能）：可执行 TypeScript 脚本（诊断逻辑、安全检查等）

技能通过 `get_skill_instructions` 和 `get_skill_reference` 两个工具按需加载到 Agent 上下文中，实现渐进式暴露。

## 4.2 内部技术技能（平台级基座能力）

这些是机器人的"内功"，不需要业务员日常修改，而是作为原子能力嵌入在整个平台中。

### 4.2.1 客户情感识别
实时声纹与语义多模态情绪分析，一旦检测到愤怒/焦虑，立即触发告警或强制路由至高级人工坐席。

**当前实现：** `emotion-analyzer.ts` + `tech-skills/emotion-detection/SKILL.md`。5 级分类（平静→愤怒），异步 LLM 调用不阻塞语音流，结果推送至前端和坐席工作台。详见 [2.2.5](#225-情绪风险与平滑交接)。

### 4.2.2 合规与不规范用语拦截
毫秒级匹配敏感词库，拦截机器人的不当生成；同时异步监控人工坐席（例如捕捉到坐席说"这不是我负责的"），触发质检告警。
实现方案见 [3.2.4](#324-合规治理权限控制与发布策略) 中的三层合规拦截架构。

### 4.2.3 智能交接摘要
转人工时，系统自动生成高度提炼的对话总结（摘要、诉求、已尝试的方案），随路数据传达给坐席，避免客户重复复述。
当前实现： `handoff-analyzer.ts` + `tech-skills/handoff-analysis/SKILL.md`。单次 LLM 调用生成 11 字段结构化工单 + 80-150 字自然语言摘要，20 秒超时 fallback。详见 [2.2.5](#225-情绪风险与平滑交接)。

### 4.2.4 实时多语种翻译
客户语种与坐席母语不一致时，底层无缝桥接实时双向翻译。

**当前实现：** `translate-lang.ts` + `tech-skills/translate-lang/SKILL.md`。
翻译触发点：
- **文字通道（`agent-ws.ts`）：** 当坐席语言 ≠ 客户语言时，自动翻译 `user_message` 和 `response` 事件，附加 `translated_text` 字段。
- **语音通道（`voice.ts:614`）：** 坐席发送消息时，若语言不匹配，先翻译为客户语言再调用 TTS 播放给客户。
- **语言设置：** 通过 `lang-session.ts` 维护每个 phone 的 `{ customer: 'zh'|'en', agent: 'zh'|'en' }` 配置，坐席可在工作台动态切换语言（`set_lang` 消息）。

---

# 5 自然语言与流程图的混合架构

在大模型落地智能客服的深水区，纯传统的固定工作流（Workflow）和纯大模型驱动（Agent / MCP）都存在致命缺陷，**"自然语言控制 + 底层状态机流程图"的混合架构**是当前的最优解。
- **传统 Workflow 的痛点：** 树状节点的排列组合是有限的，一旦客户的提问跳出预设的剧本（SOP），机器人就会陷入"死胡同"或不断重复"听不懂"。
- **纯大模型 (基于 MCP 工具调用) 的痛点：** 面对具有强依赖关系、多串行/并行步骤的长状态流程（如复杂的故障排查），纯大模型极易因上下文（Context）污染而迷失方向，导致 API 调用参数错乱或产生严重幻觉。

**融合解决方案设计：** 宏观流程图控场，微观大模型自由发挥。对于具备严格"状态流转"的复杂业务，底层必须保留流程图作为骨架。大模型负责在每个节点内进行意图识别、槽位提取（Slot filling）和柔性对话。

当前系统已完整实现这一混合架构：

**1）宏观流程图控场 — Skill + Mermaid**
每个业务技能的 SKILL.md 中定义了 Mermaid 流程图，作为该业务的"骨架"。流程图中的关键节点通过标注与工具调用和分支判断绑定：
- `%% tool:diagnose_network` — 标记工具执行节点
- `%% branch:account_error` — 标记条件分支
Agent Runner 在执行过程中实时追踪当前所处节点，并将高亮后的流程图推送至前端和坐席工作台。

**2）微观大模型自由发挥 — ReAct 循环**
在每个流程节点内部，模型自主完成：
- **意图识别：** 判断用户当前说的是什么意思（查账单？退订？投诉？）
- **槽位提取：** 从用户话语中提取所需参数（手机号、月份、服务ID）
- **柔性对话：** 当用户情绪宣泄、跳跃提问或表达模糊时，模型自行安抚、澄清或兜底
- **工具调用：** 按 Skill 中定义的流程调用 MCP 工具

**3）实时可视化联动**
`runner.ts` 的 `onStepFinish` 回调在每次工具调用后：
1. 根据 `SKILL_TOOL_MAP` 找到当前 Skill 的 Mermaid 源；
2. 调用 `highlightMermaidTool()` 对工具节点黄色高亮；
3. 对诊断类工具，解析结果后调用 `determineBranch()` + `highlightMermaidBranch()` 对分支绿色高亮；
4. 通过 `onDiagramUpdate` 回调推送 `skill_diagram_update` 事件。

坐席在工作台上可以实时看到流程图中"当前执行到了哪一步"以及"走了哪个分支"，实现全程可观测。