/**
 * outbound-collection SOP E2E 测试
 *
 * 外呼催收技能的流程验证。
 * 状态图分支：合规检查 → 呼叫 → 身份确认 → 告知欠款 → 意向判断 → 记录
 *
 * 工具：record_call_result, send_followup_sms, create_callback_task, verify_identity
 * 依赖：服务已启动（./start.sh 或 ./start.sh --reset）
 */
import { test, expect } from '@playwright/test';

test.describe.serial('outbound-collection SOP: 标准催收流程', () => {
  test.setTimeout(300_000);
  test.skip('SOP-COL-01: 合规检查→接通→身份确认→告知欠款→承诺还款→PTP验证→发短信', async ({ page }) => {});
  test.skip('SOP-COL-02: 用户承诺但日期不合理→追问→修正PTP→确认', async ({ page }) => {});
});

test.describe.serial('outbound-collection SOP: 拒绝分支', () => {
  test.setTimeout(300_000);
  test.skip('SOP-COL-03: 用户拒绝还款→温和二次沟通→仍拒绝→记录结果', async ({ page }) => {});
  test.skip('SOP-COL-04: 用户有异议（金额/账单争议）→引导核实→升级处理', async ({ page }) => {});
});

test.describe.serial('outbound-collection SOP: 特殊情况', () => {
  test.setTimeout(300_000);
  test.skip('SOP-COL-05: 模糊承诺→追问具体日期→转为PTP或创建回访', async ({ page }) => {});
  test.skip('SOP-COL-06: 脆弱客户识别→停止施压→转人工', async ({ page }) => {});
  test.skip('SOP-COL-07: 未接/忙线/关机→record_call_result(no_answer)→结束', async ({ page }) => {});
});

test.describe.serial('outbound-collection SOP: 合规阻止', () => {
  test.setTimeout(300_000);
  test.skip('SOP-COL-08: 非法时段呼叫→合规拦截→任务延后', async ({ page }) => {});
  test.skip('SOP-COL-09: 超最大重试次数→合规拦截→标记放弃', async ({ page }) => {});
});
