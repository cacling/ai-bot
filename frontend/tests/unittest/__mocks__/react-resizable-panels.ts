import React from 'react';

const FILTERED_PROPS = new Set(['defaultSize', 'minSize', 'maxSize', 'collapsedSize', 'collapsible', 'order']);

const mock = (tag: string) => React.forwardRef(function Mock(props: any, ref: any) {
  const nextProps = { ...props, ref };
  for (const key of FILTERED_PROPS) {
    delete nextProps[key];
  }
  return React.createElement(tag, nextProps, props.children);
});
export const Group = mock('div');
export const Panel = mock('div');
export const Separator = mock('div');
export const PanelGroup = mock('div');
export const PanelResizeHandle = mock('div');
