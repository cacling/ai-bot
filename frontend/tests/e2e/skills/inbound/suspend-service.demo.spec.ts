/**
 * suspend-service.demo.spec.ts
 *
 * 停机保号 Demo Flow E2E
 *
 * 目标：
 * 1. 用 skill-creator 会话模拟“右侧 AI 助手”先做需求澄清与流程理解
 * 2. 明确验证“缺关键工具就不继续落地”的 gate
 * 3. 保存一份可发布的停机保号技能草稿（SKILL.md + references + assets）
 * 4. 同步 Tool Call Plan，跑版本测试，再发布
 * 5. 发布后在在线客服中验证“停机保号”意图可被识别
 *
 * 说明：
 * - 这条用例刻意采用“混合式”策略：
 *   - AI 澄清 / Tool gate / 版本 / 发布：走稳定 API
 *   - 在线客服命中：走真实页面
 * - 语音场景共享逻辑先通过 channels + 版本测试覆盖，单独的 voice UI 录音链路留给后续 e2e
 */
import { test, expect, type Browser } from '@playwright/test';
import { waitForChatWs, sendMessage, waitForBotReply, getLastBotReply } from '../../fixtures/chat-helpers';

const API = 'http://127.0.0.1:18472/api';
const SKILL_NAME = `suspend-service-demo-${Date.now().toString(36)}`;

