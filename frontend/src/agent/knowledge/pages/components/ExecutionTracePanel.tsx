/**
 * ExecutionTracePanel — Skill 运行时执行链路展示（严格 MCP 对齐）
 *
 * 展示：命中 Skill → 加载 references → tools/call(arguments) → 结果 → 最终输出
 * 当前为只读展示，数据来自测试运行的 step 记录。
 */
import { CheckCircle2, XCircle, Clock, ArrowRight, FileText, Wrench, MessageSquare } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface TraceStep {
  type: 'skill_matched' | 'reference_loaded' | 'tool_call' | 'tool_result' | 'final_output';
  label: string;
  detail?: string;
  status?: 'success' | 'error' | 'pending';
  elapsed_ms?: number;
}

interface Props {
  steps: TraceStep[];
  skillName?: string;
}

const STEP_ICON = {
  skill_matched: <MessageSquare size={12} className="text-primary" />,
  reference_loaded: <FileText size={12} className="text-blue-500" />,
  tool_call: <Wrench size={12} className="text-amber-500" />,
  tool_result: <CheckCircle2 size={12} className="text-emerald-500" />,
  final_output: <MessageSquare size={12} className="text-primary" />,
};

const STATUS_ICON = {
  success: <CheckCircle2 size={10} className="text-emerald-500" />,
  error: <XCircle size={10} className="text-destructive" />,
  pending: <Clock size={10} className="text-muted-foreground" />,
};

export function ExecutionTracePanel({ steps, skillName }: Props) {
  if (steps.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <ArrowRight size={14} className="text-muted-foreground" />
          <h4 className="text-xs font-semibold">Execution Trace</h4>
        </div>
        <div className="text-[11px] text-muted-foreground text-center py-4 border rounded-lg border-dashed">
          运行测试后将展示完整执行链路。
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ArrowRight size={14} className="text-muted-foreground" />
        <h4 className="text-xs font-semibold">Execution Trace</h4>
        {skillName && <Badge variant="outline" className="text-[9px]">{skillName}</Badge>}
        <Badge variant="outline" className="text-[9px]">{steps.length} steps</Badge>
      </div>

      <div className="relative pl-6">
        {/* 竖线 */}
        <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />

        <div className="space-y-2">
          {steps.map((step, i) => (
            <div key={i} className="relative flex items-start gap-3">
              {/* 圆点 */}
              <div className="absolute left-[-14px] top-1.5 w-3 h-3 rounded-full bg-background border-2 border-border flex items-center justify-center">
                {step.status && STATUS_ICON[step.status]}
              </div>

              <div className="flex-1 rounded-lg border bg-background px-3 py-2">
                <div className="flex items-center gap-2">
                  {STEP_ICON[step.type]}
                  <span className="text-xs font-medium">{step.label}</span>
                  {step.elapsed_ms != null && (
                    <span className="text-[10px] text-muted-foreground ml-auto">{step.elapsed_ms}ms</span>
                  )}
                </div>
                {step.detail && (
                  <pre className="text-[10px] text-muted-foreground mt-1 font-mono whitespace-pre-wrap max-h-24 overflow-auto">
                    {step.detail}
                  </pre>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
