/**
 * 坐席工作台 UI E2E 测试
 *
 * feature-map: 4. 坐席工作台
 * 入口: /agent
 * WS: /ws/agent?phone=<phone>&lang=<lang>
 */
import { test, expect } from '@playwright/test';

test.describe('工作台页面加载', () => {
  test.skip('AGENT-UI-01: /agent 路径加载坐席工作台布局', async ({ page }) => {});
  test.skip('AGENT-UI-02: 左侧对话区 + 右侧卡片区可调整大小', async ({ page }) => {});
  test.skip('AGENT-UI-03: 顶部 Tab 可切换 对话/技能编辑/知识库/工具管理', async ({ page }) => {});
});

test.describe('实时对话监控 (4.1)', () => {
  test.skip('AGENT-UI-04: 客户侧发消息后坐席侧实时展示', async ({ browser }) => {});
  test.skip('AGENT-UI-05: 流式文本增量(text_delta)逐步显示', async ({ browser }) => {});
  test.skip('AGENT-UI-06: 消息去重——相同 msg_id 不重复展示', async ({ browser }) => {});
});

test.describe('坐席主动介入 (4.2)', () => {
  test.skip('AGENT-UI-07: 坐席输入消息发送到客户侧', async ({ browser }) => {});
  test.skip('AGENT-UI-08: 坐席消息触发 Agent 响应', async ({ browser }) => {});
});

test.describe('卡片系统 (4.3)', () => {
  test.skip('AGENT-UI-09: 情感分析卡片——收到 emotion_update 后渐变条更新', async ({ page }) => {});
  test.skip('AGENT-UI-10: 合规告警卡片——累积模式追加告警', async ({ page }) => {});
  test.skip('AGENT-UI-11: 转人工摘要卡片——显示意图/问题/动作/风险', async ({ page }) => {});
  test.skip('AGENT-UI-12: 回复提示卡片——显示场景标签和推荐回复', async ({ page }) => {});
  test.skip('AGENT-UI-13: 外呼任务卡片——显示客户和欠款/套餐信息', async ({ page }) => {});
  test.skip('AGENT-UI-14: 用户信息卡片——显示套餐/余额/已订业务', async ({ page }) => {});
  test.skip('AGENT-UI-15: 流程图卡片——Mermaid 渲染 + 节点类型图例', async ({ page }) => {});
});

test.describe('卡片交互 (4.4)', () => {
  test.skip('AGENT-UI-16: 拖拽排序卡片', async ({ page }) => {});
  test.skip('AGENT-UI-17: 折叠/展开卡片', async ({ page }) => {});
  test.skip('AGENT-UI-18: 关闭卡片后底部出现恢复芯片', async ({ page }) => {});
  test.skip('AGENT-UI-19: 隐藏卡片配置——handoff/reply_hint/outbound 初始隐藏，事件到达后展开', async ({ page }) => {});
});

test.describe('跨窗口用户同步 (4.5)', () => {
  test.skip('AGENT-UI-20: 客户侧切换用户后坐席侧自动跟随', async ({ browser }) => {});
});
