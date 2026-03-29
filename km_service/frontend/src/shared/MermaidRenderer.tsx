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
  tool:       { fill: '#dbeafe', stroke: '#3b82f6' },   // Blue — MCP tool call
  llm:        { fill: '#dcfce7', stroke: '#22c55e' },   // Green — AI text generation
  human:      { fill: '#ffedd5', stroke: '#f97316' },   // Orange — confirm / escalation (not yellow, avoids progress highlight conflict)
  switch:     { fill: '#f3e8ff', stroke: '#a855f7' },   // Purple — branch / decision
  guard:      { fill: '#fef2f2', stroke: '#ef4444' },   // Red — compliance check
  end:        { fill: '#f1f5f9', stroke: '#94a3b8' },   // Gray — terminal
  start:      { fill: '#ccfbf1', stroke: '#14b8a6' },   // Teal — entry
  fork:       { fill: '#e0f2fe', stroke: '#0284c7' },   // Sky — parallel fork
  join:       { fill: '#e0f2fe', stroke: '#0284c7' },   // Sky — parallel join
  // Legacy aliases
  message:    { fill: '#dcfce7', stroke: '#22c55e' },
  ref:        { fill: '#dcfce7', stroke: '#22c55e' },
  confirm:    { fill: '#ffedd5', stroke: '#f97316' },   // Orange (same as human)
  choice:     { fill: '#f3e8ff', stroke: '#a855f7' },
};

// Legend items — only primary types, ordered logically (skip legacy aliases)
const NODE_TYPE_LEGEND: Array<{ kind: string; label: string }> = [
  { kind: 'start',  label: '入口' },
  { kind: 'tool',   label: '工具调用' },
  { kind: 'llm',    label: 'AI 生成' },
  { kind: 'switch', label: '分支' },
  { kind: 'human',  label: '人工确认' },
  { kind: 'guard',  label: '合规检查' },
  { kind: 'fork',   label: '并行' },
  { kind: 'end',    label: '结束' },
];

