/**
 * outbound-marketing SOP E2E 测试
 *
 * 外呼营销技能的流程验证。
 * 状态图分支：合规检查 → 呼叫 → 身份确认 → 意愿探测 → 方案介绍 → 意向判断
 *
 * 工具：record_marketing_result, send_followup_sms, transfer_to_human
 * 依赖：服务已启动（./start.sh 或 ./start.sh --reset）
 */
import { test, expect } from '@playwright/test';

test.describe.serial('outbound-marketing SOP: 标准营销流程', () => {
  test.setTimeout(300_000);
  test.skip('SOP-MKT-01: 合规检查→接通→身份确认→意愿探测→方案介绍→同意办理→记录', async ({ page }) => {});
  test.skip('SOP-MKT-02: 用户犹豫→异议处理（价格/合约）→说服→同意', async ({ page }) => {});
});

test.describe.serial('outbound-marketing SOP: 拒绝与 DND', () => {
  test.setTimeout(300_000);
  test.skip('SOP-MKT-03: 用户拒绝→记录结果→礼貌结束', async ({ page }) => {});
  test.skip('SOP-MKT-04: 用户要求加入免打扰名单→记录DND→结束', async ({ page }) => {});
});

test.describe.serial('outbound-marketing SOP: 特殊分支', () => {
  test.setTimeout(300_000);
  test.skip('SOP-MKT-05: 用户对其他套餐感兴趣→切换推荐方案→介绍新方案', async ({ page }) => {});
  test.skip('SOP-MKT-06: 合规检查不通过（DND 名单/呼叫限制）→任务跳过', async ({ page }) => {});
  test.skip('SOP-MKT-07: 未接/忙线→record_marketing_result(no_answer)→结束', async ({ page }) => {});
});
