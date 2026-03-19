/**
 * ComplianceContent.tsx — 合规监控卡片 (colSpan: 1)
 *
 * 显示实时拦截/告警记录列表
 *
 * data shape: ComplianceAlert[] (累积数组)
 */

import { memo } from 'react';
import { T, type Lang } from '../../../i18n';

interface ComplianceAlert {
  source: string;      // 'bot' | 'bot_voice' | 'agent' | 'model_filter'
  keywords: string[];
  text: string;        // 原文前 100 字
  ts?: number;
}

const sourceLabel: Record<string, Record<string, string>> = {
  zh: { bot: '机器人(文字)', bot_voice: '机器人(语音)', agent: '坐席', model_filter: '模型安全过滤' },
  en: { bot: 'Bot (Text)', bot_voice: 'Bot (Voice)', agent: 'Agent', model_filter: 'Model Safety Filter' },
};

export const ComplianceContent = memo(function ComplianceContent({ data, lang }: { data: unknown; lang: Lang }) {
  const alerts = data as ComplianceAlert[] | null;

  if (!alerts || alerts.length === 0) {
    return (
      <div className="px-4 py-6 text-center">
        <span className="text-[11px] text-muted-foreground">
          {lang === 'zh' ? '暂无合规告警' : 'No compliance alerts'}
        </span>
      </div>
    );
  }

  return (
    <div className="px-3 py-2 space-y-2 max-h-48 overflow-y-auto">
      {alerts.slice(-10).reverse().map((alert, i) => (
        <div key={i} className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-xs">
          {/* 第一行：来源 + 关键词标签 + 时间 */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-destructive flex-shrink-0" />
            <span className="font-medium text-destructive flex-shrink-0">
              {sourceLabel[lang]?.[alert.source] ?? alert.source}
            </span>
            {alert.keywords.map((kw, j) => (
              <span key={j} className="px-1.5 py-0.5 rounded bg-destructive/10 text-destructive font-mono text-[10px]">
                {kw}
              </span>
            ))}
            {alert.ts && (
              <span className="text-muted-foreground ml-auto flex-shrink-0 text-[10px]">
                {new Date(alert.ts).toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
          </div>
          {/* 第二行：原文 */}
          <div className="text-muted-foreground mt-1 break-all">{alert.text}</div>
        </div>
      ))}
    </div>
  );
});
