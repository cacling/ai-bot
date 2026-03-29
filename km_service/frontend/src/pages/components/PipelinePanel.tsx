/**
 * PipelinePanel.tsx — 沙盒测试面板
 *
 * 仅在沙盒测试时显示内容，其余时间显示 channels + version 元信息。
 */

import React from 'react';
import { SandboxPanel } from './SandboxPanel';

export type PipelineStage = 'draft' | 'sandbox' | 'production';

interface PipelinePanelProps {
  filePath: string | null;
  stage: PipelineStage;
  autoSaved: boolean;
  channels: string[];
  version: string;

  onPublishToSandbox: () => void;
  onPublishDone: () => void;
  onDiscardSandbox: () => void;
  onRollback: () => void;

  saving: boolean;
  sandboxId: string | null;
}

export function PipelinePanel({
  filePath,
  stage,
  channels,
  version,
  onPublishDone,
  onDiscardSandbox,
  sandboxId,
}: PipelinePanelProps) {
  return (
    <div className="flex flex-col bg-white overflow-y-auto">
      {/* Sandbox test area */}
      {stage === 'sandbox' && sandboxId && (
        <div className="flex-1 border-t border-border overflow-hidden">
          <SandboxPanel
            filePath={filePath}
            onPublishDone={onPublishDone}
            onClose={onDiscardSandbox}
            externalSandboxId={sandboxId}
          />
        </div>
      )}
    </div>
  );
}
