import React, { useEffect, useRef } from 'react';
import { Editor, rootCtx, defaultValueCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react';

interface InnerProps {
  content: string;
  onChange: (value: string) => void;
}

function MilkdownEditorInner({ content, onChange }: InnerProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEditor((root) =>
    Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, content);
        ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
          onChangeRef.current(markdown);
        });
      })
      .use(commonmark)
      .use(listener),
  );

  return <Milkdown />;
}

interface MarkdownEditorProps {
  content: string;
  onChange: (value: string) => void;
  /** Key the component to force remount when switching files */
  editorKey: string;
}

export function MarkdownEditor({ content, onChange, editorKey }: MarkdownEditorProps) {
  return (
    <MilkdownProvider>
      <div key={editorKey} className="milkdown-wrapper h-full overflow-y-auto">
        <MilkdownEditorInner content={content} onChange={onChange} />
      </div>
    </MilkdownProvider>
  );
}
