/**
 * TestCasePanel.tsx — 版本绑定测试用例面板
 *
 * 三段式布局：顶部工具栏 + 中部用例列表 + 底部详情区
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Play, PlayCircle, RefreshCw, Sparkles, Loader2,
  CheckCircle2, XCircle, AlertTriangle, Circle, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';


// ── 类型 ─────────────────────────────────────────────────────────────────────

interface Requirement {
  id: string;
  source: string;
  description: string;
}

export interface TestCaseEntry {
  id: string;
  title: string;
  category: 'functional' | 'edge' | 'error' | 'state';
  priority: number;
  requirement_refs: string[];
  persona_id?: string;
  turns: string[];
  assertions: Array<{ type: string; value: string }>;
  notes?: string;
}

interface TestManifest {
  meta: {
    skill_id: string;
    version_no: number;
    generated_at: string;
    source_checksum: string;
    generator_version: string;
  } | null;
  requirements: Requirement[];
  cases: TestCaseEntry[];
}

interface AssertionResult {
  type: string;
  value: string;
  passed: boolean;
  detail: string;
}

export interface CaseResult {
  case_id: string;
  title: string;
  category: string;
  status: 'passed' | 'failed' | 'infra_error';
  assertions: AssertionResult[];
  transcript: Array<{ role: 'user' | 'assistant'; text: string }>;
  tools_called: string[];
  skills_loaded: string[];
  duration_ms: number;
}

interface BatchResult {
  total: number;
  passed: number;
  failed: number;
  infra_error: number;
  results: CaseResult[];
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface TestCasePanelProps {
  skillId: string;
  versionNo: number;
  /** 在对话 tab 中运行用例：父组件负责逐轮发送消息并收集结果 */
  onRunInChat?: (tc: TestCaseEntry, onResult: (result: CaseResult) => void) => void;
}

// ── 常量 ─────────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { key: 'all', label: '全部' },
  { key: 'functional', label: '功能' },
  { key: 'edge', label: '边界' },
  { key: 'error', label: '异常' },
  { key: 'state', label: '状态' },
] as const;

const CATEGORY_COLORS: Record<string, string> = {
  functional: 'bg-blue-100 text-blue-700',
  edge: 'bg-amber-100 text-amber-700',
  error: 'bg-red-100 text-red-700',
  state: 'bg-purple-100 text-purple-700',
};

const PRIORITY_COLORS: Record<number, string> = {
  1: 'bg-red-100 text-red-700',
  2: 'bg-orange-100 text-orange-700',
  3: 'bg-gray-100 text-gray-600',
};

// ── 组件 ─────────────────────────────────────────────────────────────────────

