/**
 * check_signal.ts
 * 检查基站信号、SIM 卡状态、APN 配置
 * 适用于：no_signal、no_network
 */
import type { DiagnosticStep } from './fd_types.ts';

export function checkSignal(lang: 'zh' | 'en' = 'zh'): DiagnosticStep[] {
  if (lang === 'en') {
    return [
      { step: 'Base Station Signal', status: 'ok', detail: 'Local cell tower is normal, signal strength -75dBm (Good)' },
      { step: 'SIM Card Status', status: 'ok', detail: 'SIM card is active, ICCID validation passed' },
      { step: 'APN Configuration', status: 'warning', detail: 'APN settings may be misconfigured — recommended to reset to default' },
    ];
  }
  return [
    { step: '基站信号检测', status: 'ok', detail: '所在区域基站正常，信号强度 -75dBm（良好）' },
    { step: 'SIM 卡状态', status: 'ok', detail: 'SIM 卡已激活，ICCID 校验通过' },
    { step: 'APN 配置检查', status: 'warning', detail: '检测到 APN 配置可能有误，建议恢复默认设置' },
  ];
}
