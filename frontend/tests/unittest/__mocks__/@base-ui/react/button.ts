import React from 'react';
export const Button = React.forwardRef(function MockButton(props: any, ref: any) {
  const { children, ...rest } = props;
  return React.createElement('button', { ...rest, ref }, children);
});
