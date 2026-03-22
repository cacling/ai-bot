# Voice Tool Processor 设计文档

> 语音通道工具结果经文字 LLM 加工后再喂给 GLM-Realtime

## 背景与问题

语音客服通道（GLM-Realtime）存在三个问题：

1. **数字幻觉**：GLM-Realtime-Flash 拿到工具返回的 JSON 后自行组织回复，频繁出现数字引用错误（如"增值业务费从 ¥15 增加到 ¥15"，实际应为 ¥25）
2. **无 Skill 编排**：voice.ts 第 125 行排除了 `get_skill_instructions` 等 builtin 工具，GLM 无法加载 SKILL.md，没有对比模式规则、回复模板、数据闸门等约束
3. **两个声音**：GLM 原生语音与某些场景的 TTS 合成产生两个不同声源

根因：语音通道绕过了 Skill 编排层（runner.ts），GLM-Realtime 既当"嘴"又当"脑"，但其推理能力不足以准确处理结构化数据。

## 方案

**GLM-Realtime 只负责听（ASR）、说（TTS）、决定调哪个工具（function calling）。文字 LLM（SiliconFlow）负责"想"。**

所有 MCP 工具的结果，在喂回 GLM 之前，先经过文字 LLM + Skill 上下文加工，生成口语化回复文本。GLM 收到的不是原始 JSON，而是"请直接朗读以下内容"的指令。

### 不可行的替代方案

- **流式加工**（文字 LLM 一边吐，GLM 一边讲）：GLM-Realtime 协议的 `function_call_output` 不支持流式输入，必须一次性发送完整文本。延迟增加约 1-2 秒，可接受。
- **只加工部分工具**：维护白名单增加复杂度，统一路径更简单可靠。

## 数据流

```
用户语音
  → GLM-Realtime（ASR + function calling 决策）
  → MCP 工具调用（~0.2s）
  → voice-tool-processor（~1-2s）
      ├─ 推断 activeSkillName（从工具名映射）
      ├─ 加载 SKILL.md（getSkillContent）
      ├─ 构建 prompt（system + skill + 对话历史 + 工具结果）
      └─ SiliconFlow generateText → 口语化回复文本
  → "请直接朗读以下内容：{文本}" → GLM function_call_output
  → GLM 朗读（tongtong 统一声音，~0.3s 首包）
```

## 新增文件

### `backend/src/services/voice-tool-processor.ts`

职责：接收工具结果 + Skill 上下文，调用文字 LLM 生成口语化回复。

```typescript
interface VoiceToolProcessInput {
  toolName: string;
  toolArgs: Record<string, unknown>;
  toolResult: string;           // MCP 返回的原始 JSON string
  toolSuccess: boolean;
  userPhone: string;
  lang: 'zh' | 'en';
  activeSkillName: string | null;
  conversationHistory: Array<{ role: string; content: string }>;
}

interface VoiceToolProcessOutput {
  spokenText: string;           // GLM 应该朗读的完整回复文本
  skillLoaded: string | null;   // 实际加载的 skill 名称
}

async function processToolResultForVoice(
  input: VoiceToolProcessInput
): Promise<VoiceToolProcessOutput>
```

**内部流程**：

1. 根据 `activeSkillName` 调用 `getSkillContent(skillName)` 获取 SKILL.md
2. 构建 prompt：基础指令 + Skill SOP + 对话历史 + 工具调用与结果
3. 调用 SiliconFlow `generateText`（非流式）
4. 返回生成的口语化文本

**Prompt 结构**：

```
[系统] 你是电信客服"小通"的回复生成器。根据工具返回的数据生成口语化回复。

规则：
- 所有数字必须严格引用工具返回的数据，禁止自行计算或推断
- 回复控制在 2-3 句话，适合语音播报
- 不要使用 Markdown 或特殊符号
- 语气温暖亲切，像真人客服

{SKILL.md 内容（如有）}

[用户最近说了] {从对话历史提取}
[工具调用] {toolName}({toolArgs})
[工具返回] {toolResult}

请生成回复：
```

**错误处理**：
- 文字 LLM 超时（5 秒）或调用失败 → fallback 到原始行为（工具 JSON 直接喂 GLM）
- Skill 加载失败 → 无 Skill 上下文但仍走文字 LLM（通用 prompt）

## 修改文件

### `backend/src/chat/voice.ts`

改动工具结果处理路径（第 435-484 行区域）：

1. **activeSkillName 推断提前**：从工具结果发送之后移到 `processToolResultForVoice` 调用之前
2. **插入文字 LLM 加工**：调用 `processToolResultForVoice` 获取 spokenText
3. **包装朗读指令**：function_call_output 设为 `"请直接朗读以下内容，不要添加或修改任何内容：\n\n{spokenText}"`
4. **翻译逻辑调整**：`lang` 传给 `processToolResultForVoice`，由文字 LLM 直接生成目标语言回复，不再单独翻译

**不改动的部分**：
- GLM session 配置、工具定义、音频流转发
- `transfer_to_human` 专属路径（第 396-417 行）
- `ttsOverride`（非中文翻译场景）
- mock 工具路径的结果也走 `processToolResultForVoice`

## 解决的问题

| 问题 | 解决方式 |
|------|---------|
| 数字幻觉 | 文字 LLM 有 Skill 规则约束（数据闸门、对比模式），严格引用工具数据 |
| 两个声音 | GLM 统一用 tongtong 朗读完整文本，不再出现 TTS 第二声源 |
| 无 Skill 编排 | 文字 LLM 加载完整 SKILL.md，回复质量对齐文字客服 |

## 延迟影响

| 环节 | 当前 | 新方案 |
|------|------|--------|
| MCP 工具调用 | ~0.2s | ~0.2s（不变） |
| 文字 LLM 加工 | 无 | ~1-2s（新增） |
| GLM 生成回复 | ~0.5-1s（需理解 JSON） | ~0.3s（只朗读，更快） |
| **总计** | ~0.7-1.2s | ~1.5-2.5s |

增加约 1 秒，对语音场景可接受。

## 不改动

- 文字客服通道（chat-ws + runner.ts）
- MCP Server 层
- mock_apis 层
- GLM-Realtime session 配置和工具定义
