import React from 'react';
const mock = (tag: string) => React.forwardRef(function Mock(props: any, ref: any) {
  return React.createElement(tag, { ...props, ref }, props.children);
});
export const Group = mock('div');
export const Panel = mock('div');
export const Separator = mock('div');
export const PanelGroup = mock('div');
export const PanelResizeHandle = mock('div');
