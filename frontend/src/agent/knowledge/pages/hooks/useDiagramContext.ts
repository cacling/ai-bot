import { useEffect, useMemo, useState } from 'react';
import { findCustomerGuidanceDiagramSection } from '../../shared/skillMarkdown';

export interface DiagramContext {
  mermaid: string | null;
  nodeTypeMap: Record<string, string> | undefined;
  progressState: string | undefined;
  loading: boolean;
  sourceLabel: string | null;
  isTestMode: boolean;
}

export interface TestDiagram {
  skill_name: string;
  mermaid: string;
  progressState?: string;
  nodeTypeMap?: Record<string, string>;
}

interface BackendDiagram {
  mermaid: string;
  nodeTypeMap: Record<string, string> | null;
}

export function useDiagramContext(opts: {
  skillId: string | null;
  editorContent: string;
  testDiagram: TestDiagram | null;
  testingVersion: number | null;
  selectedIsSkillMd: boolean;
  workbenchPreview?: { mermaid: string | null; nodeTypeMap: Record<string, string> | null } | null;
}): DiagramContext {
  const { skillId, editorContent, testDiagram, testingVersion, selectedIsSkillMd, workbenchPreview } = opts;

  // ── Backend-compiled diagram ──────────────────────────────────────────────
  const [backendDiagram, setBackendDiagram] = useState<BackendDiagram | null>(null);
  const [backendDiagramLoading, setBackendDiagramLoading] = useState(false);

  useEffect(() => {
    if (!skillId || skillId.startsWith('new-')) {
      setBackendDiagram(null);
      setBackendDiagramLoading(false);
      return;
    }
    setBackendDiagram(null);
    setBackendDiagramLoading(true);
    fetch(`/api/skill-versions/${encodeURIComponent(skillId)}/diagram-data`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.mermaid) setBackendDiagram(data); else setBackendDiagram(null); })
      .catch(() => setBackendDiagram(null))
      .finally(() => setBackendDiagramLoading(false));
  }, [skillId]);

  // ── Fallback mermaid from editor content ──────────────────────────────────
  const fallbackMermaid = useMemo(() => {
    if (backendDiagramLoading || !selectedIsSkillMd) return null;
    return findCustomerGuidanceDiagramSection(editorContent)
      .mermaid?.replace(/\s*%%[^\n]*/gm, '').trim() ?? null;
  }, [backendDiagramLoading, selectedIsSkillMd, editorContent]);

  // ── Priority resolution ───────────────────────────────────────────────────
  // testDiagram > workbenchPreview > backendDiagram > fallbackMermaid
  return useMemo<DiagramContext>(() => {
    const isTestMode = testingVersion !== null;

    if (testDiagram) {
      return {
        mermaid: testDiagram.mermaid,
        nodeTypeMap: testDiagram.nodeTypeMap,
        progressState: testDiagram.progressState,
        loading: false,
        sourceLabel: testDiagram.skill_name,
        isTestMode,
      };
    }
    if (workbenchPreview?.mermaid) {
      return {
        mermaid: workbenchPreview.mermaid,
        nodeTypeMap: workbenchPreview.nodeTypeMap ?? undefined,
        progressState: undefined,
        loading: false,
        sourceLabel: selectedIsSkillMd ? skillId : null,
        isTestMode,
      };
    }
    if (backendDiagram) {
      return {
        mermaid: backendDiagram.mermaid,
        nodeTypeMap: backendDiagram.nodeTypeMap ?? undefined,
        progressState: undefined,
        loading: false,
        sourceLabel: selectedIsSkillMd ? skillId : null,
        isTestMode,
      };
    }
    return {
      mermaid: fallbackMermaid,
      nodeTypeMap: undefined,
      progressState: undefined,
      loading: backendDiagramLoading,
      sourceLabel: selectedIsSkillMd ? skillId : null,
      isTestMode,
    };
  }, [testDiagram, workbenchPreview, backendDiagram, fallbackMermaid, backendDiagramLoading, testingVersion, selectedIsSkillMd, skillId]);
}
