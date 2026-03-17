/**
 * PipelinePanel.tsx — 发布管道面板
 *
 * 右侧面板三区域：
 *  1. Pipeline Stepper（编辑中 → 沙盒验证 → 已发布）
 *  2. 沙盒测试区（当处于沙盒阶段时展开）
 *  3. 版本历史（常驻折叠区）
 *
 * 设计原则：
 *  - 无"保存草稿"按钮，编辑器自动保存（debounce 3s）
 *  - "发布到沙盒"时自动保存当前内容再创建沙盒
 *  - 用户只需关心两个动作：发布到沙盒、发布到生产
 */

import React, { useState } from 'react';
import {
  Circle, CheckCircle2, Loader2,
  FlaskConical, History, ChevronDown, ChevronRight,
  Trash2, Rocket,
} from 'lucide-react';
import { VersionPanel } from './VersionPanel';
import { SandboxPanel } from './SandboxPanel';

// ── 类型 ──────────────────────────────────────────────────────────────────────

export type PipelineStage = 'draft' | 'sandbox' | 'production';

interface PipelinePanelProps {
  filePath: string | null;
  stage: PipelineStage;
  /** 编辑器内容是否自动保存完毕（false = 有未保存的修改正在 debounce） */
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

// ── Stepper ──────────────────────────────────────────────────────────────────

function StepIcon({ status }: { status: 'done' | 'active' | 'pending' }) {
  if (status === 'done')
    return <CheckCircle2 className="w-5 h-5 text-green-500" />;
  if (status === 'active')
    return (
      <div className="w-5 h-5 rounded-full border-2 border-indigo-500 bg-indigo-100 flex items-center justify-center">
        <div className="w-2 h-2 rounded-full bg-indigo-500" />
      </div>
    );
  return <Circle className="w-5 h-5 text-slate-300" />;
}

function stepStatus(current: PipelineStage, step: PipelineStage): 'done' | 'active' | 'pending' {
  const order: PipelineStage[] = ['draft', 'sandbox', 'production'];
  const ci = order.indexOf(current);
  const si = order.indexOf(step);
  if (si < ci) return 'done';
  if (si === ci) return 'active';
  return 'pending';
}

// ── 主组件 ────────────────────────────────────────────────────────────────────

export function PipelinePanel({
  filePath,
  stage,
  autoSaved,
  channels,
  version,
  onPublishToSandbox,
  onPublishDone,
  onDiscardSandbox,
  onRollback,
  saving,
  sandboxId,
}: PipelinePanelProps) {
  const [showVersions, setShowVersions] = useState(false);

  return (
    <div className="h-full flex flex-col bg-white overflow-y-auto">

      {/* ── 区域一：Pipeline Stepper ── */}
      <div className="p-4 border-b border-slate-200">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
          发布管道
        </h3>

        {/* Stepper */}
        <div className="space-y-0">
          {/* Step 1: 编辑中 */}
          <div className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <StepIcon status={stepStatus(stage, 'draft')} />
              <div className="w-px h-6 bg-slate-200" />
            </div>
            <div className="flex-1 pb-2">
              <p className="text-sm font-medium text-slate-700">编辑中</p>
              <p className="text-xs text-slate-400">
                {autoSaved ? '已自动保存' : '自动保存中…'}
              </p>
            </div>
          </div>

          {/* Step 2: 沙盒验证 */}
          <div className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <StepIcon status={stepStatus(stage, 'sandbox')} />
              <div className="w-px h-6 bg-slate-200" />
            </div>
            <div className="flex-1 pb-2">
              <p className="text-sm font-medium text-slate-700">沙盒验证</p>
              <p className="text-xs text-slate-400">隔离测试 + 回归验证</p>
            </div>
          </div>

          {/* Step 3: 已发布 */}
          <div className="flex items-start gap-3">
            <StepIcon status={stepStatus(stage, 'production')} />
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-700">已发布</p>
              <p className="text-xs text-slate-400">各渠道机器人自动加载</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-4 space-y-2">
          {stage === 'draft' && (
            <button
              onClick={onPublishToSandbox}
              disabled={!filePath || saving}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {saving ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 保存并创建沙盒…</>
              ) : (
                <><FlaskConical className="w-3.5 h-3.5" /> 发布到沙盒</>
              )}
            </button>
          )}

          {stage === 'sandbox' && (
            <button
              onClick={onDiscardSandbox}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-slate-100 text-slate-500 text-xs font-medium rounded-lg hover:bg-red-50 hover:text-red-600 transition"
            >
              <Trash2 className="w-3.5 h-3.5" /> 放弃沙盒，继续编辑
            </button>
          )}

          {stage === 'production' && (
            <>
              <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50 rounded-lg px-3 py-2">
                <CheckCircle2 className="w-3.5 h-3.5" />
                已发布到生产
              </div>
              <button
                onClick={() => {/* 允许继续编辑新版本 */}}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-slate-100 text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-200 transition"
              >
                <Rocket className="w-3.5 h-3.5" /> 继续编辑新版本
              </button>
            </>
          )}
        </div>

        {/* Meta info */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {channels.map(ch => (
            <span key={ch} className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded-full">
              {ch}
            </span>
          ))}
          {version && (
            <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full">
              v{version}
            </span>
          )}
        </div>
      </div>

      {/* ── 区域二：沙盒测试（仅在沙盒阶段展开）── */}
      {stage === 'sandbox' && sandboxId && (
        <div className="flex-1 border-b border-slate-200 overflow-hidden">
          <SandboxPanel
            filePath={filePath}
            onPublishDone={onPublishDone}
            onClose={onDiscardSandbox}
            externalSandboxId={sandboxId}
          />
        </div>
      )}

      {/* ── 区域三：版本历史（折叠区）── */}
      <div className="border-t border-slate-200">
        <button
          onClick={() => setShowVersions(!showVersions)}
          className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hover:bg-slate-50 transition"
        >
          {showVersions ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          <History className="w-3.5 h-3.5" />
          版本历史
        </button>
        {showVersions && (
          <div className="max-h-64 overflow-y-auto">
            <VersionPanel
              filePath={filePath}
              onClose={() => setShowVersions(false)}
              onRollback={onRollback}
            />
          </div>
        )}
      </div>
    </div>
  );
}
