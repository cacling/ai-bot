import { memo } from 'react';
import { AlertCircle, ChevronDown, ChevronRight, GitBranch, Maximize2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MermaidRenderer } from '../../../../shared/MermaidRenderer';
import { type DiagramContext } from '../hooks/useDiagramContext';
import {
  type DiagramPreviewResponse,
  type ValidationSeverity,
} from '../hooks/useWorkbenchPreview';

function severityTone(severity: ValidationSeverity): string {
  if (severity === 'error') return 'text-destructive';
  if (severity === 'warning') return 'text-amber-600';
  return 'text-muted-foreground';
}

interface SkillDiagramPanelProps {
  diagram: DiagramContext;
  showDiagnostics?: boolean;
  diagnostics?: DiagramPreviewResponse | null;
  diagnosticsError?: string | null;
  onExpandFullscreen?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const SkillDiagramPanel = memo(function SkillDiagramPanel({
  diagram,
  showDiagnostics = false,
  diagnostics,
  diagnosticsError,
  onExpandFullscreen,
  collapsed = false,
  onToggleCollapse,
}: SkillDiagramPanelProps) {
  const summary = diagnostics?.validation ?? { valid: false, errors: [], warnings: [], infos: [] };
  const structure = diagnostics?.structure;

  return (
    <div className="h-full flex flex-col overflow-hidden border-l border-border">
      {/* ── Title bar ── */}
      <div className="h-9 px-3 border-b border-border flex items-center justify-between gap-2 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleCollapse}
          className="h-7 px-1 gap-1 text-xs font-medium"
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          <GitBranch size={12} />
          流程图{diagram.sourceLabel ? ` — ${diagram.sourceLabel}` : ''}
          {diagram.isTestMode && diagram.progressState && (
            <Badge variant="outline" className="ml-1 text-[9px] px-1 py-0">测试中</Badge>
          )}
        </Button>
        <div className="flex items-center gap-1">
          {onExpandFullscreen && diagram.mermaid && (
            <Button variant="ghost" size="icon-xs" onClick={onExpandFullscreen} title="全屏查看">
              <Maximize2 size={13} />
            </Button>
          )}
        </div>
      </div>

      {/* ── Diagram area ── */}
      {!collapsed && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className={`${showDiagnostics && diagnostics ? 'h-[60%]' : 'flex-1'} overflow-auto px-3 pb-2`}>
            {diagram.mermaid ? (
              <MermaidRenderer
                mermaid={diagram.mermaid}
                nodeTypeMap={diagram.nodeTypeMap}
                progressState={diagram.progressState}
                height="100%"
                zoom={true}
                autoFocus={!!diagram.progressState}
                emptyText="暂无流程图"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                {diagram.isTestMode ? '发送测试消息后展示流程图' : '暂无流程图'}
              </div>
            )}
          </div>

          {/* ── Diagnostics (workbench mode only) ── */}
          {showDiagnostics && diagnostics && (
            <div className="border-t border-border flex flex-col overflow-hidden" style={{ height: '40%' }}>
              <div className="h-9 px-3 border-b border-border flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">结构与诊断</span>
                  <Badge variant={summary.errors.length > 0 ? 'destructive' : 'outline'} className="text-[10px]">
                    错误 {summary.errors.length}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
                    警告 {summary.warnings.length}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    提示 {summary.infos.length}
                  </Badge>
                </div>
                {structure && (
                  <div className="text-[11px] text-muted-foreground">
                    节点 {structure.states.length} · 连线 {structure.transitions.length}
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-auto p-3 space-y-3 text-xs">
                {diagnosticsError && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{diagnosticsError}</span>
                  </div>
                )}

                {diagnostics.compile.errors.length ? (
                  <div className="space-y-1">
                    <div className="font-medium text-destructive">工作流编译错误</div>
                    {diagnostics.compile.errors.map((msg, idx) => (
                      <div key={`compile-error-${idx}`} className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive">
                        {msg}
                      </div>
                    ))}
                  </div>
                ) : null}

                {diagnostics.compile.warnings.length ? (
                  <div className="space-y-1">
                    <div className="font-medium text-amber-600">工作流编译警告</div>
                    {diagnostics.compile.warnings.map((msg, idx) => (
                      <div key={`compile-warning-${idx}`} className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-700">
                        {msg}
                      </div>
                    ))}
                  </div>
                ) : null}

                {(['errors', 'warnings', 'infos'] as const).map((group) =>
                  summary[group].length ? (
                    <div key={group} className="space-y-1">
                      <div className={`font-medium ${group === 'errors' ? 'text-destructive' : group === 'warnings' ? 'text-amber-600' : 'text-muted-foreground'}`}>
                        {group === 'errors' ? '规则错误' : group === 'warnings' ? '规则警告' : '规则提示'}
                      </div>
                      {summary[group].map((check, idx) => (
                        <div key={`${group}-${idx}`} className="rounded-md border px-3 py-2 bg-background">
                          <div className={`font-medium ${severityTone(check.severity)}`}>{check.message}</div>
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            {check.rule}
                            {check.location ? ` · ${check.location}` : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null
                )}

                {structure && (
                  <div className="rounded-md border bg-muted/20 px-3 py-2 space-y-2">
                    <div className="font-medium">结构摘要</div>
                    <div className="text-muted-foreground">
                      起点 {structure.hasStart ? '已定义' : '缺失'} · 终点 {structure.hasEnd ? '已定义' : '缺失'} · 注释 {structure.annotations.length}
                    </div>
                    <div className="text-muted-foreground">
                      分支节点 {structure.states.filter((state) => state.isChoice).length} · 嵌套节点 {structure.states.filter((state) => state.isNested).length}
                    </div>
                  </div>
                )}

                {!diagnosticsError && diagnostics.compile.errors.length === 0 && summary.errors.length === 0 && summary.warnings.length === 0 && summary.infos.length === 0 && (
                  <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-emerald-700">
                    当前状态图未发现编译或规则问题，可以继续完善分支和注释。
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
