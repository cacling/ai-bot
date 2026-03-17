import React, { useState } from 'react';
import { ChevronRight, ChevronDown, FileText, Folder, FolderOpen } from 'lucide-react';

export interface FileNode {
  name: string;
  type: 'file' | 'dir';
  path: string;
  children?: FileNode[];
}

interface FileTreeNodeProps {
  node: FileNode;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  depth: number;
}

function FileTreeNode({ node, selectedPath, onSelect, depth }: FileTreeNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const isSelected = node.path === selectedPath;
  const indent = depth * 12;

  if (node.type === 'dir') {
    return (
      <div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center w-full text-left px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded transition-colors"
          style={{ paddingLeft: `${8 + indent}px` }}
        >
          <span className="mr-1 text-gray-400">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
          <span className="mr-1.5 text-amber-500">
            {expanded ? <FolderOpen size={14} /> : <Folder size={14} />}
          </span>
          <span className="font-medium truncate">{node.name}</span>
        </button>
        {expanded && node.children && (
          <div>
            {node.children.map((child) => (
              <FileTreeNode
                key={child.path}
                node={child}
                selectedPath={selectedPath}
                onSelect={onSelect}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => onSelect(node.path)}
      className={`flex items-center w-full text-left px-2 py-1 text-sm rounded transition-colors ${
        isSelected
          ? 'bg-blue-50 text-blue-700 font-medium'
          : 'text-gray-700 hover:bg-gray-100'
      }`}
      style={{ paddingLeft: `${8 + indent}px` }}
    >
      <span className={`mr-1.5 ${isSelected ? 'text-blue-500' : 'text-gray-400'}`}>
        <FileText size={14} />
      </span>
      <span className="truncate">{node.name}</span>
    </button>
  );
}

interface FileTreeProps {
  nodes: FileNode[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
  loading: boolean;
}

export function FileTree({ nodes, selectedPath, onSelect, loading }: FileTreeProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
        加载中…
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
        未找到 .md 文件
      </div>
    );
  }

  return (
    <div className="overflow-y-auto">
      {nodes.map((node) => (
        <FileTreeNode
          key={node.path}
          node={node}
          selectedPath={selectedPath}
          onSelect={onSelect}
          depth={0}
        />
      ))}
    </div>
  );
}
