/**
 * DiagramContent.tsx — flow diagram card content (colSpan: 2)
 *
 * Migrated from DiagramPanel.tsx internals.
 * data shape: { skill_name: string; mermaid: string } | null
 */

import { memo, useEffect, useState } from 'react';
import { GitFork, Loader2, AlertTriangle } from 'lucide-react';
import { renderMermaid } from '../../../utils/mermaid';
import { T, type Lang } from '../../../i18n';

interface DiagramData {
  skill_name: string;
  mermaid: string;
}

export const DiagramContent = memo(function DiagramContent({ data, lang }: { data: unknown; lang: Lang }) {
  const t = T[lang];
  const diagram = data as DiagramData | null;

  const [svg,     setSvg]     = useState('');
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!diagram?.mermaid) { setSvg(''); setError(''); setLoading(false); return; }

    // Debug: log mermaid update and check for highlight syntax
    const hlLines = diagram.mermaid.split('\n').filter((l: string) => l.includes(':::'));
    console.log('[DiagramContent] mermaid update', { skill: diagram.skill_name, len: diagram.mermaid.length, hlLines });

    let cancelled = false;
    setSvg(''); setError(''); setLoading(true);

    renderMermaid(diagram.mermaid)
      .then(result => {
        if (!cancelled) {
          // Debug: check if SVG contains highlight class styles
          const hasHL = result.includes('progressHL') || result.includes('toolHL') || result.includes('branchHL');
          console.log('[DiagramContent] render done', { hasHL, svgLen: result.length });
          setSvg(result);
        }
      })
      .catch(err   => { if (!cancelled) { console.error('[DiagramContent] render error', err); setError(err instanceof Error ? err.message : t.diagram_error); } })
      .finally(()  => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [diagram?.mermaid]);

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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-10 space-y-3 text-gray-400">
        <Loader2 size={24} className="animate-spin text-indigo-400" />
        <p className="text-xs">{t.diagram_loading}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-8 space-y-2 text-center px-4">
        <AlertTriangle size={24} className="text-amber-400" />
        <p className="text-xs text-gray-500">{t.diagram_error}</p>
        <pre className="text-[11px] text-red-400 bg-red-50 px-3 py-2 rounded-lg max-w-full whitespace-pre-wrap">{error}</pre>
      </div>
    );
  }

  return (
    <div className="p-3">
      <div
        className="w-full max-h-[60vh] overflow-auto [&_svg]:max-w-full [&_svg]:h-auto flex items-start justify-center"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <p className="text-[10px] text-gray-400 text-center mt-2">
        {t.diagram_footer_active} <span className="font-mono">{diagram.skill_name}</span>
      </p>
    </div>
  );
});
