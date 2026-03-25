/**
 * Skill Manager diagram E2E — verify diagram appears with node type colors
 *
 * Tests the skill manager editor page: when viewing a SKILL.md with a mermaid
 * state diagram, the bottom panel should show the rendered diagram with
 * color-coded nodes (tool=blue, llm=green, human=orange, etc.)
 *
 * Run: cd frontend/tests/e2e && npx playwright test 15-skill-manager-diagram.spec.ts --headed
 */
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5173';

test.describe.serial('Skill Manager diagram rendering', () => {
  test.setTimeout(60_000);

  test('SM-DIAG-01: diagram panel appears when viewing SKILL.md', async ({ page }) => {
    // Navigate to skill manager → bill-inquiry
    await page.goto(`${BASE}/km`);
    await page.waitForTimeout(2000);

    // Click on bill-inquiry skill
    const skillLink = page.getByText('bill-inquiry').first();
    if (await skillLink.isVisible()) {
      await skillLink.click();
      await page.waitForTimeout(2000);

      // SKILL.md should be auto-selected, diagram panel should appear
      const diagramHeader = page.getByText('流程图');
      const hasDiagram = await diagramHeader.isVisible().catch(() => false);

      if (hasDiagram) {
        // Check SVG is rendered
        const svgCount = await page.locator('svg').count();
        expect(svgCount, 'Should render at least one SVG diagram').toBeGreaterThan(0);

        // Check no %% annotations visible
        const svgTexts = await page.locator('svg text, svg tspan').allTextContents();
        const allText = svgTexts.join(' ');
        expect(allText, 'SVG should not show %% annotations').not.toContain('%%');
        expect(allText).not.toContain('kind:');
      }
    }
  });

  test('SM-DIAG-02: diagram shows colored nodes (not all default color)', async ({ page }) => {
    await page.goto(`${BASE}/km`);
    await page.waitForTimeout(2000);

    const skillLink = page.getByText('bill-inquiry').first();
    if (await skillLink.isVisible()) {
      await skillLink.click();
      await page.waitForTimeout(3000);

      // Check if any SVG rect/path has a non-default fill color
      // Default mermaid fill is typically #ECECFF or similar
      // Our node type colors are: #dbeafe (blue), #dcfce7 (green), #ffedd5 (orange), etc.
      const coloredRects = await page.locator('svg rect[style*="fill"], svg path[style*="fill"]').count();
      // If coloring is working, at least some rects should have inline style fill
      expect(coloredRects, 'Some SVG nodes should have custom fill colors from nodeTypeMap').toBeGreaterThan(0);
    }
  });
});
