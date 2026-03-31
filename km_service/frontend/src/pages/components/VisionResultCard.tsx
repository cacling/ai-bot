/**
 * VisionResultCard — 大图解析结果展示
 *
 * 纯文本渲染，不在狭窄的对话区域渲染 Mermaid。
 * 用户可通过"复制代码"按钮复制 Mermaid 源码到其他工具渲染。
 */
import { memo, useState, useCallback } from 'react';
import { ScanEye, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineMarkdown } from './SkillEditorWidgets';
import { type VisionResult } from '../hooks/useSkillManager';

interface VisionResultCardProps {
  text: string;
  visionResult?: VisionResult;
}

export const VisionResultCard = memo(function VisionResultCard({ text, visionResult }: VisionResultCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (!visionResult?.mermaid) return;
    navigator.clipboard.writeText(visionResult.mermaid);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [visionResult?.mermaid]);

  return (
    <div className="flex gap-2">
      <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
        <ScanEye className="w-3.5 h-3.5" />
      </div>
      <div className="max-w-[90%] rounded-2xl rounded-tl-none px-3 py-2 text-xs leading-relaxed shadow-sm bg-amber-50 border border-amber-200 text-foreground dark:bg-amber-950/20 dark:border-amber-800">
        <div className="flex items-center justify-between mb-1">
          <div className="text-[10px] font-medium text-amber-600 dark:text-amber-400">流程图解析结果</div>
          {visionResult?.mermaid && (
            <Button
              variant="ghost"
              size="xs"
              className="text-[10px] h-5 px-1.5 text-amber-600 hover:text-amber-700 dark:text-amber-400"
              onClick={handleCopy}
            >
              {copied ? <Check className="w-3 h-3 mr-0.5" /> : <Copy className="w-3 h-3 mr-0.5" />}
              {copied ? '已复制' : '复制 Mermaid'}
            </Button>
          )}
        </div>
        <InlineMarkdown text={text} />
      </div>
    </div>
  );
});
