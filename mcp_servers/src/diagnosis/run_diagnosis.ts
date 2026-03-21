/**
 * run_diagnosis.ts
 * 诊断编排器：根据 issue_type 调用对应检测脚本并汇总结果
 */
import { checkAccount } from './check_account.ts';
import { checkSignal } from './check_signal.ts';
import { checkData } from './check_data.ts';
import { checkCall } from './check_call.ts';
import type { DiagnosticResult, IssueType, SubscriberContext } from './fd_types.ts';

export function runDiagnosis(sub: SubscriberContext, issueType: IssueType, lang: 'zh' | 'en' = 'zh'): DiagnosticResult {
  const accountStep = checkAccount(sub, lang);

  const steps = (() => {
    switch (issueType) {
      case 'no_signal':
      case 'no_network':
        return [accountStep, ...checkSignal(lang)];
      case 'slow_data':
        return [accountStep, ...checkData(sub, lang)];
      case 'call_drop':
        return [accountStep, ...checkCall(sub, lang)];
    }
  })();

  const hasError = steps.some((s) => s.status === 'error');
  const hasWarning = steps.some((s) => s.status === 'warning');

  const conclusion = lang === 'en'
    ? hasError
      ? 'Critical issue detected — please follow the suggestions or contact a human agent'
      : hasWarning
      ? 'No critical fault found, but potential issues exist — please follow the prompts'
      : 'Diagnosis passed — network is operating normally'
    : hasError
    ? '发现影响使用的严重问题，请按建议处理或联系人工客服'
    : hasWarning
    ? '未发现严重故障，但存在潜在问题，建议按提示操作'
    : '诊断通过，网络状态正常';

  return { issue_type: issueType, diagnostic_steps: steps, conclusion };
}
