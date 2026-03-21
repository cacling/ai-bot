import React from 'react';
export function useRender(props: any) {
  return function renderElement(extraProps?: any) {
    return React.createElement('span', { ...props, ...extraProps }, props?.children);
  };
}
