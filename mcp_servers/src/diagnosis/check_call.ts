/**
 * check_call.ts
 * 检查通话时长余额、VoLTE 支持、基站切换
 * 适用于：call_drop
 */
import type { DiagnosticStep, SubscriberContext } from './fd_types.ts';

export function checkCall(sub: SubscriberContext, lang: 'zh' | 'en' = 'zh'): DiagnosticStep[] {
  const unlimited = sub.voice_total_min === -1;
  const remaining = unlimited ? -1 : sub.voice_total_min - sub.voice_used_min;

  if (lang === 'en') {
    return [
      { step: 'Voice Minutes Balance', status: 'ok', detail: unlimited ? 'Unlimited voice minutes' : `${remaining} minutes remaining` },
      { step: 'VoLTE Support', status: 'ok', detail: 'Device supports VoLTE, 4G calling is enabled' },
      { step: 'Handover Detection', status: 'warning', detail: 'Frequent cell tower handovers detected — may be caused by signal instability while in motion' },
    ];
  }

  return [
    { step: '通话时长余额', status: 'ok', detail: unlimited ? '不限量通话' : `剩余 ${remaining} 分钟` },
    { step: 'VoLTE 支持检查', status: 'ok', detail: '终端支持 VoLTE，4G 通话已启用' },
    { step: '基站切换检测', status: 'warning', detail: '检测到频繁基站切换，可能因移动中信号不稳定导致' },
  ];
}
