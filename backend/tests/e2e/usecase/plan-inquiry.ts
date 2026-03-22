import type { SeedE2ECase } from './types';

export const planInquiryCases: SeedE2ECase[] = [
  { skill_name: 'plan-inquiry', input_message: '帮我看看我现在适合什么套餐，顺便对比一下热门套餐。', expected_keywords: JSON.stringify(['套餐', '对比']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'plan-inquiry' }, { type: 'tool_called_any_of', value: 'query_plans,query_subscriber' }]), persona_id: 'U002' },
  { skill_name: 'plan-inquiry', input_message: '我每个月流量都不够用，按我现在的用量有没有更大的套餐推荐？', expected_keywords: JSON.stringify(['流量', '推荐']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'plan-inquiry' }, { type: 'tool_called_any_of', value: 'query_subscriber,query_plans' }, { type: 'response_has_next_step', value: '' }]), persona_id: 'M001' },
  { skill_name: 'plan-inquiry', input_message: '家庭融合套餐和我现在的个人套餐有什么区别？', expected_keywords: JSON.stringify(['家庭融合', '区别']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'plan-inquiry' }, { type: 'tool_called', value: 'query_plans' }]), persona_id: 'M002' },
  { skill_name: 'plan-inquiry', input_message: '先帮我看一下我现在套餐和流量用了多少，再推荐要不要升级。', expected_keywords: JSON.stringify(['流量', '升级']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'plan-inquiry' }, { type: 'tool_called', value: 'query_subscriber' }, { type: 'response_has_next_step', value: '' }]), persona_id: 'U001' },
  { skill_name: 'plan-inquiry', input_message: '我最近准备出国，有没有适合商务客户的漫游包或更合适的套餐？', expected_keywords: JSON.stringify(['出国', '漫游']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'plan-inquiry' }, { type: 'tool_called_any_of', value: 'query_plans,query_subscriber' }, { type: 'response_mentions_any', value: '漫游,出国,国际' }]), persona_id: 'M003' },
];
