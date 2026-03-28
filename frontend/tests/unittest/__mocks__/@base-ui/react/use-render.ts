import React from 'react';

export function useRender({ defaultTagName = 'span', props, render }: any) {
  if (render) {
    if (React.isValidElement(render)) {
      return React.cloneElement(render, props);
    }
    if (typeof render === 'function') {
      return render(props);
    }
  }

  return React.createElement(defaultTagName, props, props?.children);
}
