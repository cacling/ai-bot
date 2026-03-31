/**
 * VisionTaskCard — 大图处理长任务进度卡
 *
 * 替代 typing dots，展示分阶段进度、耗时、当前步骤。
 * 支持收起/展开和取消操作。
 */
import { memo, useMemo } from 'react';
import { CheckCircle2, Loader2, Circle, ChevronDown, ChevronUp, X, ScanEye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { type VisionTaskState } from '../hooks/useSkillManager';

interface VisionTaskCardProps {
  task: VisionTaskState;
  onCollapse: () => void;
  onCancel: () => void;
}

const STEPS = [
  { key: 'uploading', label: '上传完成' },
  { key: 'trim', label: '裁剪空白区域' },
  { key: 'overview', label: '生成总览' },
  { key: 'slice', label: '分片识别' },
  { key: 'merge', label: '全局合并' },
  { key: 'render', label: '生成结果' },
];

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}:${String(sec).padStart(2, '0')}` : `${sec}s`;
}

export const VisionTaskCard = memo(function VisionTaskCard({ task, onCollapse, onCancel }: VisionTaskCardProps) {
  const elapsed = useMemo(() => {
    return task.elapsedMs > 0 ? task.elapsedMs : Date.now() - task.startedAt;
  }, [task.elapsedMs, task.startedAt]);

  // 收起态
  if (task.collapsed && task.status === 'processing') {
    return (
      <div className="mx-2 mb-2 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-[11px]">
        <Loader2 className="w-3 h-3 animate-spin text-primary" />
        <span className="text-foreground font-medium">流程图解析 {task.percent}%</span>
        <span className="text-muted-foreground">· {task.stageLabel}</span>
        <span className="text-muted-foreground">· {formatDuration(elapsed)}</span>
        {task.etaMs > 0 && <span className="text-muted-foreground">· 约剩 {formatDuration(task.etaMs)}</span>}
        <Button variant="ghost" size="icon-sm" className="ml-auto h-5 w-5" onClick={onCollapse}>
          <ChevronDown className="w-3 h-3" />
        </Button>
      </div>
    );
  }

  // 完成态
  if (task.status === 'completed') {
    return (
      <div className="flex gap-2 mx-1">
        <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
          <CheckCircle2 className="w-3.5 h-3.5" />
        </div>
        <div className="rounded-2xl rounded-tl-none px-3 py-2 text-xs shadow-sm border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/20">
          <div className="font-medium text-green-700 dark:text-green-300">流程图解析完成</div>
          <div className="text-[10px] text-green-600 dark:text-green-400 mt-0.5">
            耗时 {formatDuration(elapsed)}
          </div>
        </div>
      </div>
    );
  }

  // 失败态
  if (task.status === 'failed') {
    return (
      <div className="flex gap-2 mx-1">
        <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 bg-destructive/10 text-destructive">
          <X className="w-3.5 h-3.5" />
        </div>
        <div className="rounded-2xl rounded-tl-none px-3 py-2 text-xs shadow-sm border border-destructive/30 bg-destructive/5">
          <div className="font-medium text-destructive">流程图解析失败</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            在"{task.stageLabel}"阶段失败 · 耗时 {formatDuration(elapsed)}
          </div>
        </div>
      </div>
    );
  }

  // 处理中 — 完整任务卡
  const currentStepIdx = STEPS.findIndex(s => s.key === task.step);

  return (
    <div className="flex gap-2 mx-1">
      <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 bg-primary/10 text-primary">
        <ScanEye className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1 max-w-[85%] rounded-2xl rounded-tl-none border border-primary/20 bg-background shadow-sm overflow-hidden">
        {/* 头部 */}
        <div className="px-3 pt-2.5 pb-1.5 flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
          <span className="text-xs font-medium text-foreground">流程图解析中</span>
          <span className="text-[10px] text-muted-foreground ml-auto">
            已耗时 {formatDuration(elapsed)}{task.etaMs > 0 ? ` · 预计还需 ${formatDuration(task.etaMs)}` : ''}
          </span>
        </div>

        {/* 进度条 */}
        <div className="px-3 pb-2">
          <div className="flex items-center gap-2 mb-1">
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${task.percent}%` }}
              />
            </div>
            <span className="text-[10px] font-mono text-muted-foreground w-8 text-right">{task.percent}%</span>
          </div>
        </div>

        {/* 步骤列表 */}
        <div className="px-3 pb-2 space-y-0.5">
          {STEPS.map((step, i) => {
            const isDone = i < currentStepIdx || (i === currentStepIdx && task.percent >= 95);
            const isCurrent = i === currentStepIdx && !isDone;
            const isPending = i > currentStepIdx;
            let label = step.label;
            if (isCurrent && task.step === 'slice') {
              label = task.stageLabel; // "分片识别 3/6"
            }
            return (
              <div key={step.key}>
                <div className={`flex items-center gap-1.5 text-[10px] ${isPending ? 'text-muted-foreground/50' : isCurrent ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                  {isDone ? (
                    <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                  ) : isCurrent ? (
                    <Loader2 className="w-3 h-3 animate-spin text-primary shrink-0" />
                  ) : (
                    <Circle className="w-3 h-3 shrink-0" />
                  )}
                  {label}
                </div>
                {isCurrent && task.detailLabel && task.detailLabel !== task.stageLabel && (
                  <div className="ml-[18px] text-[10px] text-muted-foreground">{task.detailLabel}</div>
                )}
              </div>
            );
          })}
        </div>

        {/* 提示文案 */}
        <div className="px-3 pb-2 text-[10px] text-muted-foreground leading-relaxed">
          当前正在处理图片，不是卡住。你可以继续编辑右侧技能内容。
        </div>

        {/* 操作按钮 */}
        <div className="px-3 pb-2.5 flex items-center gap-2">
          <Button variant="ghost" size="xs" className="text-[10px] h-6 px-2" onClick={onCollapse}>
            <ChevronUp className="w-3 h-3 mr-1" />收起
          </Button>
          <Button variant="ghost" size="xs" className="text-[10px] h-6 px-2 text-destructive hover:text-destructive" onClick={onCancel}>
            取消
          </Button>
        </div>
      </div>
    </div>
  );
});