/** Apply color-coding to diagram nodes based on their semantic type */
export function applyNodeTypeColors(container: HTMLElement, nodeTypeMap: Record<string, string>): void {
  const allEls = container.querySelectorAll<Element>('[id]');

  for (const [label, nodeType] of Object.entries(nodeTypeMap)) {
    const colors = NODE_TYPE_COLORS[nodeType];
    if (!colors) continue;

    // Strategy 1: Match by mermaid element ID containing label
    let found = false;
    for (const el of allEls) {
      if (!el.id.includes(label)) continue;
      const rect = el.querySelector('rect, path, polygon');
      if (rect) {
        (rect as SVGElement).style.fill = colors.fill;
        (rect as SVGElement).style.stroke = colors.stroke;
        (rect as SVGElement).style.strokeWidth = '2px';
        found = true;
        break;
      }
    }
    if (found) continue;

    // Strategy 2: Fall back to text content matching
    const candidates = container.querySelectorAll<Element>('span, div, text, tspan');
    for (const el of candidates) {
      const text = el.textContent?.trim() ?? '';
      if (text !== label) continue;
      let node: Element | null = el;
      for (let depth = 0; depth < 10; depth++) {
        node = node?.parentElement ?? null;
        if (!node) break;
        const cls = node.getAttribute('class') ?? '';
        const nid = node.id ?? '';
        if (cls.includes('node') || cls.includes('statediagram') || nid.includes('state-')) {
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

/** Apply DOM-based highlighting to a state node by matching its text content or mermaid node ID */
export function applyProgressHighlightDOM(container: HTMLElement, stateName: string): boolean {
  // Strategy 1: Find by mermaid-generated element ID (most reliable for nested states)
  // Mermaid stateDiagram-v2 generates IDs like "state-获取账单-XXX" or containing the state name
  const allEls = container.querySelectorAll<Element>('[id]');
  for (const el of allEls) {
    const id = el.id;
    if (!id.includes(stateName)) continue;
    // Found a matching element — find its rect/path for coloring
    const rect = el.querySelector('rect, path, polygon') ??
                 el.closest('[class*="state"]')?.querySelector(':scope > rect, :scope > path');
    if (rect) {
      (rect as SVGElement).style.fill = '#fef08a';
      (rect as SVGElement).style.stroke = '#f59e0b';
      (rect as SVGElement).style.strokeWidth = '3px';
      (rect.parentElement ?? el).classList.add('progressHL');
      return true;
    }
  }

  // Strategy 2: Fall back to text content matching (works for flat state diagrams)
  const candidates = container.querySelectorAll<Element>('span, div, text, tspan');
  for (const el of candidates) {
    const text = el.textContent?.trim() ?? '';
    if (!text) continue;
    if (text !== stateName && !text.startsWith(stateName)) continue;
    if (text.length > stateName.length * 3) continue;
    // Walk up to find state node group
    let node: Element | null = el;
    for (let depth = 0; depth < 10; depth++) {
      node = node?.parentElement ?? null;
      if (!node) break;
      const cls = node.getAttribute('class') ?? '';
      const nid = node.id ?? '';
      if (cls.includes('node') || cls.includes('statediagram') || nid.includes('state-')) {
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
  /** Mermaid source code (clean — no %% annotations) */
  mermaid: string | null;
  /** Label → nodeType mapping for semantic color-coding */
  nodeTypeMap?: Record<string, string>;
  /** Current progress state name for highlighting (replaces %% progress: marker) */
  progressState?: string;
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
  progressState: progressStateProp,
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

  // Re-apply node type colors when nodeTypeMap changes (without re-rendering SVG)
  useEffect(() => {
    nodeTypeMapRef.current = nodeTypeMap;
    const wrap = wrapRef.current;
    const keys = nodeTypeMap ? Object.keys(nodeTypeMap).length : 0;
    if (!wrap || !svgHtml || !nodeTypeMap || keys === 0) return;
    applyNodeTypeColors(wrap, nodeTypeMap);
    if (progressRef.current) applyProgressHighlightDOM(wrap, progressRef.current);
  }, [nodeTypeMap, svgHtml]);

  /* ── mermaid render ── */
  useEffect(() => {
    if (!mermaidSrc) { setSvgHtml(''); setError(''); setLoading(false); return; }

    let cancelled = false;
    setSvgHtml(''); setError(''); setLoading(true);

    // progressState from prop takes priority; fallback to embedded %% progress: marker (backward compat)
    const embeddedProgress = extractProgressMarker(mermaidSrc);
    progressRef.current = progressStateProp ?? embeddedProgress;
    const mermaidClean = embeddedProgress ? stripProgressMarker(mermaidSrc) : mermaidSrc;

    renderMermaid(mermaidClean)
      .then(result => { if (!cancelled) setSvgHtml(result); })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : errorText); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [mermaidSrc, errorText]);

  /* ── re-apply highlighting when progressState prop changes (without re-rendering SVG) ── */
  useEffect(() => {
    progressRef.current = progressStateProp ?? null;
    const wrap = wrapRef.current;
    if (!wrap || !svgHtml || !progressStateProp) return;
    // Clear previous progress highlight
    wrap.querySelectorAll('.progressHL').forEach(el => {
      const rect = el.querySelector(':scope > rect, :scope > path, :scope > polygon');
      if (rect) { (rect as SVGElement).style.fill = ''; (rect as SVGElement).style.stroke = ''; (rect as SVGElement).style.strokeWidth = ''; }
      el.classList.remove('progressHL');
    });
    // Re-apply node type colors first
    if (nodeTypeMapRef.current && Object.keys(nodeTypeMapRef.current).length > 0) {
      applyNodeTypeColors(wrap, nodeTypeMapRef.current);
    }
    // Apply progress highlight on top
    const hlResult = applyProgressHighlightDOM(wrap, progressStateProp);
    if (!hlResult) {
      console.warn('[MermaidRenderer] highlight failed for:', progressStateProp);
    }
  }, [progressStateProp, svgHtml]);

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

  const hasNodeTypes = nodeTypeMap && Object.keys(nodeTypeMap).length > 0;

  return (
    <div>
      {hasNodeTypes && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1 mb-1 text-[10px] text-muted-foreground">
          {NODE_TYPE_LEGEND.map(({ kind, label }) => {
            const c = NODE_TYPE_COLORS[kind];
            if (!c) return null;
            return (
              <span key={kind} className="inline-flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: c.fill, border: `1.5px solid ${c.stroke}` }} />
                {label}
              </span>
            );
          })}
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#fef08a', border: '1.5px solid #f59e0b' }} />
            当前步骤
          </span>
        </div>
      )}

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
    </div>
  );
});
