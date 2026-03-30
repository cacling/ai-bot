import React from 'react';

export function KnowledgeManagementPage() {
  return <div data-testid="km-page">KnowledgeManagementPage</div>;
}

export function SkillManagerPage(_props: { onOpenToolContract?: (name: string) => void }) {
  return <div data-testid="skill-page">SkillManagerPage</div>;
}

export function McpManagementPage(_props: { externalNavigateToTool?: unknown; onExternalNavigateHandled?: () => void }) {
  return <div data-testid="mcp-page">McpManagementPage</div>;
}

export function EditorPage() {
  return <div data-testid="editor-page">EditorPage</div>;
}
