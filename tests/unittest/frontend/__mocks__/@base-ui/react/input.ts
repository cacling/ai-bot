import React from 'react';
export const Input = React.forwardRef(function MockInput(props: any, ref: any) {
  return React.createElement('input', { ...props, ref });
});
