/**
 * VisionResultCard — 大图解析结果三段式展示
 *
 * 摘要（始终展示）+ 流程解释（可折叠）+ Mermaid 渲染 + 复制按钮
 * 当 visionResult 不存在时 fallback 到纯文本渲染。
 */
import { memo, useState, useCallback } from 'react';
import { ScanEye, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MermaidRenderer } from '@/shared/MermaidRenderer';
import { InlineMarkdown } from './SkillEditorWidgets';
import { type VisionResult } from '../hooks/useSkillManager';

interface VisionResultCardProps {
  text: string;
  visionResult?: VisionResult;
}

export const VisionResultCard = memo(function VisionResultCard({ text, visionResult }: VisionResultCardProps) {
  const [descExpanded, setDescExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (!visionResult?.mermaid) return;
    navigator.clipboard.writeText(visionResult.mermaid);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [visionResult?.mermaid]);

  // Fallback: 无结构化数据时用纯文本
  if (!visionResult) {
    return (
      <div className="flex gap-2">
        <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
          <ScanEye className="w-3.5 h-3.5" />
        </div>
        <div className="max-w-[90%] rounded-2xl rounded-tl-none px-3 py-2 text-xs leading-relaxed shadow-sm bg-amber-50 border border-amber-200 text-foreground dark:bg-amber-950/20 dark:border-amber-800">
          <div className="text-[10px] font-medium text-amber-600 dark:text-amber-400 mb-1">流程图解析结果</div>
          <InlineMarkdown text={text} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
        <ScanEye className="w-3.5 h-3.5" />
      </div>
      <div className="max-w-[90%] rounded-2xl rounded-tl-none shadow-sm bg-amber-50 border border-amber-200 text-foreground dark:bg-amber-950/20 dark:border-amber-800 overflow-hidden">
        {/* 标题 */}
        <div className="px-3 pt-2 pb-1">
          <div className="text-[10px] font-medium text-amber-600 dark:text-amber-400">流程图解析结果</div>
        </div>

        {/* 摘要 */}
        <div className="px-3 pb-2">
          <div className="text-xs leading-relaxed">{visionResult.summary}</div>
        </div>

        {/* 流程解释（可折叠） */}
        {visionResult.description && (
          <div className="border-t border-amber-200/60 dark:border-amber-800/60">
            <button
              type="button"
              onClick={() => setDescExpanded(!descExpanded)}
              className="w-full px-3 py-1.5 flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-100/50 dark:hover:bg-amber-900/20 transition-colors"
            >
              {descExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              流程解释
            </button>
            {descExpanded && (
              <div className="px-3 pb-2 text-xs leading-relaxed">
                <InlineMarkdown text={visionResult.description} />
              </div>
            )}
          </div>
        )}

        {/* Mermaid 渲染 */}
        {visionResult.mermaid && (
          <div className="border-t border-amber-200/60 dark:border-amber-800/60">
            <div className="px-3 py-1.5 flex items-center justify-between">
              <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">Mermaid 流程图</span>
              <Button
                variant="ghost"
                size="xs"
                className="text-[10px] h-5 px-1.5 text-amber-600 hover:text-amber-700 dark:text-amber-400"
                onClick={handleCopy}
              >
                {copied ? <Check className="w-3 h-3 mr-0.5" /> : <Copy className="w-3 h-3 mr-0.5" />}
                {copied ? '已复制' : '复制代码'}
              </Button>
            </div>
            <div className="px-2 pb-2">
              <div className="rounded-lg border border-amber-200/60 dark:border-amber-800/60 bg-white dark:bg-background overflow-hidden" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                <MermaidRenderer mermaid={visionResult.mermaid} height="250px" zoom={false} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
