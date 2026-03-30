/**
 * policy-engine-service.ts — 入口决策引擎
 *
 * 根据 source_kind、置信度、风险等确定工单创建模式
 */
import type { SourceKind, DecisionMode } from "../types.js";

/**
 * 根据 intake 信息推断决策模式
 */
export function resolveDecisionMode(intake: {
  source_kind: SourceKind;
  risk_score?: number | null;
  sentiment_score?: number | null;
  confidence_score?: number | null;
}): DecisionMode {
  switch (intake.source_kind) {
    case 'handoff_overflow':
      // 转人工无人接 → 直接自动建单
      return 'auto_create';

    case 'emotion_escalation':
      // 情绪升级：高风险自动建，否则需置信度
      if ((intake.risk_score ?? 0) >= 70) return 'auto_create';
      return 'auto_create_if_confident';

    case 'agent_after_service':
      // 坐席服务后 → 人工确认
      return 'manual_confirm';

    case 'self_service_form':
      // 自助表单：置信度足够则自动建单
      return 'auto_create_if_confident';

    case 'external_monitoring':
      // 外部监控：高严重度自动建单+预约，其他自动建单
      if ((intake.risk_score ?? 0) >= 80) return 'auto_create_and_schedule';
      return 'auto_create';

    default:
      return 'manual_confirm';
  }
}

/**
 * 判断是否应自动创建（跳过 draft 确认）
 */
export function shouldAutoCreate(mode: DecisionMode, confidenceScore?: number | null): boolean {
  switch (mode) {
    case 'auto_create':
    case 'auto_create_and_schedule':
      return true;
    case 'auto_create_if_confident':
      return (confidenceScore ?? 0) >= 80;
    case 'manual_confirm':
    default:
      return false;
  }
}
