import type { SeedE2ECase } from './types';

export const serviceCancelCases: SeedE2ECase[] = [
  { skill_name: 'service-cancel', input_message: '帮我把短信百条包退掉，我不需要了。', expected_keywords: JSON.stringify(['退订', '短信包']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'service-cancel' }, { type: 'tool_called_any_of', value: 'cancel_service,query_subscriber' }]), persona_id: 'U001' },
  { skill_name: 'service-cancel', input_message: '这个月多扣了一个视频会员费，你先帮我查清楚是什么，再决定要不要退。', expected_keywords: JSON.stringify(['视频会员', '多扣']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'service-cancel' }, { type: 'tool_called_any_of', value: 'query_bill,query_subscriber' }, { type: 'tool_not_called', value: 'cancel_service' }]), persona_id: 'U001' },
  { skill_name: 'service-cancel', input_message: '这个游戏加速包像是我误订的，帮我先看一下订购时间和能不能退款。', expected_keywords: JSON.stringify(['误订', '退款']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'service-cancel' }, { type: 'tool_called', value: 'query_subscriber' }, { type: 'response_mentions_any', value: '订购,退款,游戏加速' }]), persona_id: 'U003' },
  { skill_name: 'service-cancel', input_message: '国际漫游包我下个月不需要了，帮我按规则退掉。', expected_keywords: JSON.stringify(['漫游包', '下个月']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'service-cancel' }, { type: 'tool_called_any_of', value: 'cancel_service,query_subscriber' }]), persona_id: 'U002' },
  { skill_name: 'service-cancel', input_message: '先告诉我我现在订了哪些增值业务，再决定取消哪个。', expected_keywords: JSON.stringify(['增值业务', '取消']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'service-cancel' }, { type: 'tool_called', value: 'query_subscriber' }]), persona_id: 'U001' },
];
