// 诊断脚本共享类型定义

export interface DiagnosticStep {
  step: string;
  status: 'ok' | 'warning' | 'error';
  detail: string;
}

export interface SubscriberContext {
  status: 'active' | 'suspended' | 'cancelled';
  data_used_gb: number;
  data_total_gb: number;  // -1 表示不限量
  voice_used_min: number;
  voice_total_min: number; // -1 表示不限量
}

export type IssueType = 'no_signal' | 'slow_data' | 'call_drop' | 'no_network';

export interface DiagnosticResult {
  issue_type: IssueType;
  diagnostic_steps: DiagnosticStep[];
  conclusion: string;
}
