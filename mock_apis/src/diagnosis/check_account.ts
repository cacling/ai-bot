/**
 * check_account.ts
 * 检查账号状态是否正常（所有故障类型的第一步）
 */
import type { DiagnosticStep, SubscriberContext } from './fd_types.ts';

export function checkAccount(sub: SubscriberContext, lang: 'zh' | 'en' = 'zh'): DiagnosticStep {
  const active = sub.status === 'active';
  if (lang === 'en') {
    return {
      step: 'Account Status',
      status: active ? 'ok' : 'error',
      detail: active ? 'Account is active' : 'Account suspended — please top up to restore service',
    };
  }
  return {
    step: '账号状态检查',
    status: active ? 'ok' : 'error',
    detail: active ? '账号正常' : '账号已停机，请充值后重试',
  };
}
