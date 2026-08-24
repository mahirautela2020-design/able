import { readFileSync } from "fs";
import path from "path";
import type { Page } from "playwright-core";
import { takeScreenshot } from "./browser";
import {
  extractFindings,
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
  screenshot: Buffer;
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
  const screenshot = await takeScreenshot(page);

  const bboxes = await resolveBboxes(page, axeResult);

  const findings = extractFindings(axeResult, axeVersion, bboxes);

  return { findings, axeVersion, screenshot };
}

async function resolveBboxes(
  page: Page,
  result: AxeResult
): Promise<Map<string, { x: number; y: number; width: number; height: number }>> {
  const allTargets = [
    ...result.violations,
    ...result.incomplete,
  ].flatMap((v) =>
    v.nodes.map((n) => ({ ruleId: v.id, target: n.target }))
  );

  const bboxMap = new Map<
    string,
    { x: number; y: number; width: number; height: number }
  >();

  const targets = allTargets.map((t) => ({
    selector: t.target.join(" "),
    key: `${t.ruleId}-${t.target.join(" ")}`,
  }));

  await page.evaluate(({ targets }) => {
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
          window.__ableBboxes[key] = {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          };
        }
      } catch {
        window.__ableBboxes[key] = null;
      }
    }
  }, { targets });

  const resolved = await page.evaluate(
    () => window.__ableBboxes || {}
  );

  for (const [key, val] of Object.entries(resolved)) {
    if (val) bboxMap.set(key, val as { x: number; y: number; width: number; height: number });
  }

  return bboxMap;
}
