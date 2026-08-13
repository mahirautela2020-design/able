/**
 * Real multi-viewport reflow scanning — WCAG 1.4.10 (Reflow).
 *
 * axe-core has no rule for this: reflow/resize are marked manual-test-only
 * in axe-core's own WCAG mapping. The check here is the standard geometric
 * heuristic (also used by browser devtools / Lighthouse-adjacent tools):
 * after resizing to a narrow viewport, does the document require
 * horizontal scrolling to read its content?
 *
 * True 1.4.4 (Resize Text, 200% browser zoom) is a different mechanism —
 * CSS zoom emulation, not just a narrower viewport — and is not
 * implemented here; it stays a documented manual-test SC for now.
 */
import type { Page } from "playwright-core";
import type { Finding } from "./axe-scan";

export interface ViewportSpec {
  name: string;
  width: number;
  height: number;
}

export const RESPONSIVE_VIEWPORTS: ViewportSpec[] = [
  { name: "mobile", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
];

// Small tolerance for scrollbar width / sub-pixel layout rounding.
const OVERFLOW_TOLERANCE_PX = 5;

/** Resize to `viewport`, let layout settle, and flag horizontal overflow. */
export async function scanReflow(page: Page, viewport: ViewportSpec): Promise<Finding[]> {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  // A brief settle so late layout (fonts, reflow-triggering JS) has run.
  await page.waitForTimeout(150);

  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

  const overflow = scrollWidth - clientWidth;
  if (overflow <= OVERFLOW_TOLERANCE_PX) return [];

  return [
    {
      bucket: "automated",
      rule_id: "reflow-horizontal-scroll",
      rule_title: `Page requires horizontal scrolling at ${viewport.width}px width`,
      wcag_criteria: ["wcag1410"],
      wcag_criterion: "1.4.10",
      wcag_level: "AA",
      principle: "Perceivable",
      severity: overflow > 100 ? "serious" : "moderate",
      confidence: 0.9,
      source_engines: ["responsive-scan"],
      selector: "html",
      element_html: "",
      failure_summary: `Content overflows horizontally by ~${Math.round(overflow)}px at a ${viewport.width}px viewport (${viewport.name}). WCAG 1.4.10 requires content to reflow to a single column without horizontal scrolling at narrow widths.`,
      additional_instances: 0,
      bbox: null,
      evidence: {
        viewport: { name: viewport.name, width: viewport.width, height: viewport.height },
        scrollWidth,
        clientWidth,
        overflow,
      },
      engine_version: null,
    },
  ];
}

/** Check every configured breakpoint and concatenate findings. */
export async function scanResponsive(
  page: Page,
  viewports: ViewportSpec[] = RESPONSIVE_VIEWPORTS
): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const viewport of viewports) {
    findings.push(...(await scanReflow(page, viewport)));
  }
  return findings;
}
