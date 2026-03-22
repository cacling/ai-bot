import type { SeedE2ECase } from './types';

export const faultDiagnosisCases: SeedE2ECase[] = [
  { skill_name: 'fault-diagnosis', input_message: '我这边最近上网特别慢，帮我排查一下是不是网络有问题。', expected_keywords: JSON.stringify(['网络', '排查']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'fault-diagnosis' }, { type: 'tool_called', value: 'diagnose_network' }, { type: 'response_has_next_step', value: '' }]), persona_id: 'U001' },
  { skill_name: 'fault-diagnosis', input_message: '今天突然没信号，也打不了电话，能帮我看看吗？', expected_keywords: JSON.stringify(['没信号', '电话']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'fault-diagnosis' }, { type: 'tool_called', value: 'diagnose_network' }, { type: 'response_has_next_step', value: '' }]), persona_id: 'U003' },
  { skill_name: 'fault-diagnosis', input_message: '我突然上不了网了，像是区域故障，帮我查一下。', expected_keywords: JSON.stringify(['上不了网', '故障']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'fault-diagnosis' }, { type: 'tool_called', value: 'diagnose_network' }, { type: 'response_has_next_step', value: '' }]), persona_id: 'U002' },
  { skill_name: 'fault-diagnosis', input_message: '这两天打电话老是突然断线，你帮我查一下是手机问题还是网络问题。', expected_keywords: JSON.stringify(['断线', '网络']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'fault-diagnosis' }, { type: 'tool_called', value: 'diagnose_network' }, { type: 'response_has_next_step', value: '' }]), persona_id: 'M002' },
  { skill_name: 'fault-diagnosis', input_message: '我在境外漫游时一直上不了网，帮我看看是不是网络侧的问题。', expected_keywords: JSON.stringify(['漫游', '上不了网']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'fault-diagnosis' }, { type: 'tool_called', value: 'diagnose_network' }, { type: 'response_mentions_any', value: '漫游包,漫游,覆盖,网络' }]), persona_id: 'M003' },
];
