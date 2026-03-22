import type { SeedE2ECase } from './types';

export const telecomAppCases: SeedE2ECase[] = [
  { skill_name: 'telecom-app', input_message: '我今天一直登录不上 APP，而且验证码来得特别慢。', expected_keywords: JSON.stringify(['登录', '验证码']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'telecom-app' }, { type: 'tool_called', value: 'diagnose_app' }]), persona_id: 'U003' },
  { skill_name: 'telecom-app', input_message: 'APP 提示我的账号被锁了，怎么处理？', expected_keywords: JSON.stringify(['账号', '锁定']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'telecom-app' }, { type: 'tool_called', value: 'diagnose_app' }]), persona_id: 'U003' },
  { skill_name: 'telecom-app', input_message: '系统提示我的登录环境异常，麻烦帮我看看是什么问题。', expected_keywords: JSON.stringify(['环境异常', '登录']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'telecom-app' }, { type: 'tool_called', value: 'diagnose_app' }]), persona_id: 'M003' },
  { skill_name: 'telecom-app', input_message: '我是不是因为欠费停机了，所以 APP 一直登不上？', expected_keywords: JSON.stringify(['欠费', '停机']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'telecom-app' }, { type: 'tool_called', value: 'query_subscriber' }]), persona_id: 'U003' },
  { skill_name: 'telecom-app', input_message: 'APP 版本是不是太旧了？我打开后老是报错闪退。', expected_keywords: JSON.stringify(['版本', '报错']), assertions: JSON.stringify([{ type: 'skill_loaded', value: 'telecom-app' }, { type: 'tool_called', value: 'diagnose_app' }]), persona_id: 'U001' },
];
