import React from 'react';

const FILTERED_PROPS = new Set(['onCheckedChange', 'checked', 'indeterminate']);

const mock = (tag: string) => React.forwardRef(function Mock(props: any, ref: any) {
  const nextProps = { ...props, ref };
  for (const key of FILTERED_PROPS) {
    delete nextProps[key];
  }
  return React.createElement(tag, nextProps, props.children);
});
const comp = Object.assign(mock('div'), {
  Root: mock('div'), Trigger: mock('button'), Indicator: mock('span'),
  Item: mock('div'), Label: mock('label'), Group: mock('div'),
});
export const Checkbox = comp;
export const Radio = comp;
export const RadioGroup = comp;
export const Separator = mock('hr');
export const Tabs = Object.assign(mock('div'), {
  Root: mock('div'), List: mock('div'), Tab: mock('button'),
  Panel: mock('div'), Indicator: mock('span'),
});
