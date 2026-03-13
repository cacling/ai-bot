import { useEffect, useState } from 'react';
import { GitBranch, Loader2, AlertTriangle, GitFork } from 'lucide-react';
import { renderMermaid } from '../utils/mermaid';
import { T, type Lang } from '../i18n';

export interface ActiveDiagram {
  skill_name: string;
  mermaid: string;
}

interface Props {
  diagram: ActiveDiagram | null;
  onClose: () => void;
  lang?: Lang;
}

export function DiagramPanel({ diagram, onClose, lang = 'zh' }: Props) {
  const t = T[lang];
  const [svg, setSvg]         = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!diagram) {
      setSvg('');
      setError('');
      setLoading(false);
      return;
    }

    let cancelled = false;
    setSvg('');
    setError('');
    setLoading(true);

    renderMermaid(diagram.mermaid)
      .then((result) => { if (!cancelled) setSvg(result); })
      .catch((err)   => { if (!cancelled) setError(err instanceof Error ? err.message : t.diagram_error); })
      .finally(()    => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [diagram?.mermaid]);

  const title = diagram
    ? (t.diagram_skill_labels[diagram.skill_name] ?? diagram.skill_name)
    : t.diagram_title_default;

  return (
    <div className="flex flex-col w-[520px] flex-shrink-0 bg-white rounded-3xl shadow-xl border border-gray-200 overflow-hidden h-[800px] max-h-[90vh]">

      {/* Header */}
      <div className={`px-4 py-3 flex items-center justify-between flex-shrink-0 ${
        diagram
          ? 'bg-gradient-to-r from-indigo-600 to-indigo-500'
          : 'bg-gradient-to-r from-gray-400 to-gray-300'
      }`}>
        <div className="flex items-center space-x-2 text-white">
          <GitBranch size={16} />
          <span className="text-sm font-semibold">{title}</span>
        </div>
        {diagram && (
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white/90 transition text-xs px-2 py-1 rounded-lg hover:bg-white/10"
            title={t.diagram_clear}
          >
            {t.diagram_clear}
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-4 bg-gray-50">

        {!diagram && (
          <div className="flex flex-col items-center justify-center h-full space-y-4 text-center select-none">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
              <GitFork size={28} className="text-gray-300" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-400">{t.diagram_empty_title}</p>
              <p className="text-xs text-gray-300 whitespace-pre-line">{t.diagram_empty_subtitle}</p>
            </div>
          </div>
        )}

        {diagram && loading && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 space-y-3">
            <Loader2 size={28} className="animate-spin text-indigo-400" />
            <p className="text-sm">{t.diagram_loading}</p>
          </div>
        )}

        {diagram && !loading && error && (
          <div className="flex flex-col items-center justify-center h-full space-y-3 text-center">
            <AlertTriangle size={28} className="text-amber-400" />
            <p className="text-sm text-gray-500">{t.diagram_error}</p>
            <pre className="text-xs text-red-400 bg-red-50 px-3 py-2 rounded-lg max-w-xs whitespace-pre-wrap">{error}</pre>
          </div>
        )}

        {diagram && !loading && !error && svg && (
          <div
            className="w-full h-full flex items-start justify-center [&_svg]:max-w-full [&_svg]:h-auto"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-100 px-4 py-2 flex-shrink-0 bg-white">
        <p className="text-[11px] text-gray-400 text-center">
          {diagram
            ? <>{t.diagram_footer_active} <span className="font-mono">{diagram.skill_name}</span></>
            : t.diagram_footer_waiting}
        </p>
      </div>
    </div>
  );
}
