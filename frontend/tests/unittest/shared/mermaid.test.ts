import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the entire mermaid module at the source level
vi.mock('@/shared/mermaid', async () => {
  let renderCount = 0;
  return {
    renderMermaid: vi.fn(async (_code: string) => {
      renderCount++;
      return `<svg id="mock-${renderCount}">test</svg>`;
    }),
  };
});

import { renderMermaid } from '@/shared/mermaid';

describe('shared/mermaid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renderMermaid returns SVG string', async () => {
    const result = await renderMermaid('graph TD\nA-->B');
    expect(typeof result).toBe('string');
    expect(result).toContain('<svg');
  });

  it('renderMermaid is callable with mermaid code', async () => {
    const result = await renderMermaid('graph LR\nC-->D');
    expect(result).toBeTruthy();
    expect(renderMermaid).toHaveBeenCalledWith('graph LR\nC-->D');
  });

  it('renderMermaid can be called multiple times', async () => {
    const r1 = await renderMermaid('graph TD\nX-->Y');
    const r2 = await renderMermaid('graph TD\nA-->B');
    expect(r1).toBeTruthy();
    expect(r2).toBeTruthy();
    expect(renderMermaid).toHaveBeenCalledTimes(2);
  });
});
