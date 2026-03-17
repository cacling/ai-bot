import React, { useState, useEffect, useCallback } from 'react';
import { Save, AlertCircle, CheckCircle, Loader2, Columns2, FileText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FileTree, type FileNode } from './components/FileTree';
import { MarkdownEditor } from './components/MarkdownEditor';

type ViewMode = 'wysiwyg' | 'split';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

async function fetchTree(): Promise<FileNode[]> {
  const res = await fetch('/api/files/tree');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json() as { tree: FileNode[] };
  return data.tree;
}

async function fetchContent(path: string): Promise<string> {
  const res = await fetch(`/api/files/content?path=${encodeURIComponent(path)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json() as { content: string };
  return data.content;
}

async function saveContent(path: string, content: string): Promise<void> {
  const res = await fetch('/api/files/content', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export function EditorPage() {
  const [treeNodes, setTreeNodes] = useState<FileNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(true);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [editorContent, setEditorContent] = useState('');
  const [fileLoading, setFileLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('wysiwyg');
  const [milkdownKey, setMilkdownKey] = useState(0);

  // Load file tree on mount
  useEffect(() => {
    fetchTree()
      .then(setTreeNodes)
      .catch((err) => console.error('获取文件树失败:', err))
      .finally(() => setTreeLoading(false));
  }, []);

  const handleSelectFile = useCallback(async (path: string) => {
    if (path === selectedPath) return;
    setSelectedPath(path);
    setFileLoading(true);
    setSaveStatus('idle');
    try {
      const content = await fetchContent(path);
      setEditorContent(content);
    } catch (err) {
      setErrorMsg(`加载失败: ${err instanceof Error ? err.message : String(err)}`);
      setSaveStatus('error');
    } finally {
      setFileLoading(false);
    }
  }, [selectedPath]);

  const handleSetViewMode = useCallback((mode: ViewMode) => {
    if (mode === 'wysiwyg' && viewMode === 'split') {
      // Force Milkdown remount so it picks up any edits made in split mode
      setMilkdownKey((k) => k + 1);
    }
    setViewMode(mode);
  }, [viewMode]);

  const handleSave = async () => {
    if (!selectedPath) return;
    setSaveStatus('saving');
    try {
      await saveContent(selectedPath, editorContent);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      setErrorMsg(`保存失败: ${err instanceof Error ? err.message : String(err)}`);
      setSaveStatus('error');
    }
  };

  return (
    <div className="flex h-full">
      {/* Left: File tree */}
      <div className="w-60 flex-shrink-0 border-r border-gray-200 bg-gray-50 flex flex-col">
        <div className="px-3 py-3 border-b border-gray-200">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">文件</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-1">
          <FileTree
            nodes={treeNodes}
            selectedPath={selectedPath}
            onSelect={handleSelectFile}
            loading={treeLoading}
          />
        </div>
      </div>

      {/* Right: Editor area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 bg-white">
          <span className="text-sm text-gray-500 truncate">
            {selectedPath ?? '请选择一个文件'}
          </span>
          <div className="flex items-center space-x-3">
            {/* View mode toggle */}
            {selectedPath && (
              <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden">
                <button
                  onClick={() => handleSetViewMode('wysiwyg')}
                  title="富文本模式"
                  className={`flex items-center space-x-1 px-2.5 py-1.5 text-xs font-medium transition ${
                    viewMode === 'wysiwyg'
                      ? 'bg-gray-100 text-gray-800'
                      : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <FileText size={13} />
                  <span>富文本</span>
                </button>
                <button
                  onClick={() => handleSetViewMode('split')}
                  title="分栏模式"
                  className={`flex items-center space-x-1 px-2.5 py-1.5 text-xs font-medium transition border-l border-gray-200 ${
                    viewMode === 'split'
                      ? 'bg-gray-100 text-gray-800'
                      : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Columns2 size={13} />
                  <span>分栏</span>
                </button>
              </div>
            )}
            {/* Save status indicator */}
            {saveStatus === 'saving' && (
              <span className="flex items-center text-xs text-gray-400 space-x-1">
                <Loader2 size={13} className="animate-spin" />
                <span>保存中…</span>
              </span>
            )}
            {saveStatus === 'saved' && (
              <span className="flex items-center text-xs text-green-600 space-x-1">
                <CheckCircle size={13} />
                <span>已保存</span>
              </span>
            )}
            {saveStatus === 'error' && (
              <span className="flex items-center text-xs text-red-500 space-x-1" title={errorMsg}>
                <AlertCircle size={13} />
                <span>保存失败</span>
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={!selectedPath || saveStatus === 'saving'}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <Save size={13} />
              <span>保存</span>
            </button>
          </div>
        </div>

        {/* Editor or placeholder */}
        <div className="flex-1 overflow-hidden bg-white">
          {fileLoading ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              <Loader2 size={20} className="animate-spin mr-2" />
              加载中…
            </div>
          ) : selectedPath ? (
            viewMode === 'split' ? (
              /* Split view: left raw editor, right preview */
              <div className="flex h-full divide-x divide-gray-200">
                <div className="flex-1 flex flex-col min-w-0">
                  <div className="px-3 py-1.5 border-b border-gray-100 bg-gray-50">
                    <span className="text-xs text-gray-400 font-medium">Markdown 源码</span>
                  </div>
                  <textarea
                    className="flex-1 w-full resize-none font-mono text-sm leading-relaxed p-4 outline-none bg-white text-gray-800"
                    value={editorContent}
                    onChange={(e) => setEditorContent(e.target.value)}
                    spellCheck={false}
                  />
                </div>
                <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                  <div className="px-3 py-1.5 border-b border-gray-100 bg-gray-50">
                    <span className="text-xs text-gray-400 font-medium">预览</span>
                  </div>
                  <div className="flex-1 overflow-y-auto px-6 py-4 prose prose-sm max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{editorContent}</ReactMarkdown>
                  </div>
                </div>
              </div>
            ) : (
              /* WYSIWYG mode: Milkdown */
              <div className="h-full px-6 py-4 overflow-y-auto">
                <MarkdownEditor
                  key={`${selectedPath}-${milkdownKey}`}
                  editorKey={`${selectedPath}-${milkdownKey}`}
                  content={editorContent}
                  onChange={setEditorContent}
                />
              </div>
            )
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <span className="text-4xl mb-3">📄</span>
              <p className="text-sm">从左侧选择一个 .md 文件开始编辑</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
