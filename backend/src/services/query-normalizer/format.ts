// backend/src/services/query-normalizer/format.ts
import { type NormalizedQuery, type NormalizedSlots } from './types';

const SLOT_LABELS: Record<string, string> = {
  service_category: '业务类型',
  service_subtype: '业务子类',
  issue_type: '问题类型',
  action_type: '操作类型',
  network_issue_type: '网络问题',
  account_state: '账户状态',
  msisdn: '手机号',
};

export function formatNormalizedContext(nc: NormalizedQuery): string {
  const lines: string[] = [
    '',
    '## 用户输入分析（系统自动生成，仅供参考）',
    '',
    `- 标准化改写：${nc.rewritten_query}`,
  ];

  if (nc.intent_hints.length > 0) {
    lines.push(`- 意图提示：${nc.intent_hints.join('、')}`);
  }

  const slots = nc.normalized_slots;

  if (slots.time) {
    const timeDesc = slots.time.kind === 'billing_period'
      ? `账期=${slots.time.value}`
      : slots.time.value;
    const sourceDesc = slots.time.source === 'explicit' ? '用户明确指定' : '根据相对时间推算';
    lines.push(`- 时间：${timeDesc}（${sourceDesc}）`);
  }

  for (const [key, label] of Object.entries(SLOT_LABELS)) {
    const val = slots[key as keyof NormalizedSlots];
    if (val && typeof val === 'string') {
      lines.push(`- ${label}：${val}`);
    }
  }

  if (nc.ambiguities.length > 0) {
    lines.push('- 歧义提醒（请在对话中向用户确认）：');
    for (const a of nc.ambiguities) {
      lines.push(`  - "${a.original_text}" 可能含义：${a.candidates.join(' / ')}`);
    }
  }

  lines.push(`- 分析置信度：${(nc.confidence * 100).toFixed(0)}%（来源：${nc.source}）`);
  lines.push('');

  return lines.join('\n');
}
