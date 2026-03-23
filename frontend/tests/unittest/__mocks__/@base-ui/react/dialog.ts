import React from 'react';
const mock = (tag: string) => React.forwardRef(function Mock(props: any, ref: any) {
  return React.createElement(tag, { ...props, ref }, props.children);
});
export const Dialog = Object.assign(mock('div'), {
  Root: mock('div'), Trigger: mock('button'), Portal: mock('div'),
  Popup: mock('div'), Title: mock('h2'), Description: mock('p'),
  Close: mock('button'), Backdrop: mock('div'),
});
