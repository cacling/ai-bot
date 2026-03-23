/**
 * translate-lang.test.ts — Pure logic branch tests only.
 *
 * LLM-dependent paths (translateText, translateMermaid with en) are excluded.
 * Only the synchronous early-return branch is tested.
 */

import { describe, test, expect } from 'bun:test';
import { translateMermaid } from '../../../src/services/translate-lang';

describe('translateMermaid', () => {
  test('returns original mermaid for targetLang zh (no LLM call)', async () => {
    const mermaid = `stateDiagram-v2\n  [*] --> 接入`;
    const result = await translateMermaid(mermaid, 'zh');
    expect(result).toBe(mermaid);
  });

  test('returns original for zh regardless of content', async () => {
    const mermaid = `flowchart TD\n  A --> B`;
    const result = await translateMermaid(mermaid, 'zh');
    expect(result).toBe(mermaid);
  });
});
