import type { PluginManifest } from '../types';

export const manifest: PluginManifest = {
  plugin_id: 'plugin-intent-selector',
  name: 'intent_queue_selector',
  display_name_zh: '意图分流插件',
  display_name_en: 'Intent Queue Selector',
  description: 'Routes entry-queue interactions to business queues based on intent_code and keyword matching',
  plugin_type: 'queue_selector',
  handler_module: 'intent_queue_selector',
  config_schema_json: JSON.stringify({
    type: 'object',
    required: ['entry_queue_codes', 'intent_to_queue_map', 'fallback_queue'],
    properties: {
      entry_queue_codes: { type: 'array', items: { type: 'string' }, description: '允许触发细分流的入口队列' },
      intent_to_queue_map: { type: 'object', additionalProperties: { type: 'string' }, description: 'intent_code → queue_code 映射' },
      keyword_rules: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            keywords: { type: 'array', items: { type: 'string' } },
            queue_code: { type: 'string' },
          },
        },
        description: '关键词命中规则',
      },
      work_model_allowlist: { type: 'array', items: { type: 'string' }, description: '限定只处理的 work_model' },
      fallback_queue: { type: 'string', description: '无命中时回落队列' },
      confidence_threshold: { type: 'number', default: 0.6, description: '置信度阈值' },
      enable_handoff_parse: { type: 'boolean', default: true, description: '是否解析 handoff_summary 提取关键词' },
    },
  }),
  default_config_json: JSON.stringify({
    entry_queue_codes: ['default_chat'],
    intent_to_queue_map: {
      'bill-inquiry': 'bill_chat',
      'plan-inquiry': 'plan_chat',
      'fault-diagnosis': 'fault_chat',
      'service-cancel': 'cancel_chat',
      'telecom-app': 'app_chat',
    },
    keyword_rules: [
      { keywords: ['账单', '费用', '扣费', '余额'], queue_code: 'bill_chat' },
      { keywords: ['套餐', '流量', '升级', '降档'], queue_code: 'plan_chat' },
      { keywords: ['故障', '断网', '无信号', '报修'], queue_code: 'fault_chat' },
      { keywords: ['退订', '取消', '注销', '销户'], queue_code: 'cancel_chat' },
    ],
    fallback_queue: 'default_chat',
    confidence_threshold: 0.6,
    enable_handoff_parse: true,
  }),
  timeout_ms: 2000,
  fallback_behavior: 'use_core',
  version: '1.0.0',
};
