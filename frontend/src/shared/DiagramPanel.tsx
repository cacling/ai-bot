/**
 * DiagramPanel.tsx — Right-side floating diagram panel for chat page
 *
 * Thin wrapper around MermaidRenderer with a styled panel frame.
 */

import { GitBranch, GitFork } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MermaidRenderer } from './MermaidRenderer';
import { T, type Lang } from '../i18n';

export interface ActiveDiagram {
  skill_name: string;
  mermaid: string;
  nodeTypeMap?: Record<string, string>;
  progressState?: string;
}

interface Props {
  diagram: ActiveDiagram | null;
  onClose: () => void;
  lang?: Lang;
}

export function DiagramPanel({ diagram, onClose, lang = 'zh' }: Props) {
  const t = T[lang];

  const title = diagram
    ? (t.diagram_skill_labels[diagram.skill_name] ?? diagram.skill_name)
    : t.diagram_title_default;

  return (
    <div className="flex flex-col w-[520px] flex-shrink-0 bg-background rounded-3xl shadow-xl border border-border overflow-hidden h-[800px] max-h-[90vh]">
      {/* Header */}
      <div className={`px-4 py-3 flex items-center justify-between flex-shrink-0 ${
        diagram
          ? 'bg-gradient-to-r from-indigo-600 to-indigo-500'
          : 'bg-gradient-to-r from-muted-foreground to-muted-foreground/70'
      }`}>
        <div className="flex items-center space-x-2 text-white">
          <GitBranch size={16} />
          <span className="text-sm font-semibold">{title}</span>
        </div>
        {diagram && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-white/60 hover:text-white/90 hover:bg-white/10"
            title={t.diagram_clear}
          >
            {t.diagram_clear}
          </Button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden p-4 bg-muted">
        {!diagram ? (
          <div className="flex flex-col items-center justify-center h-full space-y-4 text-center select-none">
            <div className="w-16 h-16 rounded-full bg-accent flex items-center justify-center">
              <GitFork size={28} className="text-muted-foreground/50" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">{t.diagram_empty_title}</p>
              <p className="text-xs text-muted-foreground/60 whitespace-pre-line">{t.diagram_empty_subtitle}</p>
            </div>
          </div>
        ) : (
          <MermaidRenderer
            mermaid={diagram.mermaid}
            nodeTypeMap={diagram.nodeTypeMap}
            progressState={diagram.progressState}
            height="100%"
            emptyText={t.diagram_empty_title}
            loadingText={t.diagram_loading}
            errorText={t.diagram_error}
          />
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border px-4 py-2 flex-shrink-0 bg-background">
        <p className="text-[11px] text-muted-foreground text-center">
          {diagram
            ? <>{t.diagram_footer_active} <span className="font-mono">{diagram.skill_name}</span></>
            : t.diagram_footer_waiting}
        </p>
      </div>
    </div>
  );
}
