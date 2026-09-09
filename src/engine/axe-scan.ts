import { readFileSync } from "fs";
import path from "path";
import type { Page } from "playwright-core";
import { takeScreenshot, type ScreenshotResult } from "./browser";
import {
  extractFindings,
  BBOX_NODE_LIMIT,
  type AxeResult,
  type AxeViolation,
  type AxeNode,
  type Finding,
} from "./finding-mapping";

export type { AxeResult, AxeViolation, AxeNode, Finding };
export { extractFindings, extractWcagLevel, extractPrinciple } from "./finding-mapping";

declare global {
  interface Window {
    axe: {
      run: (options: Record<string, unknown>) => Promise<AxeResult>;
    };
    __ableBboxes: Record<string, { x: number; y: number; width: number; height: number } | null>;
  }
}

export interface ScanResult {
  findings: Finding[];
  axeVersion: string;
  screenshot: ScreenshotResult;
}

// The `automated` module (src/lib/audit-modules.ts) advertises coverage of
// every non-manual SC in the registry, including AAA -- the *aaa tags must
// stay here or that promise silently doesn't hold.
export const AXE_RUN_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag2aaa",
  "wcag21a",
  "wcag21aa",
  "wcag21aaa",
  "wcag22aa",
  "wcag22aaa",
  "best-practice",
];

export async function runAxe(page: Page): Promise<ScanResult> {
  // Resolve axe-core from the filesystem directly. Next.js/Turbopack mangles
  // require.resolve() output inside server bundles (returns the module spec
  // like "…\axe.js [app-route] (ecmascript)" instead of a real path).
  const axePath = path.join(process.cwd(), "node_modules", "axe-core", "axe.js");
  const axeSource = readFileSync(axePath, "utf-8");
  await page.addScriptTag({ content: axeSource });

  const axeResult = await Promise.race([
    page.evaluate(
      (tags) =>
        window.axe.run({
          runOnly: {
            type: "tag",
            values: tags,
          },
        }) as Promise<AxeResult>,
      AXE_RUN_TAGS,
    ),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("AXE_TIMEOUT")), 15_000)
    ),
  ]);

  const axeVersion = axeResult.testEngine?.version || "unknown";
  // Must run before anything that scrolls or resizes the page: resolveBboxes
  // records document coordinates that are only comparable to this capture.
  const screenshot = await takeScreenshot(page);

  const bboxes = await resolveBboxes(page, axeResult);

  const findings = extractFindings(axeResult, axeVersion, bboxes);

  return { findings, axeVersion, screenshot };
}

async function resolveBboxes(
  page: Page,
  result: AxeResult
): Promise<Map<string, { x: number; y: number; width: number; height: number }>> {
  // extractFindings only ever emits the first BBOX_NODE_LIMIT nodes per rule
  // (finding-mapping.ts), so resolving every node was pure waste — 601
  // selector lookups on a Wikipedia article to fill 44 findings. Slicing here
  // keeps the two in step; raising the limit there means raising it here.
  const allTargets = [
    ...result.violations,
    ...result.incomplete,
  ].flatMap((v) =>
    v.nodes.slice(0, BBOX_NODE_LIMIT).map((n) => ({ ruleId: v.id, target: n.target }))
  );

  const bboxMap = new Map<
    string,
    { x: number; y: number; width: number; height: number }
  >();

  const targets = allTargets.map((t) => ({
    selector: t.target.join(" "),
    key: `${t.ruleId}-${t.target.join(" ")}`,
  }));

  const resolved = await page.evaluate(({ targets }) => {
    window.__ableBboxes = {};
    for (const { selector, key } of targets) {
      try {
        const parts = selector.split(" >>> ");
        let el: Element | null = null;
        if (parts.length > 1) {
          let root: Document | ShadowRoot | Element = document;
          for (let i = 0; i < parts.length; i++) {
            const part = parts[i].trim();
            if (root instanceof Document || root instanceof ShadowRoot) {
              el = root.querySelector(part);
            } else {
              el = (root as Element).shadowRoot?.querySelector(part) || null;
            }
            if (!el) break;
            if (i < parts.length - 1) {
              root = (el as Element).shadowRoot || document;
            }
          }
        } else {
          el = document.querySelector(selector);
        }
        if (el) {
          const rect = el.getBoundingClientRect();
          // getBoundingClientRect is VIEWPORT-relative; the screenshot these
          // crops are cut from is document-relative. They only agree while
          // scroll is at the origin, which is true today but is an invisible
          // invariant — adding the scroll offset makes the coordinate space
          // explicit and survives anything that scrolls before this runs.
          window.__ableBboxes[key] = {
            x: rect.x + window.scrollX,
            y: rect.y + window.scrollY,
            width: rect.width,
            height: rect.height,
          };
        }
      } catch {
        window.__ableBboxes[key] = null;
      }
    }
    // Returning the map directly saves a second CDP round-trip that existed
    // only to read this same global back out.
    return window.__ableBboxes;
  }, { targets });

  for (const [key, val] of Object.entries(resolved ?? {})) {
    if (val) bboxMap.set(key, val as { x: number; y: number; width: number; height: number });
  }

  return bboxMap;
}
