import React from 'react';
const mock = (tag: string) => React.forwardRef(function Mock(props: any, ref: any) {
  return React.createElement(tag, { ...props, ref }, props.children);
});

// Select needs many sub-components to avoid "undefined" errors in select.tsx
export const Select = Object.assign(mock('div'), {
  Root: mock('div'),
  Trigger: mock('button'),
  Value: mock('span'),
  Icon: mock('span'),
  Popup: mock('div'),
  Positioner: mock('div'),
  Portal: ({ children }: any) => children,
  Item: mock('div'),
  ItemText: mock('span'),
  ItemIndicator: mock('span'),
  Group: mock('div'),
  GroupLabel: mock('div'),
  Arrow: mock('div'),
  ScrollUpArrow: mock('div'),
  ScrollDownArrow: mock('div'),
  Backdrop: mock('div'),
  Separator: mock('hr'),
  List: mock('div'),
});
