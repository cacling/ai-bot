import { useDeferredValue, useEffect, useState } from 'react';

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationCheck {
  rule: string;
  severity: ValidationSeverity;
  message: string;
  location?: string;
}

export interface DiagramStructure {
  states: Array<{ name: string; isChoice: boolean; isNested: boolean; line: number }>;
  transitions: Array<{ from: string; to: string; label: string; annotations: string[]; line: number }>;
  annotations: Array<{ type: string; value: string; line: number; targetState?: string }>;
  hasStart: boolean;
  hasEnd: boolean;
}

export interface DiagramPreviewResponse {
  mermaid: string | null;
  nodeTypeMap: Record<string, string> | null;
  section: { hasSection: boolean; hasMermaidBlock: boolean };
  compile: { errors: string[]; warnings: string[] };
  validation: { valid: boolean; errors: ValidationCheck[]; warnings: ValidationCheck[]; infos: ValidationCheck[] };
  structure: DiagramStructure | null;
}

export function useWorkbenchPreview(opts: {
  skillMd: string;
  skillId: string | null;
  versionNo: number | null;
  references: string[];
  assets: string[];
  enabled: boolean;
}): { preview: DiagramPreviewResponse | null; loading: boolean; error: string | null } {
  const { skillMd, skillId, versionNo, references, assets, enabled } = opts;
  const deferredSkillMd = useDeferredValue(skillMd);
  const [preview, setPreview] = useState<DiagramPreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const ctrl = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/skill-versions/diagram-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            skill: skillId ?? undefined,
            version_no: versionNo ?? undefined,
            skill_md: deferredSkillMd,
            references: references.map(filename => ({ filename })),
            assets: assets.map(filename => ({ filename })),
          }),
          signal: ctrl.signal,
        });
        let data: DiagramPreviewResponse;
        try {
          data = await res.json();
        } catch {
          throw new Error(`HTTP ${res.status}: 响应不是有效 JSON`);
        }
        if (!res.ok) throw new Error((data as unknown as Record<string, unknown>).error as string ?? `HTTP ${res.status}`);
        setPreview(data);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setError(err instanceof Error ? err.message : '状态图预览失败');
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 250);

    return () => {
      ctrl.abort();
      window.clearTimeout(timer);
    };
  }, [assets, deferredSkillMd, enabled, references, skillId, versionNo]);

  return { preview, loading, error };
}
