/**
 * EngagementContent.tsx — Public engagement context card (colSpan: 1)
 *
 * Shows the source engagement item details when an interaction
 * originated from public social media engagement (via public-private bridge).
 *
 * data shape: EngagementData | null
 */
import { memo } from 'react';
import { Badge } from '@/components/ui/badge';
import { type Lang } from '../../../i18n';

interface EngagementData {
  item_id?: string;
  provider?: string;
  item_type?: string;
  author_name?: string;
  author_id?: string;
  body?: string;
  sentiment?: string;
  sentiment_score?: number;
  classification?: string;
  risk_level?: string;
  recommendation?: string;
  asset_id?: string;
  ingested_at?: string;
}

const SENTIMENT_COLORS: Record<string, string> = {
  positive: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  neutral: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
  negative: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

const RISK_COLORS: Record<string, string> = {
  low: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

export const EngagementContent = memo(function EngagementContent({ data, lang }: { data: unknown; lang: Lang }) {
  const d = data as EngagementData | null;

  if (!d) {
    return (
      <div className="flex flex-col items-center justify-center py-6 space-y-1.5 text-center select-none px-3">
        <span className="text-2xl opacity-30">💬</span>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {lang === 'zh' ? '暂无公域互动数据' : 'No engagement data'}
        </p>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-2.5 text-xs">
      {/* Provider + type badges */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {d.provider && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
            {d.provider}
          </Badge>
        )}
        {d.item_type && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
            {d.item_type}
          </Badge>
        )}
        {d.sentiment && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${SENTIMENT_COLORS[d.sentiment] ?? ''}`}>
            {d.sentiment}
          </span>
        )}
        {d.risk_level && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${RISK_COLORS[d.risk_level] ?? ''}`}>
            {lang === 'zh' ? '风险' : 'Risk'}: {d.risk_level}
          </span>
        )}
      </div>

      {/* Author info */}
      {d.author_name && (
        <div>
          <span className="text-muted-foreground mr-1">{lang === 'zh' ? '作者' : 'Author'}:</span>
          <span className="text-foreground">{d.author_name}</span>
          {d.author_id && <span className="text-muted-foreground ml-1 text-[10px]">({d.author_id})</span>}
        </div>
      )}

      {/* Original content */}
      {d.body && (
        <div className="bg-muted rounded-lg px-2.5 py-2 leading-relaxed text-muted-foreground">
          {d.body}
        </div>
      )}

      {/* Classification + recommendation */}
      {(d.classification || d.recommendation) && (
        <div className="flex gap-3">
          {d.classification && (
            <div>
              <span className="text-muted-foreground mr-1">{lang === 'zh' ? '分类' : 'Class'}:</span>
              <span className="text-foreground">{d.classification}</span>
            </div>
          )}
          {d.recommendation && (
            <div>
              <span className="text-muted-foreground mr-1">{lang === 'zh' ? '建议' : 'Action'}:</span>
              <span className="text-foreground">{d.recommendation}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
