# Voice Tool Processor 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 语音通道工具结果经文字 LLM（SiliconFlow）+ Skill 上下文加工后，再喂给 GLM-Realtime 朗读，解决数字幻觉、无 Skill 编排、双声源问题。

**Architecture:** 新增 `voice-tool-processor.ts` 服务，接收工具结果 + Skill 上下文，调用 SiliconFlow generateText 生成口语化回复。修改 `voice.ts` 工具结果处理路径，所有 MCP 工具结果经此服务加工后以"朗读指令"形式喂给 GLM。

**Tech Stack:** Vercel AI SDK（generateText）、SiliconFlow LLM、现有 skills.ts Skill 加载机制

**Spec:** `docs/superpowers/specs/2026-03-22-voice-tool-processor-design.md`

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `backend/src/services/voice-tool-processor.ts` | 新建 | 接收工具结果 + Skill 上下文，调用文字 LLM 生成口语化回复 |
| `backend/src/chat/voice.ts` | 修改 | 工具结果处理路径改为经过 processToolResultForVoice |
| `tests/unittest/backend/voice-tool-processor.test.ts` | 新建 | voice-tool-processor 单元测试 |

---

### Task 1: 创建 voice-tool-processor 服务（含测试）

**Files:**
- Create: `backend/src/services/voice-tool-processor.ts`
- Create: `tests/unittest/backend/voice-tool-processor.test.ts`

- [ ] **Step 1: 写 voice-tool-processor.ts 基本结构**

```typescript
// backend/src/services/voice-tool-processor.ts
import { generateText } from 'ai';
import { siliconflow } from '../engine/llm';
import { getSkillContent, getToolSkillMap, getToolToSkillsMap } from '../engine/skills';
import { logger } from './logger';

const VOICE_PROCESS_MODEL = process.env.VOICE_PROCESS_MODEL ?? process.env.SILICONFLOW_CHAT_MODEL ?? 'Qwen/Qwen2.5-72B-Instruct';
const VOICE_PROCESS_TIMEOUT = 5000;

export interface VoiceToolProcessInput {
  toolName: string;
  toolArgs: Record<string, unknown>;
  toolResult: string;
  toolSuccess: boolean;
  userPhone: string;
  lang: 'zh' | 'en';
  activeSkillName: string | null;
  conversationHistory: Array<{ role: string; content: string }>;
}

export interface VoiceToolProcessOutput {
  spokenText: string;
  skillLoaded: string | null;
}

/**
 * 推断工具对应的 skill 名称。
 * 与 voice.ts 中的推断逻辑一致，提取为独立函数供复用。
 */
export function inferSkillName(toolName: string, current: string | null): string | null {
  if (current) return current;
  const toolSkillMap = getToolSkillMap();
  if (toolSkillMap[toolName]) return toolSkillMap[toolName];
  const allMap = getToolToSkillsMap();
  const candidates = allMap.get(toolName);
  if (candidates && candidates.length > 0) {
    const inbound = candidates.filter(s => !s.startsWith('outbound-'));
    if (inbound.length > 0) return inbound[0];
  }
  return null;
}

export function buildSystemPrompt(skillContent: string | null, lang: 'zh' | 'en'): string {
  const langInstruction = lang === 'en'
    ? 'You MUST respond in English only. Translate any Chinese data into English.'
    : '';

  const base = `你是电信客服"小通"的回复生成器。你的任务是根据工具返回的数据，生成一段口语化的客服回复。

严格规则：
- 所有数字（金额、用量、日期）必须严格引用工具返回数据中的原始值，禁止自行计算、推断或四舍五入
- 如果工具返回了 summary 字段，优先直接复述 summary 内容
- 如果工具返回了 changed_items_text 数组，逐条引用
- 回复控制在 2-3 句话，适合语音播报
- 不要使用 Markdown、特殊符号、括号注释
- 语气温暖亲切，像真人客服说话
- 如果工具调用失败，坦诚告知用户，不要编造数据
${langInstruction}`;

  if (skillContent) {
    return base + '\n\n---\n### 当前技能操作指南（严格遵循）\n\n' + skillContent;
  }
  return base;
}

export function buildUserMessage(input: VoiceToolProcessInput): string {
  const lastUserMsg = [...input.conversationHistory]
    .reverse()
    .find(t => t.role === 'user')?.content ?? '';

  return `用户（手机号 ${input.userPhone}）说：${lastUserMsg}

工具调用：${input.toolName}(${JSON.stringify(input.toolArgs)})
工具返回（${input.toolSuccess ? '成功' : '失败'}）：
${input.toolResult}

请生成口语化回复：`;
}

export async function processToolResultForVoice(
  input: VoiceToolProcessInput,
): Promise<VoiceToolProcessOutput> {
  const t0 = Date.now();
  const skillName = inferSkillName(input.toolName, input.activeSkillName);
  const skillContent = skillName ? getSkillContent(skillName) : null;

  try {
    const result = await generateText({
      model: siliconflow(VOICE_PROCESS_MODEL),
      system: buildSystemPrompt(skillContent, input.lang),
      messages: [{ role: 'user', content: buildUserMessage(input) }],
      maxTokens: 300,
      temperature: 0.3,
      abortSignal: AbortSignal.timeout(VOICE_PROCESS_TIMEOUT),
    });

    const spokenText = result.text.trim();
    logger.info('voice-processor', 'generated', {
      tool: input.toolName,
      skill: skillName,
      lang: input.lang,
      chars: spokenText.length,
      ms: Date.now() - t0,
    });

    return { spokenText, skillLoaded: skillName };
  } catch (err) {
    logger.error('voice-processor', 'fallback', {
      tool: input.toolName,
      error: String(err),
      ms: Date.now() - t0,
    });
    // Fallback: 返回空，调用方会降级到原始行为
    return { spokenText: '', skillLoaded: null };
  }
}
```