const FLOWCHART_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="780" height="2140" viewBox="0 0 780 2140">
  <rect width="780" height="2140" fill="#ffffff"/>
  <defs>
    <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
      <path d="M0,0 L9,3 L0,6 Z" fill="#222222"/>
    </marker>
    <style>
      .box { fill: #ffffff; stroke: #222222; stroke-width: 3; rx: 12; }
      .diamond { fill: #ffffff; stroke: #222222; stroke-width: 3; }
      .line { fill: none; stroke: #222222; stroke-width: 4; marker-end: url(#arrow); }
      .label { font-family: Arial, sans-serif; font-size: 20px; fill: #222222; text-anchor: middle; }
      .small { font-family: Arial, sans-serif; font-size: 18px; fill: #222222; }
      .title { font-family: Arial, sans-serif; font-size: 22px; font-weight: 700; fill: #222222; text-anchor: middle; }
    </style>
  </defs>

  <rect class="box" x="250" y="20" width="280" height="74"/>
  <text class="title" x="390" y="65">识别停机保号意图</text>

  <rect class="box" x="250" y="150" width="280" height="74"/>
  <text class="title" x="390" y="195">确认办理当前号码</text>

  <rect class="box" x="250" y="280" width="280" height="74"/>
  <text class="title" x="390" y="325">OTP 身份鉴权</text>

  <rect class="box" x="250" y="410" width="280" height="74"/>
  <text class="title" x="390" y="455">查询欠费状态</text>

  <path class="line" d="M390 94 L390 150"/>
  <path class="line" d="M390 224 L390 280"/>
  <path class="line" d="M390 354 L390 410"/>

  <polygon class="diamond" points="390,540 470,620 390,700 310,620"/>
  <text class="title" x="390" y="610">是否欠</text>
  <text class="title" x="390" y="642">费</text>
  <path class="line" d="M390 484 L390 540"/>

  <rect class="box" x="20" y="760" width="200" height="92"/>
  <text class="title" x="120" y="805">中断办理</text>
  <text class="title" x="120" y="835">先结清欠费</text>

  <rect class="box" x="460" y="760" width="220" height="92"/>
  <text class="title" x="570" y="805">查询在途合约</text>

  <path class="line" d="M332 678 L120 760"/>
  <path class="line" d="M448 678 L570 760"/>
  <text class="small" x="80" y="708">是</text>
  <text class="small" x="494" y="708">否</text>

  <polygon class="diamond" points="570,920 670,1020 570,1120 470,1020"/>
  <text class="title" x="570" y="1002">是否存在在</text>
  <text class="title" x="570" y="1034">途合约</text>
  <path class="line" d="M570 852 L570 920"/>

  <rect class="box" x="260" y="1180" width="180" height="76"/>
  <text class="title" x="350" y="1225">高风险提醒</text>
  <path class="line" d="M512 1090 L350 1180"/>
  <text class="small" x="444" y="1120">是</text>

  <polygon class="diamond" points="350,1320 450,1420 350,1520 250,1420"/>
  <text class="title" x="350" y="1402">客户是否</text>
  <text class="title" x="350" y="1434">继续</text>
  <path class="line" d="M350 1256 L350 1320"/>

  <rect class="box" x="250" y="1580" width="150" height="72"/>
  <text class="title" x="325" y="1625">结束</text>
  <path class="line" d="M318 1498 L325 1580"/>
  <text class="small" x="280" y="1538">否</text>

  <rect class="box" x="430" y="1580" width="250" height="78"/>
  <text class="title" x="555" y="1624">告知资费与生效规则</text>
  <path class="line" d="M392 1498 L555 1580"/>
  <text class="small" x="458" y="1538">是</text>

  <path class="line" d="M650 1105 C700 1180 705 1440 650 1580"/>
  <text class="small" x="680" y="1290">否</text>

  <polygon class="diamond" points="555,1720 665,1830 555,1940 445,1830"/>
  <text class="title" x="555" y="1810">客户确认立</text>
  <text class="title" x="555" y="1842">即办理</text>
  <path class="line" d="M555 1658 L555 1720"/>

  <rect class="box" x="420" y="1990" width="150" height="72"/>
  <text class="title" x="495" y="2035">结束</text>
  <path class="line" d="M520 1912 L495 1990"/>
  <text class="small" x="500" y="1950">否</text>

  <rect class="box" x="610" y="1990" width="150" height="72"/>
  <text class="title" x="685" y="2035">执行停机保号</text>
  <path class="line" d="M600 1912 L685 1990"/>
  <text class="small" x="650" y="1950">是</text>

  <rect class="box" x="610" y="2088" width="150" height="72"/>
  <text class="title" x="685" y="2132">返回办理结果</text>
  <path class="line" d="M685 2062 L685 2088"/>
</svg>
`;

async function renderFlowchartImage(browser: Browser): Promise<string> {
  const page = await browser.newPage({
    viewport: { width: 780, height: 2140 },
    deviceScaleFactor: 1,
  });
  try {
    await page.setContent(
      `<html><body style="margin:0; background:#fff;">${FLOWCHART_SVG}</body></html>`,
      { waitUntil: 'load' },
    );
    const png = await page.locator('svg').screenshot({ type: 'png' });
    return `data:image/png;base64,${png.toString('base64')}`;
  } finally {
    await page.close();
  }
}

const VALID_SKILL_MD = `---
name: ${SKILL_NAME}
description: 停机保号办理技能，处理“暂时不用号码但不想销号”的咨询与办理请求
metadata:
  version: "1.0.0"
  tags: ["suspend", "hold-number", "telecom", "service", "e2e"]
  mode: inbound
  trigger: user_intent
  channels: ["online", "voice"]
---
# 停机保号 Skill

你是一名电信业务办理专家。帮助用户完成停机保号的规则咨询、资格核验和合规办理，禁止把停机保号与销号、普通停机混为一谈。

## 触发条件

- 用户表示号码暂时不用，但不想销号
- 用户提到“停机保号”“保留号码”“暂停服务但保留号码”
- 用户咨询停机保号的费用、生效时间、恢复方式

## 工具与分类

### 问题分类

| 用户描述 | 类型 |
|---------|------|
| 我要停机保号、先把号码留着 | 办理停机保号 |
| 停机保号怎么收费、什么时候生效 | 规则咨询 |
| 这个号码暂时不用，但不能注销 | 意图澄清 |

### 工具说明

- \`verify_identity(phone, otp)\` — 身份校验，确认是否本人办理
- \`check_account_balance(phone)\` — 查询欠费与当前账户状态
- \`check_contracts(phone)\` — 查询有效合约和高风险限制
- \`apply_service_suspension(phone)\` — 执行停机保号办理

## 客户引导状态图

\`\`\`mermaid
stateDiagram-v2
    [*] --> 接收诉求: 用户表示号码暂时不用但要保留 %% step:receive-request %% kind:llm

    接收诉求 --> 用户要求转人工: 用户直接要求人工 %% step:request-human %% kind:human
    用户要求转人工 --> 转人工处理: 引导转人工处理 %% step:handoff %% kind:end
    转人工处理 --> [*]

    接收诉求 --> 意图澄清: 区分停机保号 / 销号 / 普通停机 %% step:clarify-intent %% kind:llm
    state 意图结果 <<choice>>
    意图澄清 --> 意图结果
    意图结果 --> 身份校验: 确认是停机保号 %% step:verify-identity %% kind:tool %% tool:verify_identity %% guard:user.confirm
    意图结果 --> 解释其他办理路径: 不是停机保号，改走其他渠道 %% step:redirect-other %% kind:end %% guard:user.cancel
    解释其他办理路径 --> [*]

    state 身份结果 <<choice>>
    身份校验 --> 身份结果
    身份结果 --> 查询欠费: 身份通过 %% step:check-balance %% kind:tool %% tool:check_account_balance %% guard:tool.success
    身份结果 --> 重新核验: 身份未通过，补充校验信息 %% step:retry-verify %% kind:end %% guard:tool.error
    重新核验 --> [*]

    state 欠费结果 <<choice>>
    查询欠费 --> 欠费结果
    欠费结果 --> 查询合约: 账户正常 %% step:check-contracts %% kind:tool %% tool:check_contracts %% guard:always
    欠费结果 --> 欠费阻断: 存在欠费，先结清再办理 %% ref:suspension-policy.md#欠费限制 %% step:block-arrears %% kind:end %% guard:always
    欠费阻断 --> [*]

    state 合约结果 <<choice>>
    查询合约 --> 合约结果
    合约结果 --> 规则告知: 无高风险限制，继续告知规则 %% ref:pricing-rules.md#停机保号费用与生效 %% step:explain-rules %% kind:llm %% guard:always
    合约结果 --> 高风险升级: 存在限制性合约，转人工处理 %% ref:suspension-policy.md#高风险场景 %% step:block-contract %% kind:end %% guard:always
    高风险升级 --> [*]

    规则告知 --> 用户确认办理: 明确告知下月1号生效、5元/月、恢复方式 %% step:confirm-apply %% kind:human
    state 用户确认结果 <<choice>>
    用户确认办理 --> 用户确认结果
    用户确认结果 --> 办理停机保号: 用户明确确认 %% step:apply-suspension %% kind:tool %% tool:apply_service_suspension %% guard:user.confirm
    用户确认结果 --> 用户暂不办理: 用户暂不办理，仅完成咨询 %% step:user-cancel %% kind:end %% guard:user.cancel
    用户暂不办理 --> [*]

    state 办理结果 <<choice>>
    办理停机保号 --> 办理结果
    办理结果 --> 办理成功: 返回办理成功结果 %% ref:assets/suspension-result.md#办理成功 %% step:apply-success %% kind:end %% guard:tool.success
    办理结果 --> 办理失败: 返回失败原因并引导下一步 %% ref:assets/suspension-result.md#办理失败 %% step:apply-failed %% kind:end %% guard:tool.error
    办理成功 --> [*]
    办理失败 --> [*]
\`\`\`

## 升级处理

| 升级路径 | 触发条件 | 处理方式 |
|---------|---------|---------|
| \`self_service\` | 规则咨询完成但用户暂不办理 | 告知后续可再次在线办理 |
| \`hotline\` | 工具异常、用户坚持升级 | 转人工热线 |
| \`frontline\` | 合约高风险、规则冲突 | 转一线人工处理 |

## 合规规则

- **不能**未鉴权就直接办理停机保号
- **不能**把停机保号与销号、普通停机混为一谈
- **不能**在欠费、合约限制或工具异常时强行办理
- **必须**先完成 \`verify_identity → check_account_balance → check_contracts\`，再进入规则告知与办理
- **必须**明确告知下个月 1 号生效、保号费 5 元 / 月、服务暂停范围和恢复方式
- **必须**在用户明确确认后，才允许调用 \`apply_service_suspension\`

## 回复规范

- 先确认用户要的是停机保号，不是销号
- 办理前必须解释费用、生效时间、恢复方式和限制项
- 涉及欠费或高风险合约时，优先解释原因，再给下一步建议
- 回复控制在 3 个自然段以内
`;

const INVALID_SKILL_MD = VALID_SKILL_MD
  .replace(`name: ${SKILL_NAME}`, `name: ${SKILL_NAME}-missing-tool`)
  .replace(
    'description: 停机保号办理技能，处理“暂时不用号码但不想销号”的咨询与办理请求',
    'description: 停机保号技能（缺工具演示）',
  )
  .replaceAll('apply_service_suspension', 'nonexistent_suspend_tool');

const REFERENCES = [
  {
    filename: 'pricing-rules.md',
    content: `# 停机保号费用与生效

- 停机保号办理成功后，从**下个月 1 号**开始生效
- 生效后按 **5 元 / 月**收取停机保号费
- 生效后暂停语音、短信、流量服务，但号码保留
- 恢复使用时需办理复机
`,
  },
  {
    filename: 'suspension-policy.md',
    content: `# 停机保号办理限制

## 欠费限制

- 存在欠费时不能直接办理停机保号
- 需先结清欠费，再重新发起办理

## 高风险场景

- 存在限制性合约、高风险套餐或规则冲突时，不能自动放行
- 必须解释原因，并引导人工处理
`,
  },
];

const ASSETS = [
  {
    filename: 'suspension-result.md',
    content: `# 停机保号结果模板

## 办理成功

已为您提交停机保号办理，业务将于下个月 1 号生效，期间按 5 元 / 月收取保号费。

## 办理失败

当前无法直接办理停机保号，请根据失败原因先完成欠费处理或转人工继续办理。
`,
  },
];

const TEST_CASES = [
  {
    input: '我的号码最近不用了，但不要销号，想先停机保号',
    assertions: [
      { type: 'contains', value: '停机保号' },
      { type: 'contains', value: '下个月 1 号' },
    ],
  },
  {
    input: '我想暂停服务，但号码要保留，先帮我看看能不能办',
    assertions: [
      { type: 'contains', value: '5 元' },
      { type: 'contains', value: '确认' },
    ],
  },
];

async function getLatestVersionNo(request: import('@playwright/test').APIRequestContext, skillId: string): Promise<number> {
  const listRes = await request.get(`${API}/skill-versions?skill=${skillId}`);
  expect(listRes.ok()).toBeTruthy();
  const listBody = await listRes.json();
  const versions = listBody.versions ?? [];
  expect(Array.isArray(versions)).toBe(true);
  expect(versions.length).toBeGreaterThan(0);
  return versions[versions.length - 1].version_no;
}

function countSignalHits(text: string | null | undefined, signals: RegExp[]): number {
  if (!text) return 0;
  return signals.reduce((count, signal) => count + (signal.test(text) ? 1 : 0), 0);
}

function expectSignalHits(
  text: string | null | undefined,
  signals: RegExp[],
  minimum: number,
  hint: string,
): void {
  expect(countSignalHits(text, signals), hint).toBeGreaterThanOrEqual(minimum);
}

const CREATOR_REPLY_SIGNALS = [
  /停机保号/,
  /号码/,
  /销号/,
  /办理/,
  /流程/,
  /工具/,
  /鉴权|校验|核验/,
  /欠费/,
  /合约/,
  /规则/,
  /确认/,
  /转人工/,
];

const AUTH_SIGNALS = [/验证码/, /身份验证/, /身份校验/, /核验/, /鉴权/];
const QUERY_SIGNALS = [/查询/, /欠费/, /合约/, /账户状态/, /请稍候/, /继续办理/];
const SAFE_FALLBACK_SIGNALS = [/欠费/, /结清/, /限制/, /不能办理/, /转接/, /人工/, /系统/, /异常/];
const CHAT_REPLY_SIGNALS = [/停机保号/, /保号/, /保留号码/, /不销号/, /验证码/, /身份验证/, /核验/, /下个月/, /5 元/, /确认/, /人工/];
const RECOGNITION_PROMPTS = [
  '我的卡暂时不用了，先帮我停一下，号码给我留着，不要销号。',
  '我想暂停服务，但是不想销号，号码先帮我保留。',
  '最近不用这个手机号了，先留号，后面我再恢复。',
];

test.describe.serial('suspend-service demo flow', () => {
  test.setTimeout(300_000);

  test('DEMO-SS-01 AI 助手可接收停机保号描述与流程图并继续澄清', async ({ request, browser }) => {
    const flowchartImage = await renderFlowchartImage(browser);

    const firstRes = await request.post(`${API}/skill-creator/chat`, {
      data: {
        message: '我想重点演示一个停机保号技能，客户暂时不用号码，但不想销号，希望机器人能做规则解释和办理。',
        enable_thinking: false,
      },
      timeout: 120_000,
    });
    expect(firstRes.ok()).toBeTruthy();
    const firstBody = await firstRes.json();
    expect(firstBody.session_id).toBeTruthy();
    expect(typeof firstBody.reply).toBe('string');
    expect(['interview', 'draft', 'confirm', 'done']).toContain(firstBody.phase);
    expect(firstBody.reply.length > 0 || firstBody.phase === 'interview' || firstBody.phase === 'draft').toBe(true);
    if (firstBody.reply.length > 0) {
      expectSignalHits(firstBody.reply, CREATOR_REPLY_SIGNALS, 1, 'AI 助手首轮应体现与停机保号技能相关的语义信号');
    }

    const secondRes = await request.post(`${API}/skill-creator/chat`, {
      data: {
        session_id: firstBody.session_id,
        message: '流程上要先身份校验，再查欠费，再查合约，再告知规则，最后在用户确认后才能办理。',
        image: flowchartImage,
        enable_thinking: false,
      },
      timeout: 120_000,
    });
    expect(secondRes.ok()).toBeTruthy();
    const secondBody = await secondRes.json();
    expect(secondBody.session_id).toBe(firstBody.session_id);
    expect(typeof secondBody.reply).toBe('string');
    expect(typeof secondBody.vision_result).toBe('string');
    expect(secondBody.vision_result.length).toBeGreaterThan(50);
    expect(
      secondBody.reply.length > 10 || secondBody.phase === 'interview' || secondBody.phase === 'draft',
    ).toBe(true);
    expectSignalHits(secondBody.vision_result, CREATOR_REPLY_SIGNALS, 3, '流程图理解结果应覆盖关键业务节点');
    if (secondBody.reply.length > 0) {
      expectSignalHits(secondBody.reply, CREATOR_REPLY_SIGNALS, 1, 'AI 助手二轮回复应继续围绕技能澄清或生成');
    }
  });

  test('DEMO-SS-02 缺关键工具时不会伪装为可落地技能', async ({ request }) => {
    const saveRes = await request.post(`${API}/skill-creator/save`, {
      data: {
        skill_name: `${SKILL_NAME}-missing-tool`,
        skill_md: INVALID_SKILL_MD,
        references: REFERENCES,
        assets: ASSETS,
      },
      timeout: 120_000,
    });
    expect(saveRes.status()).toBe(422);
    const body = await saveRes.json();
    expect(typeof body.error).toBe('string');
    expect(body.error).toContain('技能校验未通过');
    expect(Array.isArray(body.validation_errors)).toBe(true);
    expect(body.validation_errors.some((item: { rule?: string; message?: string }) =>
      item.rule === 'ref.tool_missing' && item.message?.includes('nonexistent_suspend_tool'),
    )).toBe(true);
  });

  test('DEMO-SS-03 保存停机保号技能草稿并写入 references / assets / 版本', async ({ request }) => {
    const toolsRes = await request.get(`${API}/mcp/tools`);
    expect(toolsRes.ok()).toBeTruthy();
    const toolsBody = await toolsRes.json();
    const toolNames = (toolsBody.items ?? []).map((item: { name: string }) => item.name);
    expect(toolNames).toContain('verify_identity');
    expect(toolNames).toContain('check_account_balance');
    expect(toolNames).toContain('check_contracts');
    expect(toolNames).toContain('apply_service_suspension');

    const saveRes = await request.post(`${API}/skill-creator/save`, {
      data: {
        skill_name: SKILL_NAME,
        skill_md: VALID_SKILL_MD,
        references: REFERENCES,
        assets: ASSETS,
        test_cases: TEST_CASES,
      },
      timeout: 120_000,
    });
    expect(saveRes.ok()).toBeTruthy();
    const saveBody = await saveRes.json();
    expect(saveBody.ok).toBe(true);
    expect(saveBody.skill_id).toBe(SKILL_NAME);
    expect(saveBody.is_new).toBe(true);
    expect(saveBody.tools_ready).toBe(true);
    expect(saveBody.test_cases_count).toBe(2);

    const skillFileRes = await request.get(`${API}/files/content?path=backend/skills/biz-skills/${SKILL_NAME}/SKILL.md`);
    expect(skillFileRes.ok()).toBeTruthy();
    const skillFileBody = await skillFileRes.json();
    expect(skillFileBody.content).toContain('停机保号 Skill');
    expect(skillFileBody.content).toContain('apply_service_suspension');

    const refRes = await request.get(`${API}/files/content?path=backend/skills/biz-skills/${SKILL_NAME}/references/pricing-rules.md`);
    expect(refRes.ok()).toBeTruthy();
    const refBody = await refRes.json();
    expect(refBody.content).toContain('5 元 / 月');

    const versionNo = await getLatestVersionNo(request, SKILL_NAME);
    expect(versionNo).toBe(1);
  });

  test('DEMO-SS-04 同步 Tool Call Plan，并在版本测试中验证核验入口与安全兜底', async ({ request }) => {
    const syncRes = await request.post(`${API}/skills/${SKILL_NAME}/sync-bindings`);
    expect(syncRes.ok()).toBeTruthy();
    const syncBody = await syncRes.json();
    expect(syncBody.ok).toBe(true);
    expect(syncBody.count).toBeGreaterThanOrEqual(4);

    const bindingsRes = await request.get(`${API}/skills/${SKILL_NAME}/tool-bindings`);
    expect(bindingsRes.ok()).toBeTruthy();
    const bindingsBody = await bindingsRes.json();
    const bindingNames = (bindingsBody.items ?? []).map((item: { tool_name: string }) => item.tool_name);
    expect(bindingNames).toContain('verify_identity');
    expect(bindingNames).toContain('check_account_balance');
    expect(bindingNames).toContain('check_contracts');
    expect(bindingNames).toContain('apply_service_suspension');

    const versionNo = await getLatestVersionNo(request, SKILL_NAME);

    const happyOpening = '手机号 13800000002 暂时不用了，但号码别注销，我想办停机保号。';
    const happyIntakeRes = await request.post(`${API}/skill-versions/test`, {
      data: {
        skill: SKILL_NAME,
        version_no: versionNo,
        message: happyOpening,
        persona: { phone: '13800000002', name: '李四', status: 'active' },
      },
      timeout: 120_000,
    });
    expect(happyIntakeRes.ok()).toBeTruthy();
    const happyIntakeBody = await happyIntakeRes.json();
    expect(typeof happyIntakeBody.text).toBe('string');
    expect(happyIntakeBody.text.length).toBeGreaterThan(10);
    expectSignalHits(happyIntakeBody.text, AUTH_SIGNALS, 1, 'happy path 首轮应引导身份核验');
    expect(happyIntakeBody.session_id).toBeTruthy();

    const happyVerifyRes = await request.post(`${API}/skill-versions/test`, {
      data: {
        skill: SKILL_NAME,
        version_no: versionNo,
        session_id: happyIntakeBody.session_id,
        history: [
          { role: 'user', content: happyOpening },
          { role: 'assistant', content: happyIntakeBody.text },
        ],
        message: '验证码是 1234，请继续办理停机保号。',
        persona: { phone: '13800000002', name: '李四', status: 'active' },
      },
      timeout: 120_000,
    });
    expect(happyVerifyRes.ok()).toBeTruthy();
    const happyVerifyBody = await happyVerifyRes.json();
    expect(typeof happyVerifyBody.text).toBe('string');
    expect(happyVerifyBody.text.length).toBeGreaterThan(10);
    expect(happyVerifyBody.session_id).toBe(happyIntakeBody.session_id);
    expectSignalHits(happyVerifyBody.text, QUERY_SIGNALS, 2, '核验通过后应进入查询阶段');
    expectSignalHits(happyVerifyBody.skill_diagram?.progressState ?? '', [/查询欠费/, /查询合约/], 1, '流程图进度应推进到查询阶段');

    const happyConsultRes = await request.post(`${API}/skill-versions/test`, {
      data: {
        skill: SKILL_NAME,
        version_no: versionNo,
        session_id: happyIntakeBody.session_id,
        history: [
          { role: 'user', content: happyOpening },
          { role: 'assistant', content: happyIntakeBody.text },
          { role: 'user', content: '验证码是 1234，请继续办理停机保号。' },
          { role: 'assistant', content: happyVerifyBody.text },
        ],
        message: '请直接继续查询结果，并告诉我停机保号费用、生效时间和恢复方式。',
        persona: { phone: '13800000002', name: '李四', status: 'active' },
      },
      timeout: 120_000,
    });
    expect(happyConsultRes.ok()).toBeTruthy();
    const happyConsultBody = await happyConsultRes.json();
    expect(typeof happyConsultBody.text).toBe('string');
    expect(happyConsultBody.text.length).toBeGreaterThan(10);
    expectSignalHits(
      happyConsultBody.text,
      [/下个月/, /5 元/, /保号费/, /生效/, /恢复方式/, /转接/, /人工/, /系统/, /异常/],
      1,
      '查询后回复应包含规则说明或明确的安全兜底',
    );
    expect(/办理成功|已为您提交/.test(happyConsultBody.text)).toBe(false);
    expect(happyConsultBody.skill_diagram?.mermaid ?? '').toContain('stateDiagram');

    const blockedOpening = '手机号 13800000003 先帮我停机保号，我不想销号。';
    const blockedIntakeRes = await request.post(`${API}/skill-versions/test`, {
      data: {
        skill: SKILL_NAME,
        version_no: versionNo,
        message: blockedOpening,
        persona: { phone: '13800000003', name: '王五', status: 'suspended' },
      },
      timeout: 120_000,
    });
    expect(blockedIntakeRes.ok()).toBeTruthy();
    const blockedIntakeBody = await blockedIntakeRes.json();
    expectSignalHits(blockedIntakeBody.text, AUTH_SIGNALS, 1, 'blocked path 首轮也应先引导身份核验');

    const blockedVerifyRes = await request.post(`${API}/skill-versions/test`, {
      data: {
        skill: SKILL_NAME,
        version_no: versionNo,
        session_id: blockedIntakeBody.session_id,
        history: [
          { role: 'user', content: blockedOpening },
          { role: 'assistant', content: blockedIntakeBody.text },
        ],
        message: '验证码是 1234，请继续办理停机保号。',
        persona: { phone: '13800000003', name: '王五', status: 'suspended' },
      },
      timeout: 120_000,
    });
    expect(blockedVerifyRes.ok()).toBeTruthy();
    const blockedVerifyBody = await blockedVerifyRes.json();
    expectSignalHits(blockedVerifyBody.text, QUERY_SIGNALS, 2, 'blocked path 核验通过后也应进入查询阶段');

    const blockedRes = await request.post(`${API}/skill-versions/test`, {
      data: {
        skill: SKILL_NAME,
        version_no: versionNo,
        session_id: blockedIntakeBody.session_id,
        history: [
          { role: 'user', content: blockedOpening },
          { role: 'assistant', content: blockedIntakeBody.text },
          { role: 'user', content: '验证码是 1234，请继续办理停机保号。' },
          { role: 'assistant', content: blockedVerifyBody.text },
        ],
        message: '请继续查询，如果不能办理请明确告诉我原因。',
        persona: { phone: '13800000003', name: '王五', status: 'suspended' },
      },
      timeout: 120_000,
    });
    expect(blockedRes.ok()).toBeTruthy();
    const blockedBody = await blockedRes.json();
    expect(typeof blockedBody.text).toBe('string');
    expect(blockedBody.text.length).toBeGreaterThan(10);
    expectSignalHits(blockedBody.text, SAFE_FALLBACK_SIGNALS, 1, 'blocked path 应明确给出阻断原因或安全兜底');
    expect(/办理成功|已为您提交/.test(blockedBody.text)).toBe(false);
  });

  test('DEMO-SS-05 发布后在线客服能够识别停机保号意图', async ({ request, page }) => {
    const versionNo = await getLatestVersionNo(request, SKILL_NAME);

    const publishRes = await request.post(`${API}/skill-versions/publish`, {
      data: { skill: SKILL_NAME, version_no: versionNo },
      timeout: 120_000,
    });
    expect(publishRes.ok()).toBeTruthy();
    const publishBody = await publishRes.json();
    expect(publishBody.success ?? publishBody.ok).toBeTruthy();

    const wsReady = waitForChatWs(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '智能客服小通' })).toBeVisible();
    await wsReady;

    await sendMessage(page, '我的卡暂时不用了，先帮我停一下，号码给我留着，不要销号。');
    await waitForBotReply(page);
    const reply = await getLastBotReply(page);

    expect(reply.length, '在线客服回复不应为空').toBeGreaterThan(10);
    expectSignalHits(reply, CHAT_REPLY_SIGNALS, 1, '在线客服应识别为停机保号相关诉求并给出对应回复');
  });

  test('DEMO-SS-06 已发布技能在多种表达下保持稳定识别', async ({ request }) => {
    const successes: Array<{ prompt: string; matchedSkill: boolean; signalHits: number; reply: string }> = [];

    for (const [index, prompt] of RECOGNITION_PROMPTS.entries()) {
      const sessionId = `e2e-suspend-recognition-${Date.now().toString(36)}-${index}`;
      const res = await request.post(`${API}/chat`, {
        data: {
          session_id: sessionId,
          message: prompt,
          user_phone: '13800000002',
        },
        timeout: 120_000,
      });
      expect(res.ok(), `第 ${index + 1} 个识别样本请求失败`).toBeTruthy();
      const body = await res.json();
      const reply = String(body.response ?? body.text ?? '');
      const matchedSkill = body.skill_diagram?.skill_name === SKILL_NAME;
      const signalHits = countSignalHits(reply, CHAT_REPLY_SIGNALS);

      successes.push({ prompt, matchedSkill, signalHits, reply });
    }

    const passed = successes.filter(item => item.matchedSkill || item.signalHits >= 1);
    expect(
      passed.length,
      `停机保号识别稳定性不足：${JSON.stringify(successes, null, 2)}`,
    ).toBeGreaterThanOrEqual(2);
  });
});