export function TestCasePanel({ skillId, versionNo, onRunInChat }: TestCasePanelProps) {
  const [manifest, setManifest] = useState<TestManifest | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [caseResults, setCaseResults] = useState<Record<string, CaseResult>>({});
  const [runningCaseId, setRunningCaseId] = useState<string | null>(null);
  const [runAllRunning, setRunAllRunning] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(true);

  // ── 数据加载 ───────────────────────────────────────────────────────────────

  const loadManifest = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/skill-versions/${encodeURIComponent(skillId)}/${versionNo}/testcases`);
      const data = await res.json();
      if (data.cases?.length > 0) {
        setManifest(data);
      } else {
        setManifest(null);
      }
    } catch {
      setManifest(null);
    }
    setLoading(false);
  }, [skillId, versionNo]);

  useEffect(() => {
    setManifest(null);
    setCaseResults({});
    setSelectedCaseId(null);
    loadManifest();
  }, [skillId, versionNo, loadManifest]);

  // ── 生成用例 ───────────────────────────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setCaseResults({});
    setSelectedCaseId(null);
    try {
      const res = await fetch(`/api/skill-versions/${encodeURIComponent(skillId)}/${versionNo}/generate-testcases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.ok && data.manifest) {
        setManifest(data.manifest);
      } else {
        alert(data.error ?? '生成失败');
      }
    } catch (err) {
      alert(`生成失败: ${err}`);
    }
    setGenerating(false);
  }, [skillId, versionNo]);

  // ── 运行单条 ───────────────────────────────────────────────────────────────

  const handleRunCase = useCallback(async (caseId: string, inChat = false) => {
    const tc = manifest?.cases.find(c => c.id === caseId);
    if (!tc) return;

    setRunningCaseId(caseId);
    setSelectedCaseId(caseId);

    // 在对话 tab 中运行：逐轮发送，实时显示
    if (inChat && onRunInChat) {
      onRunInChat(tc, (result) => {
        setCaseResults(prev => ({ ...prev, [caseId]: result }));
        setRunningCaseId(null);
      });
      return;
    }

    // 默认：后端批量执行
    try {
      const res = await fetch(`/api/skill-versions/${encodeURIComponent(skillId)}/${versionNo}/run-testcase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ case_id: caseId }),
      });
      const result: CaseResult = await res.json();
      setCaseResults(prev => ({ ...prev, [caseId]: result }));
    } catch (err) {
      setCaseResults(prev => ({
        ...prev,
        [caseId]: {
          case_id: caseId, title: '', category: '', status: 'infra_error',
          assertions: [], transcript: [], tools_called: [], skills_loaded: [],
          duration_ms: 0,
        },
      }));
    }
    setRunningCaseId(null);
  }, [skillId, versionNo, manifest, onRunInChat]);

  // ── 运行全部 ───────────────────────────────────────────────────────────────

  const handleRunAll = useCallback(async () => {
    setRunAllRunning(true);
    setCaseResults({});
    try {
      const res = await fetch(`/api/skill-versions/${encodeURIComponent(skillId)}/${versionNo}/run-all-testcases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const batch: BatchResult = await res.json();
      const map: Record<string, CaseResult> = {};
      for (const r of batch.results) map[r.case_id] = r;
      setCaseResults(map);
    } catch (err) {
      alert(`批量执行失败: ${err}`);
    }
    setRunAllRunning(false);
  }, [skillId, versionNo]);

  // ── 过滤 ───────────────────────────────────────────────────────────────────

  const filteredCases = useMemo(() => {
    if (!manifest) return [];
    if (categoryFilter === 'all') return manifest.cases;
    return manifest.cases.filter(c => c.category === categoryFilter);
  }, [manifest, categoryFilter]);

  const groupedCases = useMemo(() => {
    const groups: Record<string, TestCaseEntry[]> = {};
    for (const c of filteredCases) {
      (groups[c.category] ??= []).push(c);
    }
    return groups;
  }, [filteredCases]);

  // ── 统计 ───────────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const total = Object.keys(caseResults).length;
    if (total === 0) return null;
    const passed = Object.values(caseResults).filter(r => r.status === 'passed').length;
    const failed = Object.values(caseResults).filter(r => r.status === 'failed').length;
    const infraError = Object.values(caseResults).filter(r => r.status === 'infra_error').length;
    return { total, passed, failed, infraError };
  }, [caseResults]);

  const selectedCase = manifest?.cases.find(c => c.id === selectedCaseId) ?? null;
  const selectedResult = selectedCaseId ? caseResults[selectedCaseId] ?? null : null;

  // ── 渲染 ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* ── 顶部工具栏 ── */}
      <div className="shrink-0 p-2 border-b border-border bg-muted/30 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          {/* 生成/重新生成 */}
          {!manifest ? (
            <Button size="sm" variant="default" onClick={handleGenerate} disabled={generating} className="h-7 text-xs gap-1">
              {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              {generating ? '生成中...' : '生成用例'}
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={handleGenerate} disabled={generating} className="h-7 text-xs gap-1">
              {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              {generating ? '生成中...' : '重新生成'}
            </Button>
          )}

          {/* 运行全部 */}
          {manifest && (
            <Button size="sm" variant="outline" onClick={handleRunAll} disabled={runAllRunning || generating} className="h-7 text-xs gap-1">
              {runAllRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <PlayCircle className="w-3 h-3" />}
              {runAllRunning ? '执行中...' : '运行全部'}
            </Button>
          )}

          {/* 统计 */}
          {stats && (
            <div className="flex items-center gap-1 text-[10px] ml-auto">
              <span className="text-green-600">{stats.passed} pass</span>
              <span className="text-muted-foreground">/</span>
              <span className="text-red-600">{stats.failed} fail</span>
              {stats.infraError > 0 && (
                <>
                  <span className="text-muted-foreground">/</span>
                  <span className="text-amber-600">{stats.infraError} err</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* 第二行：分类筛选 */}
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {CATEGORIES.map(cat => (
              <button
                key={cat.key}
                onClick={() => setCategoryFilter(cat.key)}
                className={`px-2 py-0.5 rounded-full text-[10px] transition-colors ${
                  categoryFilter === cat.key
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-accent'
                }`}
              >
                {cat.label}
                {manifest && cat.key !== 'all' && (
                  <span className="ml-0.5 opacity-70">
                    {manifest.cases.filter(c => c.category === cat.key).length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── 中部用例列表 ── */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> 加载中...
          </div>
        ) : !manifest ? (
          <div className="flex flex-col items-center justify-center h-full text-sm text-muted-foreground gap-2">
            {generating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>正在分析技能并生成测试用例...</span>
                <span className="text-[10px]">这可能需要 20-30 秒</span>
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5 opacity-50" />
                <span>点击"生成用例"开始</span>
              </>
            )}
          </div>
        ) : filteredCases.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            该分类下暂无用例
          </div>
        ) : (
          <div className="p-2 space-y-3">
            {Object.entries(groupedCases).map(([category, cases]) => (
              <div key={category}>
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1 px-1">
                  {category} ({cases.length})
                </div>
                <div className="space-y-0.5">
                  {cases.map(tc => {
                    const result = caseResults[tc.id];
                    const isRunning = runningCaseId === tc.id;
                    const isSelected = selectedCaseId === tc.id;
                    return (
                      <div
                        key={tc.id}
                        onClick={() => setSelectedCaseId(tc.id)}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-xs transition-colors ${
                          isSelected ? 'bg-accent ring-1 ring-primary/20' : 'hover:bg-muted/50'
                        }`}
                      >
                        {/* 状态图标 */}
                        {isRunning ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />
                        ) : result ? (
                          <StatusIcon status={result.status} />
                        ) : (
                          <Circle className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
                        )}

                        {/* 标题 */}
                        <span className="truncate flex-1">{tc.id} · {tc.title}</span>

                        {/* 优先级 */}
                        <Badge variant="secondary" className={`text-[9px] px-1 py-0 ${PRIORITY_COLORS[tc.priority] ?? ''}`}>
                          P{tc.priority}
                        </Badge>

                        {/* 运行按钮：优先在对话中运行 */}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRunCase(tc.id, !!onRunInChat); }}
                          disabled={isRunning || runAllRunning}
                          className="opacity-0 group-hover:opacity-100 hover:opacity-100 p-0.5 rounded hover:bg-primary/10 transition-opacity shrink-0"
                          style={{ opacity: isSelected ? 1 : undefined }}
                          title={onRunInChat ? '在对话中运行' : '运行'}
                        >
                          <Play className="w-3 h-3 text-primary" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 底部详情区 ── */}
      {manifest && (
        <div className="shrink-0 border-t border-border">
          <button
            onClick={() => setDetailOpen(!detailOpen)}
            className="flex items-center justify-between w-full px-3 py-1.5 text-[10px] text-muted-foreground hover:bg-muted/30"
          >
            <span>详情</span>
            {detailOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
          </button>

          {detailOpen && (
            <div className="max-h-56 overflow-y-auto p-2 text-xs space-y-2">
              {!selectedCase ? (
                <div className="text-center text-muted-foreground py-4">选择一条用例查看详情</div>
              ) : !selectedResult ? (
                // 选中但未运行 — 显示用例定义
                <CaseDefinition tc={selectedCase} />
              ) : (
                // 有执行结果
                <CaseResultView result={selectedResult} tc={selectedCase} onRerun={() => handleRunCase(selectedCase.id)} />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── 子组件 ───────────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: 'passed' | 'failed' | 'infra_error' }) {
  switch (status) {
    case 'passed': return <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />;
    case 'failed': return <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />;
    case 'infra_error': return <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />;
  }
}

function CaseDefinition({ tc }: { tc: TestCaseEntry }) {
  return (
    <div className="space-y-2">
      <div className="font-medium">{tc.id}: {tc.title}</div>
      <div className="flex gap-2 flex-wrap">
        <Badge variant="secondary" className={`text-[9px] ${CATEGORY_COLORS[tc.category] ?? ''}`}>{tc.category}</Badge>
        <Badge variant="secondary" className={`text-[9px] ${PRIORITY_COLORS[tc.priority] ?? ''}`}>P{tc.priority}</Badge>
      </div>
      <div>
        <span className="text-muted-foreground">Reqs: </span>
        {tc.requirement_refs.join(', ')}
      </div>
      <div>
        <span className="text-muted-foreground">Turns:</span>
        <ol className="list-decimal list-inside ml-2 mt-0.5">
          {tc.turns.map((t, i) => <li key={i} className="text-[11px]">"{t}"</li>)}
        </ol>
      </div>
      <div>
        <span className="text-muted-foreground">Assertions:</span>
        <ul className="ml-2 mt-0.5 space-y-0.5">
          {tc.assertions.map((a, i) => (
            <li key={i} className="text-[11px]">
              <code className="bg-muted px-1 rounded text-[10px]">{a.type}</code> {a.value}
            </li>
          ))}
        </ul>
      </div>
      {tc.notes && <div className="text-muted-foreground italic">{tc.notes}</div>}
    </div>
  );
}

function CaseResultView({ result, tc, onRerun }: { result: CaseResult; tc: TestCaseEntry; onRerun: () => void }) {
  return (
    <div className="space-y-2">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusIcon status={result.status} />
          <span className="font-medium">{tc.id}: {tc.title}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">{result.duration_ms}ms</span>
          <Button size="sm" variant="ghost" onClick={onRerun} className="h-5 text-[10px] px-1.5 gap-1">
            <Play className="w-2.5 h-2.5" /> 重跑
          </Button>
        </div>
      </div>

      {/* 对话 transcript */}
      {result.transcript.length > 0 && (
        <div className="bg-muted/30 rounded-md p-2 space-y-1.5">
          <div className="text-[10px] font-medium text-muted-foreground mb-1">对话记录</div>
          {result.transcript.map((msg, i) => (
            <div key={i} className={`text-[11px] ${msg.role === 'user' ? 'text-primary' : 'text-foreground'}`}>
              <span className="font-medium">{msg.role === 'user' ? 'U' : 'A'}:</span>{' '}
              {msg.text.length > 300 ? msg.text.slice(0, 300) + '...' : msg.text}
            </div>
          ))}
        </div>
      )}

      {/* 断言结果 */}
      <div>
        <div className="text-[10px] font-medium text-muted-foreground mb-1">断言结果</div>
        <div className="space-y-0.5">
          {result.assertions.map((a, i) => (
            <div key={i} className={`flex items-start gap-1.5 text-[11px] ${a.passed ? 'text-green-700' : 'text-red-700'}`}>
              {a.passed ? <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0" /> : <XCircle className="w-3 h-3 mt-0.5 shrink-0" />}
              <div>
                <code className="bg-muted px-1 rounded text-[10px]">{a.type}</code>{' '}
                <span className="text-foreground">{a.detail}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 工具调用 */}
      {result.tools_called.length > 0 && (
        <div>
          <div className="text-[10px] font-medium text-muted-foreground mb-1">工具调用</div>
          <div className="flex gap-1 flex-wrap">
            {result.tools_called.map((t, i) => (
              <Badge key={i} variant="outline" className="text-[9px]">{t}</Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
