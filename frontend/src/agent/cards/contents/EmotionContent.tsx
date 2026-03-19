/**
 * EmotionContent.tsx — customer emotion analysis card (colSpan: 1)
 *
 * Displays a horizontal spectrum bar from 😊 (left) to 😠 (right)
 * with a smooth-animated indicator dot.
 *
 * data shape: { label: string; emoji: string; color: string } | null
 */

import { memo } from 'react';
import { T, type Lang } from '../../../i18n';

interface EmotionData {
  label: string;
  emoji: string;
  color: string; // 'green' | 'amber' | 'orange' | 'red'
}

// Map color → position % along the bar and label color class
const colorConfig: Record<string, { position: number; textClass: string; shadowColor: string }> = {
  green:  { position: 12, textClass: 'text-primary',            shadowColor: '#22c55e' },
  amber:  { position: 42, textClass: 'text-muted-foreground',   shadowColor: '#f59e0b' },
  orange: { position: 68, textClass: 'text-muted-foreground',   shadowColor: '#f97316' },
  red:    { position: 88, textClass: 'text-destructive',        shadowColor: '#ef4444' },
};

export const EmotionContent = memo(function EmotionContent({ data, lang }: { data: unknown; lang: Lang }) {
  const emotion = data as EmotionData | null;
  const cfg = emotion ? (colorConfig[emotion.color] ?? colorConfig.amber) : null;
  const tc = T[lang];

  return (
    <div className="px-4 py-4 select-none">
      {/* End-point labels */}
      <div className="flex justify-between text-base mb-2">
        <span title="开心">😊</span>
        <span title="愤怒">😠</span>
      </div>

      {/* Gradient track + indicator */}
      <div className="relative h-2 rounded-full bg-gradient-to-r from-green-400 via-yellow-400 via-orange-400 to-red-500">
        {cfg && (
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-background border-2 border-background"
            style={{
              left: `${cfg.position}%`,
              boxShadow: `0 0 0 3px ${cfg.shadowColor}`,
              transition: 'left 0.5s ease',
            }}
          />
        )}
      </div>

      {/* Label */}
      <div className="mt-3 text-center">
        {emotion && cfg ? (
          <span className={`text-xs font-semibold ${cfg.textClass}`}>
            {emotion.emoji} {tc.emotion_labels[emotion.label] ?? emotion.label}
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground">{tc.card_emotion_empty}</span>
        )}
      </div>
    </div>
  );
});
