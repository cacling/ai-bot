/**
 * DiagramContent.tsx — flow diagram card content (colSpan: 2)
 *
 * Thin wrapper around MermaidRenderer for the agent workstation card layout.
 */

import { memo } from 'react';
import { GitFork } from 'lucide-react';
import { MermaidRenderer } from '../../../shared/MermaidRenderer';
import { T, type Lang } from '../../../i18n';

interface DiagramData {
  skill_name: string;
  mermaid: string;
}

export const DiagramContent = memo(function DiagramContent({ data, lang }: { data: unknown; lang: Lang }) {
  const t = T[lang];
  const diagram = data as DiagramData | null;

  if (!diagram) {
    return (
      <div className="flex flex-col items-center justify-center py-10 space-y-3 text-center select-none">
        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
          <GitFork size={22} className="text-gray-300" />
        </div>
        <div className="space-y-0.5">
          <p className="text-xs font-medium text-gray-400">{t.diagram_empty_title}</p>
          <p className="text-[11px] text-gray-300 whitespace-pre-line">{t.diagram_empty_subtitle}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3">
      <MermaidRenderer
        mermaid={diagram.mermaid}
        height="60vh"
        emptyText={t.diagram_empty_title}
        loadingText={t.diagram_loading}
        errorText={t.diagram_error}
      />
      <p className="text-[10px] text-gray-400 text-center mt-2">
        {t.diagram_footer_active} <span className="font-mono">{diagram.skill_name}</span>
      </p>
    </div>
  );
});
