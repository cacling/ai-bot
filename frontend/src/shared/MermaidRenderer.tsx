/**
 * MermaidRenderer.tsx — Shared mermaid diagram rendering core
 *
 * Handles: mermaid→SVG rendering, %% progress: DOM highlighting,
 * zoom controls, auto-focus on highlighted nodes.
 *
 * Used by: DiagramContent (agent workstation), DiagramPanel (chat),
 *          TestDiagramPanel (skill testing).
 */

import { memo, useEffect, useState, useRef, useCallback } from 'react';
import { Loader2, AlertTriangle, ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { renderMermaid } from './mermaid';

// ── Constants ────────────────────────────────────────────────────────────────
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 5;
const FOCUS_ZOOM_MIN = 0.8;
const FOCUS_ZOOM_MAX = 1.5;

// ── Node type color mapping ──────────────────────────────────────────────────

const NODE_TYPE_COLORS: Record<string, { fill: string; stroke: string }> = {
  tool:       { fill: '#dbeafe', stroke: '#3b82f6' },
  llm:        { fill: '#dcfce7', stroke: '#22c55e' },
  human:      { fill: '#fef3c7', stroke: '#f59e0b' },
  switch:     { fill: '#f3e8ff', stroke: '#a855f7' },
  guard:      { fill: '#fef2f2', stroke: '#ef4444' },
  end:        { fill: '#f1f5f9', stroke: '#94a3b8' },
  start:      { fill: '#ccfbf1', stroke: '#14b8a6' },
  // Legacy aliases
  message:    { fill: '#dcfce7', stroke: '#22c55e' },
  ref:        { fill: '#dcfce7', stroke: '#22c55e' },
  confirm:    { fill: '#fef3c7', stroke: '#f59e0b' },
  choice:     { fill: '#f3e8ff', stroke: '#a855f7' },
};

/** Apply color-coding to diagram nodes based on their semantic type */
export function applyNodeTypeColors(container: HTMLElement, nodeTypeMap: Record<string, string>): void {
  const candidates = container.querySelectorAll<Element>('.nodeLabel, text, tspan, foreignObject span, foreignObject div');
  const allTexts = Array.from(candidates).map(el => ({ el, text: el.textContent?.trim() ?? '' }));

  for (const [label, nodeType] of Object.entries(nodeTypeMap)) {
    const colors = NODE_TYPE_COLORS[nodeType];
    if (!colors) continue;

    for (const { el, text } of allTexts) {
      if (text !== label) continue;
      let node: Element | null = el;
      for (let depth = 0; depth < 8; depth++) {
        node = node?.parentElement ?? null;
        if (!node) break;
        const cls = node.getAttribute('class') ?? '';
        const id = node.id ?? '';
        if (cls.includes('node') || cls.includes('statediagram') || id.includes('state-')) {
          const rect = node.querySelector(':scope > rect, :scope > path, :scope > polygon');
          if (rect) {
            (rect as SVGElement).style.fill = colors.fill;
            (rect as SVGElement).style.stroke = colors.stroke;
            (rect as SVGElement).style.strokeWidth = '2px';
            break;
          }
        }
      }
      break;
    }
  }
}

// ── Progress marker helpers ──────────────────────────────────────────────────

/** Extract `%% progress:stateName` marker from mermaid source */
export function extractProgressMarker(mermaid: string): string | null {
  const m = mermaid.match(/%% progress:(.+)$/m);
  return m ? m[1].trim() : null;
}

/** Strip `%% progress:xxx` marker from mermaid source before rendering */
export function stripProgressMarker(mermaid: string): string {
  return mermaid.replace(/\n%% progress:.+$/m, '');
}

/** Apply DOM-based highlighting to a state node by matching its text content */
export function applyProgressHighlightDOM(container: HTMLElement, stateName: string): boolean {
  const candidates = container.querySelectorAll<Element>('.nodeLabel, text, tspan, foreignObject span, foreignObject div');
  const allTexts = Array.from(candidates).map(el => ({ el, text: el.textContent?.trim() ?? '' }));

  for (const { el, text } of allTexts) {
    if (text !== stateName) continue;
    // Walk up to find the outer state node group (skip inner "label" groups)
    let node: Element | null = el;
    for (let depth = 0; depth < 8; depth++) {
      node = node?.parentElement ?? null;
      if (!node) break;
      const cls = node.getAttribute('class') ?? '';
      const id = node.id ?? '';
      if (cls.includes('node') || cls.includes('statediagram') || id.includes('state-')) {
        const rect = node.querySelector(':scope > rect, :scope > path, :scope > polygon');
        if (rect) {
          (rect as SVGElement).style.fill = '#fef08a';
          (rect as SVGElement).style.stroke = '#f59e0b';
          (rect as SVGElement).style.strokeWidth = '3px';
          node.classList.add('progressHL');
          return true;
        }
      }
    }
  }
  return false;
}

/** Find the first highlighted node element inside a container */
export function findHighlightedEl(container: HTMLElement): SVGGraphicsElement | null {
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

// ── Props ────────────────────────────────────────────────────────────────────

export interface MermaidRendererProps {
  /** Mermaid source code (may contain %% progress: marker) */
  mermaid: string | null;
  /** Label → nodeType mapping for semantic color-coding */
  nodeTypeMap?: Record<string, string>;
  /** Enable zoom controls (default: true) */
  zoom?: boolean;
  /** Auto-focus on highlighted node (default: true) */
  autoFocus?: boolean;
  /** Container height CSS value (default: '60vh') */
  height?: string;
  /** Text shown when mermaid is null/empty */
  emptyText?: string;
  /** Text shown while loading */
  loadingText?: string;
  /** Text shown on error */
  errorText?: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export const MermaidRenderer = memo(function MermaidRenderer({
  mermaid: mermaidSrc,
  nodeTypeMap,
  zoom: zoomEnabled = true,
  autoFocus = true,
  height = '60vh',
  emptyText = '暂无流程图',
  loadingText = '渲染中…',
  errorText = '流程图渲染失败',
}: MermaidRendererProps) {
  const [svgHtml, setSvgHtml] = useState('');
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);

  const viewportRef = useRef<HTMLDivElement>(null);
  const wrapRef     = useRef<HTMLDivElement>(null);
  const svgSizeRef  = useRef({ w: 0, h: 0 });
  const progressRef    = useRef<string | null>(null);
  const nodeTypeMapRef = useRef<Record<string, string> | undefined>();

  // Keep nodeTypeMap ref in sync with prop
  useEffect(() => {
    nodeTypeMapRef.current = nodeTypeMap;
  }, [nodeTypeMap]);

  /* ── mermaid render ── */
  useEffect(() => {
    if (!mermaidSrc) { setSvgHtml(''); setError(''); setLoading(false); return; }

    let cancelled = false;
    setSvgHtml(''); setError(''); setLoading(true);

    const progressState = extractProgressMarker(mermaidSrc);
    progressRef.current = progressState;
    const mermaidClean = progressState ? stripProgressMarker(mermaidSrc) : mermaidSrc;

    renderMermaid(mermaidClean)
      .then(result => { if (!cancelled) setSvgHtml(result); })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : errorText); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [mermaidSrc, errorText]);

  /* ── after SVG mounts: highlight + measure + auto-focus ── */
  useEffect(() => {
    const wrap = wrapRef.current;
    const viewport = viewportRef.current;
    if (!wrap || !viewport || !svgHtml) return;

    setZoomLevel(1);

    const raf = requestAnimationFrame(() => {
      const svgEl = wrap.querySelector<SVGSVGElement>('svg');
      if (!svgEl) return;

      const size = getSvgNaturalSize(svgEl);
      svgSizeRef.current = size;

      requestAnimationFrame(() => {
        // Apply node-type color-coding (before progress highlight so current step overrides)
        if (nodeTypeMapRef.current && Object.keys(nodeTypeMapRef.current).length > 0) {
          applyNodeTypeColors(wrap, nodeTypeMapRef.current);
        }

        // Apply DOM-based progress highlighting
        if (progressRef.current) {
          applyProgressHighlightDOM(wrap, progressRef.current);
        }

        const hlEl = findHighlightedEl(wrap);
        const vpRect = viewport.getBoundingClientRect();

        if (!hlEl || !autoFocus) {
          const NO_HL_ZOOM_MIN = 0.4;
          const fitZoom = Math.max(Math.min(vpRect.width / size.w, vpRect.height / size.h, 1), NO_HL_ZOOM_MIN);
          setZoomLevel(fitZoom);
          requestAnimationFrame(() => viewport.scrollTo({ left: 0, top: 0 }));
          return;
        }

        // Measure node position relative to SVG top-left (at zoom=1)
        const hlRect  = hlEl.getBoundingClientRect();
        const svgRect = svgEl.getBoundingClientRect();
        const nodeCX = hlRect.left + hlRect.width  / 2 - svgRect.left;
        const nodeCY = hlRect.top  + hlRect.height / 2 - svgRect.top;

        const padding = 80;
        const zx = vpRect.width  / (hlRect.width  + padding * 2);
        const zy = vpRect.height / (hlRect.height + padding * 2);
        const targetZoom = Math.min(Math.max(Math.min(zx, zy), FOCUS_ZOOM_MIN), FOCUS_ZOOM_MAX);

        setZoomLevel(targetZoom);
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
  }, [svgHtml, autoFocus]);

  /* ── zoom controls ── */
  const changeZoom = useCallback((factor: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const vpW = viewport.clientWidth;
    const vpH = viewport.clientHeight;
    const centerX = viewport.scrollLeft + vpW / 2;
    const centerY = viewport.scrollTop  + vpH / 2;
    setZoomLevel(prev => {
      const next = Math.min(Math.max(prev * factor, MIN_ZOOM), MAX_ZOOM);
      const ratio = next / prev;
      requestAnimationFrame(() => {
        viewport.scrollTo({ left: centerX * ratio - vpW / 2, top: centerY * ratio - vpH / 2 });
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
    setZoomLevel(fitZoom);
    requestAnimationFrame(() => {
      viewport.scrollTo({
        left: Math.max((w * fitZoom - vpRect.width) / 2, 0),
        top:  Math.max((h * fitZoom - vpRect.height) / 2, 0),
      });
    });
  }, []);

  /* ── renders ── */

  if (!mermaidSrc) {
    return <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">{emptyText}</div>;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
        <Loader2 size={18} className="animate-spin text-primary" />
        <span className="text-xs">{loadingText}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-6 space-y-2 px-4">
        <AlertTriangle size={20} className="text-muted-foreground" />
        <p className="text-xs text-muted-foreground">{errorText}</p>
        <pre className="text-[11px] text-destructive bg-destructive/10 px-3 py-2 rounded-lg max-w-full whitespace-pre-wrap">{error}</pre>
      </div>
    );
  }

  const { w: svgW, h: svgH } = svgSizeRef.current;

  return (
    <div className="relative">
      <div
        ref={viewportRef}
        className="w-full overflow-auto border border-border rounded-lg bg-background"
        style={{ height }}
      >
        <div
          ref={wrapRef}
          style={{
            width:  svgW > 0 ? `${svgW * zoomLevel}px` : undefined,
            height: svgH > 0 ? `${svgH * zoomLevel}px` : undefined,
          }}
        >
          <div
            style={{ transform: `scale(${zoomLevel})`, transformOrigin: '0 0' }}
            className="[&_svg]:max-w-none [&_svg]:h-auto"
            dangerouslySetInnerHTML={{ __html: svgHtml }}
          />
        </div>
      </div>

      {zoomEnabled && (
        <div className="absolute top-2 right-2 flex flex-col gap-1 z-10">
          <Button variant="outline" size="icon-sm" onClick={zoomInFn}    className="bg-background/90 shadow" title="放大"><ZoomIn   size={14} className="text-muted-foreground" /></Button>
          <Button variant="outline" size="icon-sm" onClick={zoomOutFn}   className="bg-background/90 shadow" title="缩小"><ZoomOut  size={14} className="text-muted-foreground" /></Button>
          <Button variant="outline" size="icon-sm" onClick={resetZoomFn} className="bg-background/90 shadow" title="适应窗口"><Maximize size={14} className="text-muted-foreground" /></Button>
        </div>
      )}
    </div>
  );
});
