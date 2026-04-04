/**
 * SkillDiagramWorkbench — Mermaid 源码编辑器（纯编辑面板）
 *
 * 预览 + 诊断面板已提取到 SkillDiagramPanel；
 * Preview API 已提取到 useWorkbenchPreview hook。
 */
import { useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { GitBranch, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { findCustomerGuidanceDiagramSection } from '../../shared/skillMarkdown';

const DEFAULT_TEMPLATE = `stateDiagram-v2
    [*] --> 接收请求: 用户发起咨询
    接收请求 --> 识别诉求: 判断用户问题
    state 是否可直接处理 <<choice>>
    识别诉求 --> 是否可直接处理
    是否可直接处理 --> 正常处理: 可以直接处理
    是否可直接处理 --> 转人工: 需要人工协助
    正常处理 --> [*]: 已完成
    转人工 --> [*]: 结束`;

interface SkillDiagramWorkbenchProps {
  skillMd: string;
  readOnly?: boolean;
  onChangeMermaid: (mermaid: string) => void;
}

export function SkillDiagramWorkbench({
  skillMd,
  readOnly = false,
  onChangeMermaid,
}: SkillDiagramWorkbenchProps) {
  const section = useMemo(() => findCustomerGuidanceDiagramSection(skillMd), [skillMd]);
  const editorValue = section.mermaid ?? '';

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="h-9 px-3 border-b border-border flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <GitBranch className="w-4 h-4 text-primary" />
          <span className="text-xs font-medium truncate">状态图源码</span>
          {readOnly && <Badge variant="outline" className="text-[10px]">只读</Badge>}
          {!section.hasSection && <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">缺少章节</Badge>}
          {section.hasSection && !section.hasMermaidBlock && <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">缺少 Mermaid 代码块</Badge>}
        </div>
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={() => onChangeMermaid(DEFAULT_TEMPLATE)}
          disabled={readOnly}
        >
          <Sparkles className="w-3 h-3" /> {editorValue.trim() ? '重置骨架' : '创建骨架'}
        </Button>
      </div>
      <div className="flex-1 overflow-hidden">
        <CodeMirror
          value={editorValue}
          height="100%"
          theme={oneDark}
          editable={!readOnly}
          basicSetup={{ lineNumbers: true, foldGutter: true }}
          onChange={(value) => !readOnly && onChangeMermaid(value)}
          style={{ fontSize: '13px', height: '100%' }}
        />
      </div>
    </div>
  );
}
