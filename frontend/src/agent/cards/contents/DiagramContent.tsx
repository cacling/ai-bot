/**
 * DiagramContent.tsx — flow diagram card content (colSpan: 2)
 *
 * data shape: { skill_name: string; mermaid: string } | null
 *
 * Zoom: CSS transform: scale() on SVG, with a wrapper div sized to
 *       svgW*zoom × svgH*zoom so the scroll container has correct range.
 * Focus: on highlight update, measure node position at zoom=1,
 *        then scrollTo(nodeCX*zoom - vpW/2, nodeCY*zoom - vpH/2).
 */

import { memo, useEffect, useState, useRef, useCallback } from 'react';
import { GitFork, Loader2, AlertTriangle, ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { renderMermaid } from '../../../shared/mermaid';
import { T, type Lang } from '../../../i18n';

interface DiagramData {
  skill_name: string;
  mermaid: string;
}

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 5;
const FOCUS_ZOOM_MIN = 0.8;
const FOCUS_ZOOM_MAX = 1.5;

/** Extract `%% progress:stateName` marker from mermaid source */
function extractProgressMarker(mermaid: string): string | null {
  const m = mermaid.match(/%% progress:(.+)$/m);
  return m ? m[1].trim() : null;
}

/** Strip `%% progress:xxx` marker from mermaid source before rendering */
function stripProgressMarker(mermaid: string): string {
  return mermaid.replace(/\n%% progress:.+$/m, '');
}

/**
 * Apply DOM-based highlighting to a state node by matching its text content.
 * Mermaid stateDiagram SVG structure: each state is a <g> containing <rect> + <text> (or <span>).
 * We find all <text> elements, match by textContent, then style the sibling <rect>.
 */
function applyProgressHighlightDOM(container: HTMLElement, stateName: string): boolean {
  // Mermaid stateDiagram SVG uses: <g class="node ..."> → <rect> + <g class="label"> → <foreignObject> → <div> → <span class="nodeLabel">
  // Also possible: <g> → <rect> + <text> → <tspan>
  // Strategy: find ALL text-bearing elements and match by content
  const candidates = container.querySelectorAll<Element>('.nodeLabel, text, tspan, foreignObject span, foreignObject div');
  const allTexts = Array.from(candidates).map(el => ({ el, text: el.textContent?.trim() ?? '' }));
  console.log('[ProgressHL] searching for:', stateName, 'candidates:', allTexts.map(t => t.text).slice(0, 20));

  for (const { el, text } of allTexts) {
    if (text !== stateName) continue;
    console.log('[ProgressHL] found match:', el.tagName, el.className);
    // Walk up to find the outer state node group (skip inner "label" groups)
    // Mermaid SVG: <g class="node statediagram-state" id="state-xxx"> → <rect/> (background)
    //                → <g class="label"> → <foreignObject> → <div> → <span class="nodeLabel">
    let node: Element | null = el;
    for (let depth = 0; depth < 8; depth++) {
      node = node?.parentElement ?? null;
      if (!node) break;
      const cls = node.getAttribute('class') ?? '';
      const id = node.id ?? '';
      // Must be the outer node group, not inner label group
      if (cls.includes('node') || cls.includes('statediagram') || id.includes('state-')) {
        const rect = node.querySelector(':scope > rect, :scope > path, :scope > polygon');
        if (rect) {
          console.log('[ProgressHL] applying style to:', node.tagName, id, cls);
          (rect as SVGElement).style.fill = '#fef08a';
          (rect as SVGElement).style.stroke = '#f59e0b';
          (rect as SVGElement).style.strokeWidth = '3px';
          node.classList.add('progressHL');
          return true;
        }
      }
    }
  }
  console.warn('[ProgressHL] no match found for:', stateName);
  return false;
}

/** Find the first highlighted node element inside a container */
function findHighlightedEl(container: HTMLElement): SVGGraphicsElement | null {
  for (const sel of ['.progressHL', '.toolHL', '.branchHL']) {
    const el = container.querySelector<SVGGraphicsElement>(sel);
    if (el) return el;
  }
  return null;
}

/** Get the natural (un-scaled) width/height of an SVG element */
function getSvgNaturalSize(svgEl: SVGSVGElement): { w: number; h: number } {
  const aw = svgEl.getAttribute('width');
  const ah = svgEl.getAttribute('height');
  if (aw && ah) {
    const w = parseFloat(aw);
    const h = parseFloat(ah);
    if (w > 0 && h > 0) return { w, h };
  }
  const vb = svgEl.viewBox?.baseVal;
  if (vb && vb.width > 0 && vb.height > 0) return { w: vb.width, h: vb.height };
  const r = svgEl.getBoundingClientRect();
  return { w: r.width || 400, h: r.height || 300 };
}

export const DiagramContent = memo(function DiagramContent({ data, lang }: { data: unknown; lang: Lang }) {
  const t = T[lang];
  const diagram = data as DiagramData | null;

  const [svgHtml, setSvgHtml] = useState('');
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const [zoom,    setZoom]    = useState(1);

  const viewportRef = useRef<HTMLDivElement>(null);
  const wrapRef     = useRef<HTMLDivElement>(null);
  const svgSizeRef  = useRef({ w: 0, h: 0 });
  const progressRef = useRef<string | null>(null);

  /* ── mermaid render ── */
  useEffect(() => {
    if (!diagram?.mermaid) { setSvgHtml(''); setError(''); setLoading(false); return; }

    const hlLines = diagram.mermaid.split('\n').filter((l: string) => l.includes(':::'));
    console.log('[DiagramContent] mermaid update', { skill: diagram.skill_name, len: diagram.mermaid.length, hlLines });

    let cancelled = false;
    setSvgHtml(''); setError(''); setLoading(true);

    const progressState = extractProgressMarker(diagram.mermaid);
    progressRef.current = progressState;
    const mermaidClean = progressState ? stripProgressMarker(diagram.mermaid) : diagram.mermaid;

    renderMermaid(mermaidClean)
      .then(result => {
        if (!cancelled) {
          const hasHL = result.includes('progressHL') || result.includes('toolHL') || result.includes('branchHL');
          console.log('[DiagramContent] render done', { hasHL, svgLen: result.length, progressState });
          setSvgHtml(result);
        }
      })
      .catch(err => { if (!cancelled) { console.error('[DiagramContent] render error', err); setError(err instanceof Error ? err.message : t.diagram_error); } })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [diagram?.mermaid]);

  /* ── after SVG mounts: measure size, then auto-focus on highlighted node ── */
  useEffect(() => {
    const wrap = wrapRef.current;
    const viewport = viewportRef.current;
    if (!wrap || !viewport || !svgHtml) return;

    // Reset zoom to 1 so measurements are clean
    setZoom(1);

    const raf = requestAnimationFrame(() => {
      const svgEl = wrap.querySelector<SVGSVGElement>('svg');
      if (!svgEl) return;

      const size = getSvgNaturalSize(svgEl);
      svgSizeRef.current = size;

      // Wait another frame for zoom=1 to apply
      requestAnimationFrame(() => {
        // Apply DOM-based progress highlighting if marker was present
        if (progressRef.current) {
          applyProgressHighlightDOM(wrap, progressRef.current);
        }
        const hlEl = findHighlightedEl(wrap);
        const vpRect = viewport.getBoundingClientRect();

        if (!hlEl) {
          // No highlight — fit whole diagram, but never shrink below readable threshold
          const NO_HL_ZOOM_MIN = 0.4;
          const fitZoom = Math.max(Math.min(vpRect.width / size.w, vpRect.height / size.h, 1), NO_HL_ZOOM_MIN);
          setZoom(fitZoom);
          // Scroll to top-left so the starting state is visible
          requestAnimationFrame(() => viewport.scrollTo({ left: 0, top: 0 }));
          return;
        }

        // Measure node position relative to SVG top-left (at zoom=1)
        const hlRect  = hlEl.getBoundingClientRect();
        const svgRect = svgEl.getBoundingClientRect();
        const nodeCX = hlRect.left + hlRect.width  / 2 - svgRect.left;
        const nodeCY = hlRect.top  + hlRect.height / 2 - svgRect.top;

        // Target zoom
        const padding = 80;
        const zx = vpRect.width  / (hlRect.width  + padding * 2);
        const zy = vpRect.height / (hlRect.height + padding * 2);
        const targetZoom = Math.min(Math.max(Math.min(zx, zy), FOCUS_ZOOM_MIN), FOCUS_ZOOM_MAX);

        console.log('[DiagramFocus] nodeCenter:', { nodeCX, nodeCY }, 'targetZoom:', targetZoom);

        // Apply zoom, then scroll in next frame
        setZoom(targetZoom);
        requestAnimationFrame(() => {
          viewport.scrollTo({
            left: nodeCX * targetZoom - vpRect.width  / 2,
            top:  nodeCY * targetZoom - vpRect.height / 2,
            behavior: 'smooth',
          });
        });
      });
    });

    return () => cancelAnimationFrame(raf);
  }, [svgHtml]);

  /* ── zoom controls ── */
  const changeZoom = useCallback((factor: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const vpW = viewport.clientWidth;
    const vpH = viewport.clientHeight;
    const centerX = viewport.scrollLeft + vpW / 2;
    const centerY = viewport.scrollTop  + vpH / 2;
    setZoom(prev => {
      const next = Math.min(Math.max(prev * factor, MIN_ZOOM), MAX_ZOOM);
      const ratio = next / prev;
      requestAnimationFrame(() => {
        viewport.scrollTo({
          left: centerX * ratio - vpW / 2,
          top:  centerY * ratio - vpH / 2,
        });
      });
      return next;
    });
  }, []);

  const zoomInFn  = useCallback(() => changeZoom(1.3), [changeZoom]);
  const zoomOutFn = useCallback(() => changeZoom(0.7), [changeZoom]);

  const resetZoomFn = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const { w, h } = svgSizeRef.current;
    if (w <= 0 || h <= 0) return;
    const vpRect = viewport.getBoundingClientRect();
    const fitZoom = Math.min(vpRect.width / w, vpRect.height / h, 1);
    setZoom(fitZoom);
    requestAnimationFrame(() => {
      viewport.scrollTo({
        left: Math.max((w * fitZoom - vpRect.width) / 2, 0),
        top:  Math.max((h * fitZoom - vpRect.height) / 2, 0),
      });
    });
  }, []);

  /* ── renders ── */

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

  const { w: svgW, h: svgH } = svgSizeRef.current;

  return (
    <div className="p-3 relative">
      {/* Scroll viewport */}
      <div
        ref={viewportRef}
        className="w-full h-[60vh] overflow-auto relative border border-gray-100 rounded-lg bg-white"
      >
        {/* Sized wrapper: stretches to svgW*zoom × svgH*zoom so scrollbars are correct */}
        <div
          ref={wrapRef}
          style={{
            width:  svgW > 0 ? `${svgW * zoom}px` : undefined,
            height: svgH > 0 ? `${svgH * zoom}px` : undefined,
          }}
        >
          <div
            style={{ transform: `scale(${zoom})`, transformOrigin: '0 0' }}
            className="[&_svg]:max-w-none [&_svg]:h-auto"
            dangerouslySetInnerHTML={{ __html: svgHtml }}
          />
        </div>
      </div>

      {/* Zoom controls */}
      <div className="absolute top-5 right-5 flex flex-col gap-1 z-10">
        <button onClick={zoomInFn}    className="w-7 h-7 rounded bg-white/90 shadow border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors" title="放大"><ZoomIn   size={14} className="text-gray-600" /></button>
        <button onClick={zoomOutFn}   className="w-7 h-7 rounded bg-white/90 shadow border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors" title="缩小"><ZoomOut  size={14} className="text-gray-600" /></button>
        <button onClick={resetZoomFn} className="w-7 h-7 rounded bg-white/90 shadow border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors" title="适应窗口"><Maximize size={14} className="text-gray-600" /></button>
      </div>

      <p className="text-[10px] text-gray-400 text-center mt-2">
        {t.diagram_footer_active} <span className="font-mono">{diagram.skill_name}</span>
      </p>
    </div>
  );
});
