/**
 * check_data.ts
 * 检查流量余额、网络拥塞、后台应用
 * 适用于：slow_data
 */
import type { DiagnosticStep, SubscriberContext } from './fd_types.ts';

export function checkData(sub: SubscriberContext, lang: 'zh' | 'en' = 'zh'): DiagnosticStep[] {
  const unlimited = sub.data_total_gb === -1;
  const dataRatio = unlimited ? 0 : sub.data_used_gb / sub.data_total_gb;
  const dataStatus = dataRatio >= 1 ? 'error' : dataRatio >= 0.9 ? 'warning' : 'ok';

  if (lang === 'en') {
    const dataDetail = unlimited
      ? 'Unlimited data plan — no data cap'
      : `Used ${sub.data_used_gb}GB of ${sub.data_total_gb}GB (${Math.round(dataRatio * 100)}%)`;
    return [
      { step: 'Data Balance', status: dataStatus, detail: dataDetail },
      { step: 'Network Congestion', status: 'warning', detail: 'High network load during peak hours — expected to normalize after 22:00' },
      { step: 'Background Apps', status: 'ok', detail: 'No abnormal background data usage detected' },
    ];
  }

  const dataDetail = unlimited
    ? '无限流量套餐，不限量使用'
    : `已用 ${sub.data_used_gb}GB / 共 ${sub.data_total_gb}GB（${Math.round(dataRatio * 100)}%）`;
  return [
    { step: '流量余额检查', status: dataStatus, detail: dataDetail },
    { step: '网络拥塞检测', status: 'warning', detail: '当前时段（晚高峰）网络负载较高，预计 22:00 后恢复正常' },
    { step: '后台应用检测', status: 'ok', detail: '未检测到异常后台流量消耗' },
  ];
}
