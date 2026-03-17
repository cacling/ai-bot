import mermaid from 'mermaid';

let initialized = false;
let renderCount = 0;

function ensureInit() {
  if (initialized) return;
  mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'strict',
    suppressErrorRendering: true,
  });
  initialized = true;
}

export async function renderMermaid(code: string): Promise<string> {
  ensureInit();
  const id = `mermaid-render-${renderCount++}`;
  const { svg } = await mermaid.render(id, code);
  return svg;
}
