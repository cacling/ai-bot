import type { SeedE2ECase } from './types';

export const billInquiryCases: SeedE2ECase[] = [
  { skill_name: 'bill-inquiry', input_message: '帮我查一下这个月账单总额和费用明细。', expected_keywords: JSON.stringify(['账单', '费用']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'bill-inquiry' }, { type: 'tool_called', value: 'query_bill' }]), persona_id: 'U001' },
  { skill_name: 'bill-inquiry', input_message: '这个月话费怎么突然高了这么多？帮我分析一下原因。', expected_keywords: JSON.stringify(['异常', '费用']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'bill-inquiry' }, { type: 'tool_called_any_of', value: 'analyze_bill_anomaly,query_bill' }]), persona_id: 'U001' },
  { skill_name: 'bill-inquiry', input_message: '我欠费停机了，帮我看看还欠多少，为什么会停机？', expected_keywords: JSON.stringify(['欠费', '停机']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'bill-inquiry' }, { type: 'tool_called_any_of', value: 'query_subscriber,query_bill,check_account_balance' }, { type: 'response_has_next_step', value: '' }]), persona_id: 'U003' },
  { skill_name: 'bill-inquiry', input_message: '帮我看一下上个月账单，顺便告诉我哪些费用可以开发票。', expected_keywords: JSON.stringify(['上个月', '发票']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'bill-inquiry' }, { type: 'tool_called', value: 'query_bill' }, { type: 'response_mentions_all', value: '账单,发票' }]), persona_id: 'U001' },
  { skill_name: 'bill-inquiry', input_message: '上个月国际漫游怎么会多扣这么多，帮我看看是不是异常。', expected_keywords: JSON.stringify(['漫游', '异常']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'bill-inquiry' }, { type: 'tool_called_any_of', value: 'query_bill,analyze_bill_anomaly' }, { type: 'response_mentions_any', value: '漫游包,漫游费,国际漫游,漫游' }]), persona_id: 'M003' },
];