- [ ] **Step 2: 写单元测试**

```typescript
// tests/unittest/backend/voice-tool-processor.test.ts
import { describe, test, expect } from 'bun:test';
import { inferSkillName, buildSystemPrompt, buildUserMessage } from '../../../backend/src/services/voice-tool-processor';

// 注意：processToolResultForVoice 依赖外部 LLM，不在单元测试中测试
// 这里测试纯函数逻辑

describe('voice-tool-processor', () => {
  describe('inferSkillName', () => {
    test('returns current if already set', () => {
      expect(inferSkillName('query_bill', 'bill-inquiry')).toBe('bill-inquiry');
    });

    test('returns null for unknown tool with no current', () => {
      // getToolSkillMap/getToolToSkillsMap 依赖 skills cache
      // 在无 skill 文件环境下应返回 null
      const result = inferSkillName('nonexistent_tool_xyz', null);
      expect(result).toBeNull();
    });
  });
});
```

- [ ] **Step 3: 运行测试确认通过**

Run: `cd backend && bun test ../tests/unittest/backend/voice-tool-processor.test.ts`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add backend/src/services/voice-tool-processor.ts tests/unittest/backend/voice-tool-processor.test.ts
git commit -m "feat: add voice-tool-processor service for text LLM processing of tool results"
```

---

### Task 2: 修改 voice.ts 集成 voice-tool-processor

**Files:**
- Modify: `backend/src/chat/voice.ts:420-489`

- [ ] **Step 1: 添加 import**

在 voice.ts 顶部 import 区域添加：

```typescript
import { processToolResultForVoice, inferSkillName } from '../services/voice-tool-processor';
```

- [ ] **Step 2: 重写工具结果处理路径**

替换 voice.ts 第 441 行（`state.recordTool` 之后）到第 488 行（`response.create` 发送）之间的代码。

**替换前**（第 441-488 行）：
```typescript
              state.recordTool(toolName, toolArgs, result, success);
              logger.info('voice', 'lang_chain_mcp_result', { ... });
              // ... skill 推断、翻译、发送给 GLM
```

**替换为**：
```typescript
              state.recordTool(toolName, toolArgs, result, success);
              logger.info('voice', 'mcp_result_raw', { session: sessionId, tool: toolName, success, resultPreview: result.slice(0, 200) });

              // ── Skill 推断（提前到文字 LLM 加工之前）──────────────────────
              if (!activeSkillName) {
                activeSkillName = inferSkillName(toolName, null);
              }
              if (activeSkillName) {
                await sendSkillDiagram(ws, userPhone, activeSkillName, null, lang, sessionId, 'voice');
              }

              // ── 文字 LLM 加工：生成口语化回复 ─────────────────────────────
              const conversationHistory = state.turns.map(t => ({ role: t.role, content: t.text }));
              const processed = await processToolResultForVoice({
                toolName, toolArgs, toolResult: result, toolSuccess: success,
                userPhone, lang,
                activeSkillName,
                conversationHistory,
              });

              let toolOutput: string;
              if (processed.spokenText) {
                // 成功：包装朗读指令
                toolOutput = `请直接朗读以下内容，不要添加、修改或省略任何内容：\n\n${processed.spokenText}`;
                logger.info('voice', 'processor_success', { session: sessionId, tool: toolName, skill: processed.skillLoaded, chars: processed.spokenText.length });
              } else {
                // Fallback：文字 LLM 失败，降级到原始行为
                toolOutput = result;
                if (lang === 'en') {
                  try { toolOutput = await translateText(result, 'en'); } catch { /* keep original */ }
                }
                logger.warn('voice', 'processor_fallback', { session: sessionId, tool: toolName });
              }

              glmWs!.send(JSON.stringify({
                event_id: crypto.randomUUID(),
                client_timestamp: Date.now(),
                type: 'conversation.item.create',
                item: { type: 'function_call_output', call_id: msg.call_id, output: toolOutput },
              }));
              glmWs!.send(JSON.stringify({
                event_id: crypto.randomUUID(),
                client_timestamp: Date.now(),
                type: 'response.create',
              }));
              return;
```

- [ ] **Step 3: 清理不再需要的 debug 日志**

移除 Task 1 前添加的临时 debug 日志（`tool_full_result`），已被新的 `mcp_result_raw` 和 `processor_success` 日志替代。

- [ ] **Step 4: 手动测试**

启动服务：`./start.sh`

用语音客服测试以下场景：
1. 问"帮我查本月账单" → 确认 GLM 朗读的金额与 query_bill 返回一致
2. 问"为什么比上个月贵" → 确认 analyze_bill_anomaly 返回的 summary 被正确复述
3. 确认只有一个声音（tongtong），没有第二声源

检查日志：
```bash
grep "processor_success\|processor_fallback\|voice-processor" logs/backend.log | tail -20
```

- [ ] **Step 5: 提交**

```bash
git add backend/src/chat/voice.ts
git commit -m "feat: voice channel tool results processed through text LLM with Skill context

All MCP tool results in voice channel now go through SiliconFlow text LLM
with full Skill SOP before being fed to GLM-Realtime as read-aloud directives.
Fixes: number hallucination, missing Skill guidance, dual-voice issue."
```

---

### Task 3:（可选）outbound.ts 同步改造

outbound.ts 有相同的工具调用路径。如果外呼通道也有数字准确性问题，可以用相同方式集成 voice-tool-processor。此 Task 为可选，视测试结果决定是否执行。

**Files:**
- Modify: `backend/src/chat/outbound.ts`

改动方式与 Task 2 相同：在工具结果返回后、喂给 GLM 之前，插入 `processToolResultForVoice` 调用。
