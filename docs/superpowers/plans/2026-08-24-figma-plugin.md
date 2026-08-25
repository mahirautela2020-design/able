# ScanA11y Figma Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Figma plugin that audits selected frames or the current page against a
Figma-appropriate subset of the WCAG 2.2 matrix, lets the user jump to any finding on
canvas, and writes a full 16:9-per-finding report (with per-element screenshots and
recommendations) into a new page in the same file.

**Architecture:** Two JS contexts communicating over `postMessage`, mirroring the Chrome
extension's content-script/side-panel split: `code.ts` (main thread, has `figma.*` scene-graph
access, no DOM) runs pure inspector functions against the real node tree and writes report
frames; a Vite-built React UI (`figma-plugin/ui/`) renders the compliance matrix and findings
list, reusing the site's real `Accordion`/`Badge`/`Card` components and
`computeComplianceMatrix`/`wcag-registry` via the same `@` alias pattern the extension uses.

**Tech Stack:** TypeScript, `@figma/plugin-typings`, Vite (`vite-plugin-singlefile` for the
UI — Figma loads plugin UI as one self-contained HTML string, so all JS/CSS must be inlined),
React 19, existing shadcn components, vitest for the pure inspector logic.

Full design context: `docs/superpowers/specs/2026-08-24-figma-plugin-design.md`.

---

## Task 1: Scaffold the project — deps, manifest, tsconfig, build configs

**Files:**
- Modify: `package.json` (add devDependencies + `build:figma-plugin` script)
- Modify: `tsconfig.json:2` (add `figma-plugin` to `exclude`)
- Create: `figma-plugin/manifest.json`
- Create: `figma-plugin/tsconfig.json`
- Create: `figma-plugin/vite.config.ts` (builds the UI)
- Create: `figma-plugin/vite.code.config.ts` (builds `code.ts`)
- Create: `figma-plugin/.gitignore`

- [ ] **Step 1: Install the two new dev dependencies**

Run: `npm install --save-dev @figma/plugin-typings vite-plugin-singlefile`

Expected: both added to `package.json`'s `devDependencies`; `npm ls @figma/plugin-typings vite-plugin-singlefile` shows both resolved with no errors.

- [ ] **Step 2: Add the root exclude entry**

In `tsconfig.json`, change:
```json
  "exclude": ["node_modules", "chrome-extension"],
```
to:
```json
  "exclude": ["node_modules", "chrome-extension", "figma-plugin"],
```
(Figma plugin code gets its own `tsconfig.json` in Step 4 — same reasoning as `chrome-extension`: `chrome.*`/`figma.*` globals shouldn't pollute the main app's type-checking scope.)

- [ ] **Step 3: Write `figma-plugin/manifest.json`**

```json
{
  "name": "ScanA11y — Accessibility Auditor",
  "id": "scana11y-figma-plugin-dev",
  "api": "1.0.0",
  "main": "dist/code.js",
  "ui": "dist/ui.html",
  "editorType": ["figma"],
  "documentAccess": "dynamic-page",
  "networkAccess": {
    "allowedDomains": []
  }
}
```

`"id"` is a placeholder for local/unpublished use — Figma assigns the real id if/when this
is published via the developer dashboard; update it then. `networkAccess.allowedDomains: []`
denies all outbound fetch/XHR from the plugin, enforcing the no-server-calls requirement at
the manifest level. **Before this step is considered done, verify `networkAccess`'s exact
current schema against Figma's own plugin manifest documentation** (this project has no
bundled Figma docs to check against, unlike the Next.js docs check `AGENTS.md` requires for
this repo) — the shape above matches the schema at spec-writing time, but confirm it hasn't
changed before relying on it as a real security boundary.

- [ ] **Step 4: Write `figma-plugin/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["ES2017", "DOM"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["@figma/plugin-typings"],
    "paths": {
      "@/*": ["../src/*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx"]
}
```

- [ ] **Step 5: Write `figma-plugin/vite.config.ts`** (builds the UI into one self-contained HTML file)

```ts
import { defineConfig } from "vite";
import path from "path";
import { viteSingleFile } from "vite-plugin-singlefile";

// Figma loads plugin UI from a single opaque HTML string (figma.showUI(__html__)),
// not from a folder that can resolve separate asset requests -- unlike the Chrome
// extension's side panel, everything (JS + CSS) must be inlined into one file.
// vite-plugin-singlefile does exactly that.
export default defineConfig({
  root: path.resolve(__dirname, "ui"),
  base: "./",
  publicDir: false,
  plugins: [viteSingleFile()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "../src") },
  },
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: false,
    cssCodeSplit: false,
    rollupOptions: {
      input: path.resolve(__dirname, "ui/index.html"),
    },
  },
});
```

- [ ] **Step 6: Write `figma-plugin/vite.code.config.ts`** (builds `code.ts`, the main-thread plugin entry)

```ts
import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "../src") },
  },
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: false,
    lib: {
      entry: path.resolve(__dirname, "code.ts"),
      formats: ["iife"],
      name: "ScanA11yFigmaPlugin",
      fileName: () => "code.js",
    },
  },
});
```

- [ ] **Step 7: Write `figma-plugin/.gitignore`**

```
dist/
```

- [ ] **Step 8: Add the root npm script**

In `package.json`'s `"scripts"`, add:
```json
    "build:figma-plugin": "vite build --config figma-plugin/vite.config.ts && vite build --config figma-plugin/vite.code.config.ts"
```

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.json figma-plugin/manifest.json figma-plugin/tsconfig.json figma-plugin/vite.config.ts figma-plugin/vite.code.config.ts figma-plugin/.gitignore
git commit -m "Scaffold the Figma plugin project (manifest, tsconfig, Vite build configs)"
```

---

## Task 2: Shared types + Figma node/color helpers

**Files:**
- Create: `figma-plugin/src/types.ts`
- Create: `figma-plugin/src/node-helpers.ts`
- Test: `tests/figma-plugin-node-helpers.test.ts`

`figma-plugin/src/*` holds pure, framework-free logic with **no** `figma.*` global
references, so it can be unit-tested with plain mock objects exactly like `src/lib/contrast.ts`
already is. `code.ts` (Task 7) passes real Figma `SceneNode`s into these functions via a
structural cast — see Task 7.

- [ ] **Step 1: Write `figma-plugin/src/types.ts`**

```ts
// A structural subset of Figma's SceneNode -- deliberately NOT importing
// @figma/plugin-typings here, so this whole directory (and its tests) can
// run outside a Figma runtime. Real SceneNode objects satisfy this
// interface structurally; code.ts passes them straight through.
export interface FigmaColor {
  r: number;
  g: number;
  b: number;
}

export interface FigmaFillLike {
  type: string;
  visible?: boolean;
  color?: FigmaColor;
}

export interface FigmaNodeLike {
  id: string;
  name: string;
  type: string;
  width: number;
  height: number;
  visible?: boolean;
  fills?: FigmaFillLike[] | symbol; // Figma uses a Symbol to represent "mixed" fills
  characters?: string; // TEXT nodes only
  textAutoResize?: string; // TEXT nodes only: "NONE" | "WIDTH_AND_HEIGHT" | "HEIGHT" | "TRUNCATE"
  fontSize?: number | symbol; // TEXT nodes only; Symbol when mixed across characters
  fontWeight?: number | symbol;
  parent?: FigmaNodeLike | null;
  children?: readonly FigmaNodeLike[];
}
```

- [ ] **Step 2: Write the failing tests for `node-helpers.ts`**

```ts
// tests/figma-plugin-node-helpers.test.ts
import { describe, expect, it } from "vitest";
import {
  collectNodes,
  figmaColorToHex,
  isLargeText,
  resolveBackgroundColor,
  resolveFillColor,
} from "../figma-plugin/src/node-helpers";
import type { FigmaNodeLike } from "../figma-plugin/src/types";

function node(overrides: Partial<FigmaNodeLike> & { id: string }): FigmaNodeLike {
  return {
    name: overrides.id,
    type: "FRAME",
    width: 100,
    height: 100,
    visible: true,
    ...overrides,
  };
}

describe("figmaColorToHex", () => {
  it("converts a 0-1 float RGB color to hex", () => {
    expect(figmaColorToHex({ r: 1, g: 1, b: 1 })).toBe("#ffffff");
    expect(figmaColorToHex({ r: 0, g: 0, b: 0 })).toBe("#000000");
    expect(figmaColorToHex({ r: 1, g: 0, b: 0 })).toBe("#ff0000");
  });
});

describe("resolveFillColor", () => {
  it("returns the first visible SOLID fill as hex", () => {
    const fills = [{ type: "SOLID", visible: true, color: { r: 0, g: 0, b: 0 } }];
    expect(resolveFillColor(fills)).toBe("#000000");
  });

  it("skips invisible fills", () => {
    const fills = [
      { type: "SOLID", visible: false, color: { r: 1, g: 0, b: 0 } },
      { type: "SOLID", visible: true, color: { r: 0, g: 1, b: 0 } },
    ];
    expect(resolveFillColor(fills)).toBe("#00ff00");
  });

  it("returns null for mixed fills (a Symbol)", () => {
    expect(resolveFillColor(Symbol("mixed"))).toBeNull();
  });

  it("returns null when there are no solid fills", () => {
    expect(resolveFillColor([{ type: "IMAGE", visible: true }])).toBeNull();
  });

  it("returns null for undefined fills", () => {
    expect(resolveFillColor(undefined)).toBeNull();
  });
});

describe("resolveBackgroundColor", () => {
  it("walks up the parent chain to find the nearest solid fill", () => {
    const grandparent = node({
      id: "gp",
      fills: [{ type: "SOLID", visible: true, color: { r: 0, g: 0, b: 1 } }],
    });
    const parent = node({ id: "p", parent: grandparent, fills: [] });
    const child = node({ id: "c", parent, fills: [] });
    expect(resolveBackgroundColor(child)).toBe("#0000ff");
  });

  it("defaults to white when no ancestor has a solid fill", () => {
    const parent = node({ id: "p", fills: [] });
    const child = node({ id: "c", parent, fills: [] });
    expect(resolveBackgroundColor(child)).toBe("#ffffff");
  });
});

describe("isLargeText", () => {
  it("treats 18px+ as large regardless of weight", () => {
    expect(isLargeText(18, 400)).toBe(true);
    expect(isLargeText(24, 400)).toBe(true);
  });

  it("treats 14px+ bold as large", () => {
    expect(isLargeText(14, 700)).toBe(true);
    expect(isLargeText(14, 400)).toBe(false);
  });

  it("treats anything smaller as not large", () => {
    expect(isLargeText(13, 700)).toBe(false);
  });

  it("returns false when fontSize is mixed (a Symbol)", () => {
    expect(isLargeText(Symbol("mixed"), 400)).toBe(false);
  });
});

describe("collectNodes", () => {
  it("flattens a tree depth-first", () => {
    const leaf1 = node({ id: "leaf1" });
    const leaf2 = node({ id: "leaf2" });
    const branch = node({ id: "branch", children: [leaf1, leaf2] });
    const root = node({ id: "root", children: [branch] });
    expect(collectNodes([root]).map((n) => n.id)).toEqual(["root", "branch", "leaf1", "leaf2"]);
  });

  it("handles multiple roots and nodes with no children", () => {
    const a = node({ id: "a" });
    const b = node({ id: "b" });
    expect(collectNodes([a, b]).map((n) => n.id)).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/figma-plugin-node-helpers.test.ts`
Expected: FAIL — `Cannot find module '../figma-plugin/src/node-helpers'`

- [ ] **Step 4: Write `figma-plugin/src/node-helpers.ts`**

```ts
import { rgbToHex } from "@/lib/contrast";
import type { FigmaColor, FigmaFillLike, FigmaNodeLike } from "./types";

export function figmaColorToHex(color: FigmaColor): string {
  return rgbToHex({ r: color.r * 255, g: color.g * 255, b: color.b * 255 });
}

/** First visible SOLID fill, as hex -- or null if there isn't one (mixed
 * fills, no fills, or only non-solid fills like IMAGE/GRADIENT). Returning
 * null (not a guessed default) lets callers decide whether "no evaluable
 * fill" means "skip this node" rather than silently reporting a false pass. */
export function resolveFillColor(fills: FigmaFillLike[] | symbol | undefined): string | null {
  if (!fills || typeof fills === "symbol") return null;
  for (const fill of fills) {
    if (fill.type === "SOLID" && fill.visible !== false && fill.color) {
      return figmaColorToHex(fill.color);
    }
  }
  return null;
}

/** Walks the parent chain looking for the nearest solid fill, same
 * "resolve effective background" approach the website/extension use for
 * DOM elements (src/lib/widget's resolveBg). Defaults to white -- Figma
 * frames commonly have no fill at all and inherit the canvas's white. */
export function resolveBackgroundColor(node: FigmaNodeLike): string {
  let current: FigmaNodeLike | null | undefined = node.parent;
  while (current) {
    const color = resolveFillColor(current.fills);
    if (color) return color;
    current = current.parent;
  }
  return "#ffffff";
}

/** WCAG's large-text threshold: 18px+ at any weight, or 14px+ bold. */
export function isLargeText(
  fontSize: number | symbol | undefined,
  fontWeight: number | symbol | undefined
): boolean {
  if (typeof fontSize !== "number") return false;
  const bold = typeof fontWeight === "number" && fontWeight >= 700;
  return fontSize >= 18 || (fontSize >= 14 && bold);
}

/** Flattens a node tree (depth-first, roots then children) into a flat list. */
export function collectNodes(roots: FigmaNodeLike[]): FigmaNodeLike[] {
  const out: FigmaNodeLike[] = [];
  const visit = (n: FigmaNodeLike) => {
    out.push(n);
    for (const child of n.children ?? []) visit(child);
  };
  for (const root of roots) visit(root);
  return out;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/figma-plugin-node-helpers.test.ts`
Expected: PASS (13 tests)

- [ ] **Step 6: Commit**

```bash
git add figma-plugin/src/types.ts figma-plugin/src/node-helpers.ts tests/figma-plugin-node-helpers.test.ts
git commit -m "Add Figma node/color helper functions with tests"
```

---

## Task 3: Contrast inspector (WCAG 1.4.3)

**Files:**
- Create: `figma-plugin/src/inspectors/contrast.ts`
- Test: `tests/figma-plugin-contrast-inspector.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/figma-plugin-contrast-inspector.test.ts
import { describe, expect, it } from "vitest";
import { checkTextContrast } from "../figma-plugin/src/inspectors/contrast";
import type { FigmaNodeLike } from "../figma-plugin/src/types";

function textNode(overrides: Partial<FigmaNodeLike> & { id: string }): FigmaNodeLike {
  return {
    name: overrides.id,
    type: "TEXT",
    width: 100,
    height: 20,
    visible: true,
    fontSize: 16,
    fontWeight: 400,
    ...overrides,
  };
}

describe("checkTextContrast", () => {
  it("flags white text on a white background", () => {
    const parent: FigmaNodeLike = {
      id: "parent",
      name: "parent",
      type: "FRAME",
      width: 200,
      height: 200,
      fills: [{ type: "SOLID", visible: true, color: { r: 1, g: 1, b: 1 } }],
    };
    const text = textNode({
      id: "t1",
      parent,
      fills: [{ type: "SOLID", visible: true, color: { r: 1, g: 1, b: 1 } }],
    });
    const findings = checkTextContrast([text]);
    expect(findings).toHaveLength(1);
    expect(findings[0].wcag_criterion).toBe("1.4.3");
    expect(findings[0].selector).toBe("t1");
  });

  it("does not flag black text on a white background", () => {
    const parent: FigmaNodeLike = {
      id: "parent",
      name: "parent",
      type: "FRAME",
      width: 200,
      height: 200,
      fills: [{ type: "SOLID", visible: true, color: { r: 1, g: 1, b: 1 } }],
    };
    const text = textNode({
      id: "t1",
      parent,
      fills: [{ type: "SOLID", visible: true, color: { r: 0, g: 0, b: 0 } }],
    });
    expect(checkTextContrast([text])).toHaveLength(0);
  });

  it("uses the large-text threshold for 18px+ text", () => {
    // #767676 on white is ~4.54:1 -- passes AA normal-text (4.5) and would
    // also pass large-text (3.0); use a ratio that only clears the large
    // threshold to prove the size branch is actually used.
    const parent: FigmaNodeLike = {
      id: "parent",
      name: "parent",
      type: "FRAME",
      width: 200,
      height: 200,
      fills: [{ type: "SOLID", visible: true, color: { r: 1, g: 1, b: 1 } }],
    };
    const largeText = textNode({
      id: "t1",
      parent,
      fontSize: 24,
      fills: [{ type: "SOLID", visible: true, color: { r: 0.6, g: 0.6, b: 0.6 } }],
    });
    const normalText = textNode({
      id: "t2",
      parent,
      fontSize: 16,
      fills: [{ type: "SOLID", visible: true, color: { r: 0.6, g: 0.6, b: 0.6 } }],
    });
    expect(checkTextContrast([largeText])).toHaveLength(0); // passes large-text 3:1
    expect(checkTextContrast([normalText])).toHaveLength(1); // fails normal-text 4.5:1
  });

  it("skips non-TEXT nodes", () => {
    const frame: FigmaNodeLike = { id: "f1", name: "f1", type: "FRAME", width: 10, height: 10 };
    expect(checkTextContrast([frame])).toHaveLength(0);
  });

  it("skips invisible text", () => {
    const text = textNode({ id: "t1", visible: false, fills: [{ type: "SOLID", visible: true, color: { r: 1, g: 1, b: 1 } }] });
    expect(checkTextContrast([text])).toHaveLength(0);
  });

  it("skips text with no evaluable fill (mixed or none)", () => {
    const text = textNode({ id: "t1", fills: Symbol("mixed") as unknown as undefined });
    expect(checkTextContrast([text])).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/figma-plugin-contrast-inspector.test.ts`
Expected: FAIL — `Cannot find module '../figma-plugin/src/inspectors/contrast'`

- [ ] **Step 3: Write `figma-plugin/src/inspectors/contrast.ts`**

```ts
import { contrastRatio, contrastVerdict } from "@/lib/contrast";
import { extractPrinciple, type Finding } from "@/engine/finding-mapping";
import { collectNodes, isLargeText, resolveBackgroundColor, resolveFillColor } from "../node-helpers";
import type { FigmaNodeLike } from "../types";

/** WCAG 1.4.3: text-vs-background contrast, using the exact same threshold
 * math (src/lib/contrast.ts) the website and Chrome extension use. Skips
 * text with no evaluable solid fill (mixed fills, gradients, or none) --
 * that's "can't evaluate", not a pass. */
export function checkTextContrast(roots: FigmaNodeLike[]): Finding[] {
  const findings: Finding[] = [];
  for (const node of collectNodes(roots)) {
    if (node.type !== "TEXT" || node.visible === false) continue;
    const fg = resolveFillColor(node.fills);
    if (!fg) continue;
    const bg = resolveBackgroundColor(node);
    const large = isLargeText(node.fontSize, node.fontWeight);
    const ratio = contrastRatio(fg, bg);
    const verdict = contrastVerdict(ratio, large);
    if (verdict.level !== "fail") continue;

    findings.push({
      bucket: "automated",
      rule_id: "figma-text-contrast",
      rule_title: "Text has insufficient contrast against its background",
      wcag_criteria: ["1.4.3"],
      wcag_criterion: "1.4.3",
      wcag_level: "AA",
      principle: extractPrinciple("1.4.3"),
      severity: verdict.ratio < verdict.requiredAA * 0.7 ? "serious" : "moderate",
      confidence: 0.9,
      source_engines: ["figma-plugin"],
      selector: node.id,
      element_html: node.name,
      failure_summary: `Contrast is ${verdict.ratio.toFixed(2)}:1 against a ${verdict.requiredAA}:1 minimum for ${large ? "large" : "normal-size"} text. Darken the text or lighten the background (or vice versa) until it clears ${verdict.requiredAA}:1.`,
      additional_instances: 0,
      bbox: null,
      evidence: { fg, bg, large, ratio: verdict.ratio },
      engine_version: null,
    });
  }
  return findings;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/figma-plugin-contrast-inspector.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add figma-plugin/src/inspectors/contrast.ts tests/figma-plugin-contrast-inspector.test.ts
git commit -m "Add Figma contrast inspector (WCAG 1.4.3) with tests"
```

---

## Task 4: Touch-target-size inspector (WCAG 2.5.8)

**Files:**
- Create: `figma-plugin/src/inspectors/touch-target.ts`
- Test: `tests/figma-plugin-touch-target-inspector.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/figma-plugin-touch-target-inspector.test.ts
import { describe, expect, it } from "vitest";
import { checkTouchTargetSize } from "../figma-plugin/src/inspectors/touch-target";
import type { FigmaNodeLike } from "../figma-plugin/src/types";

function instance(overrides: Partial<FigmaNodeLike> & { id: string; name: string }): FigmaNodeLike {
  return { type: "INSTANCE", width: 40, height: 40, visible: true, ...overrides };
}

describe("checkTouchTargetSize", () => {
  it("flags an undersized node with an interactive-looking name", () => {
    const node = instance({ id: "n1", name: "Icon Button", width: 16, height: 16 });
    const findings = checkTouchTargetSize([node]);
    expect(findings).toHaveLength(1);
    expect(findings[0].wcag_criterion).toBe("2.5.8");
    expect(findings[0].selector).toBe("n1");
  });

  it("does not flag a large enough interactive node", () => {
    const node = instance({ id: "n1", name: "Icon Button", width: 32, height: 32 });
    expect(checkTouchTargetSize([node])).toHaveLength(0);
  });

  it("does not flag a small node with a non-interactive name", () => {
    const node = instance({ id: "n1", name: "Avatar", width: 16, height: 16 });
    expect(checkTouchTargetSize([node])).toHaveLength(0);
  });

  it("does not flag non-component/instance/frame node types", () => {
    const node: FigmaNodeLike = { id: "n1", name: "Button", type: "TEXT", width: 10, height: 10, visible: true };
    expect(checkTouchTargetSize([node])).toHaveLength(0);
  });

  it("does not flag invisible nodes", () => {
    const node = instance({ id: "n1", name: "Button", width: 10, height: 10, visible: false });
    expect(checkTouchTargetSize([node])).toHaveLength(0);
  });

  it("matches common interactive-name variants case-insensitively", () => {
    const names = ["Primary Button", "close-icon-button", "Nav Link", "Tab Item", "toggle", "Checkbox"];
    for (const name of names) {
      const node = instance({ id: name, name, width: 10, height: 10 });
      expect(checkTouchTargetSize([node]), name).toHaveLength(1);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/figma-plugin-touch-target-inspector.test.ts`
Expected: FAIL — `Cannot find module '../figma-plugin/src/inspectors/touch-target'`

- [ ] **Step 3: Write `figma-plugin/src/inspectors/touch-target.ts`**

```ts
import { extractPrinciple, type Finding } from "@/engine/finding-mapping";
import { collectNodes } from "../node-helpers";
import type { FigmaNodeLike } from "../types";

const MIN_TOUCH_TARGET = 24;
const INTERACTIVE_NAME_PATTERN = /button|btn|icon.?button|link|tab(?!le)|toggle|switch|checkbox|radio|menu.?item/i;
const INTERACTIVE_NODE_TYPES = new Set(["INSTANCE", "COMPONENT", "FRAME"]);

/** WCAG 2.5.8: minimum 24x24px target size. There's no reliable way to
 * detect "this is interactive" from a static Figma file other than the
 * layer's name -- the same heuristic a human reviewer uses when scanning a
 * file. confidence is deliberately lower (0.6) than the contrast check's
 * 0.9 to reflect that. */
export function checkTouchTargetSize(roots: FigmaNodeLike[]): Finding[] {
  const findings: Finding[] = [];
  for (const node of collectNodes(roots)) {
    if (node.visible === false) continue;
    if (!INTERACTIVE_NODE_TYPES.has(node.type)) continue;
    if (!INTERACTIVE_NAME_PATTERN.test(node.name)) continue;

    const min = Math.min(node.width, node.height);
    if (min <= 0 || min >= MIN_TOUCH_TARGET) continue;

    findings.push({
      bucket: "automated",
      rule_id: "figma-touch-target-size",
      rule_title: "Interactive element is smaller than the minimum touch target size",
      wcag_criteria: ["2.5.8"],
      wcag_criterion: "2.5.8",
      wcag_level: "AA",
      principle: extractPrinciple("2.5.8"),
      severity: min < MIN_TOUCH_TARGET * 0.7 ? "serious" : "moderate",
      confidence: 0.6,
      source_engines: ["figma-plugin"],
      selector: node.id,
      element_html: node.name,
      failure_summary: `"${node.name}" is ${Math.round(node.width)}×${Math.round(node.height)}px; WCAG 2.5.8 requires at least 24×24px. Enlarge the hit area even if the visible icon stays smaller.`,
      additional_instances: 0,
      bbox: null,
      evidence: { width: node.width, height: node.height },
      engine_version: null,
    });
  }
  return findings;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/figma-plugin-touch-target-inspector.test.ts`
Expected: PASS (6 tests, the 6th parameterized over 6 names -- still one test)

- [ ] **Step 5: Commit**

```bash
git add figma-plugin/src/inspectors/touch-target.ts tests/figma-plugin-touch-target-inspector.test.ts
git commit -m "Add Figma touch-target-size inspector (WCAG 2.5.8) with tests"
```

---

## Task 5: Content & structure inspectors (WCAG 1.1.1, 1.4.4, 2.4.6)

**Files:**
- Create: `figma-plugin/src/inspectors/content-structure.ts`
- Test: `tests/figma-plugin-content-structure-inspector.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/figma-plugin-content-structure-inspector.test.ts
import { describe, expect, it } from "vitest";
import {
  checkFixedResizeText,
  checkHeadingStructure,
  checkMissingDescriptions,
} from "../figma-plugin/src/inspectors/content-structure";
import type { FigmaNodeLike } from "../figma-plugin/src/types";

describe("checkMissingDescriptions", () => {
  it("flags an image-fill node with Figma's default auto-generated name", () => {
    const node: FigmaNodeLike = {
      id: "n1",
      name: "Rectangle 4",
      type: "RECTANGLE",
      width: 100,
      height: 100,
      visible: true,
      fills: [{ type: "IMAGE", visible: true }],
    };
    const findings = checkMissingDescriptions([node]);
    expect(findings).toHaveLength(1);
    expect(findings[0].wcag_criterion).toBe("1.1.1");
  });

  it("does not flag a node with a real descriptive name", () => {
    const node: FigmaNodeLike = {
      id: "n1",
      name: "Hero photo of the team on launch day",
      type: "RECTANGLE",
      width: 100,
      height: 100,
      visible: true,
      fills: [{ type: "IMAGE", visible: true }],
    };
    expect(checkMissingDescriptions([node])).toHaveLength(0);
  });

  it("does not flag non-image-like nodes even with a default name", () => {
    const node: FigmaNodeLike = { id: "n1", name: "Frame 12", type: "FRAME", width: 100, height: 100, visible: true };
    expect(checkMissingDescriptions([node])).toHaveLength(0);
  });
});

describe("checkFixedResizeText", () => {
  it("flags a fixed-size text box with substantial content", () => {
    const node: FigmaNodeLike = {
      id: "n1",
      name: "Body copy",
      type: "TEXT",
      width: 200,
      height: 60,
      visible: true,
      textAutoResize: "NONE",
      characters: "This is a long paragraph of body copy that runs well past forty characters.",
    };
    const findings = checkFixedResizeText([node]);
    expect(findings).toHaveLength(1);
    expect(findings[0].wcag_criterion).toBe("1.4.4");
  });

  it("does not flag auto-resize text regardless of length", () => {
    const node: FigmaNodeLike = {
      id: "n1",
      name: "Body copy",
      type: "TEXT",
      width: 200,
      height: 60,
      visible: true,
      textAutoResize: "WIDTH_AND_HEIGHT",
      characters: "This is a long paragraph of body copy that runs well past forty characters.",
    };
    expect(checkFixedResizeText([node])).toHaveLength(0);
  });

  it("does not flag short fixed-size labels", () => {
    const node: FigmaNodeLike = {
      id: "n1",
      name: "Button label",
      type: "TEXT",
      width: 80,
      height: 20,
      visible: true,
      textAutoResize: "NONE",
      characters: "Submit",
    };
    expect(checkFixedResizeText([node])).toHaveLength(0);
  });
});

describe("checkHeadingStructure", () => {
  function heading(id: string, fontSize: number): FigmaNodeLike {
    return { id, name: "Heading", type: "TEXT", width: 200, height: 30, visible: true, fontSize };
  }

  it("flags headings that all share the same font size", () => {
    const findings = checkHeadingStructure([heading("h1", 16), heading("h2", 16), heading("h3", 16)]);
    expect(findings).toHaveLength(3);
    expect(findings.every((f) => f.wcag_criterion === "2.4.6")).toBe(true);
  });

  it("does not flag headings with a visible size hierarchy", () => {
    expect(checkHeadingStructure([heading("h1", 32), heading("h2", 18)])).toHaveLength(0);
  });

  it("does not flag a single heading (nothing to compare)", () => {
    expect(checkHeadingStructure([heading("h1", 16)])).toHaveLength(0);
  });

  it("ignores text nodes not named like a heading", () => {
    const body: FigmaNodeLike = { id: "b1", name: "Body copy", type: "TEXT", width: 200, height: 30, visible: true, fontSize: 16 };
    expect(checkHeadingStructure([body, body])).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/figma-plugin-content-structure-inspector.test.ts`
Expected: FAIL — `Cannot find module '../figma-plugin/src/inspectors/content-structure'`

- [ ] **Step 3: Write `figma-plugin/src/inspectors/content-structure.ts`**

```ts
import { extractPrinciple, type Finding } from "@/engine/finding-mapping";
import { collectNodes } from "../node-helpers";
import type { FigmaNodeLike } from "../types";

const DEFAULT_NAME_PATTERN = /^(rectangle|ellipse|vector|image|frame|group|component|instance|polygon|star|line)\s*\d*$/i;
const IMAGE_LIKE_TYPES = new Set(["RECTANGLE", "ELLIPSE", "VECTOR", "POLYGON", "STAR", "LINE", "BOOLEAN_OPERATION"]);

/** WCAG 1.1.1: a node carrying an image fill (or an inherently graphical
 * node type) that still has Figma's auto-generated default name is likely
 * missing the descriptive name developers use as alt text at handoff. */
export function checkMissingDescriptions(roots: FigmaNodeLike[]): Finding[] {
  const findings: Finding[] = [];
  for (const node of collectNodes(roots)) {
    if (node.visible === false) continue;
    const hasImageFill =
      Array.isArray(node.fills) && node.fills.some((f) => f.type === "IMAGE" && f.visible !== false);
    if (!hasImageFill && !IMAGE_LIKE_TYPES.has(node.type)) continue;
    if (!DEFAULT_NAME_PATTERN.test(node.name.trim())) continue;

    findings.push({
      bucket: "needs_review",
      rule_id: "figma-missing-description",
      rule_title: "Image/graphic still has Figma's default auto-generated name",
      wcag_criteria: ["1.1.1"],
      wcag_criterion: "1.1.1",
      wcag_level: "A",
      principle: extractPrinciple("1.1.1"),
      severity: "moderate",
      confidence: 0.5,
      source_engines: ["figma-plugin"],
      selector: node.id,
      element_html: node.name,
      failure_summary: `"${node.name}" has no descriptive layer name -- this is usually what developers use as alt text at handoff, and a default name like this means it likely hasn't been given one.`,
      additional_instances: 0,
      bbox: null,
      evidence: {},
      engine_version: null,
    });
  }
  return findings;
}

const MIN_FLAGGED_LENGTH = 40;

/** WCAG 1.4.4: a fixed-size (not auto-resize) text box holding a
 * substantial amount of text is at risk of clipping if the content is
 * translated or the user scales text up. Short fixed-size labels (buttons,
 * badges) are excluded via a length floor -- otherwise nearly every button
 * in the file would get flagged. */
export function checkFixedResizeText(roots: FigmaNodeLike[]): Finding[] {
  const findings: Finding[] = [];
  for (const node of collectNodes(roots)) {
    if (node.type !== "TEXT" || node.visible === false) continue;
    if (node.textAutoResize !== "NONE") continue;
    const text = node.characters ?? "";
    if (text.length < MIN_FLAGGED_LENGTH) continue;

    findings.push({
      bucket: "needs_review",
      rule_id: "figma-fixed-resize-text",
      rule_title: "Text box has a fixed size instead of auto-resize",
      wcag_criteria: ["1.4.4"],
      wcag_criterion: "1.4.4",
      wcag_level: "AA",
      principle: extractPrinciple("1.4.4"),
      severity: "minor",
      confidence: 0.4,
      source_engines: ["figma-plugin"],
      selector: node.id,
      element_html: node.name,
      failure_summary: `"${node.name}" is a fixed-size text box with ${text.length} characters -- if this is translated or text-scaled, it may clip. Switch to auto-height or auto-width.`,
      additional_instances: 0,
      bbox: null,
      evidence: { characters: text.length },
      engine_version: null,
    });
  }
  return findings;
}

const HEADING_NAME_PATTERN = /^h[1-6]$|heading/i;

/** WCAG 2.4.6 (and, by extension, 1.3.1's "conveyed through presentation"
 * requirement): every layer named like a heading rendering at the exact
 * same font size means there's no visible hierarchy for a reader (or a
 * developer building the semantic markup) to go on. Only fires when there
 * are 2+ heading-named layers to compare -- a single heading has nothing
 * to be inconsistent with. */
export function checkHeadingStructure(roots: FigmaNodeLike[]): Finding[] {
  const headings = collectNodes(roots).filter(
    (n) => n.type === "TEXT" && n.visible !== false && HEADING_NAME_PATTERN.test(n.name.trim())
  );
  if (headings.length < 2) return [];

  const sizes = new Set(
    headings.map((n) => (typeof n.fontSize === "number" ? n.fontSize : null)).filter((s): s is number => s !== null)
  );
  if (sizes.size !== 1) return [];

  return headings.map((node) => ({
    bucket: "needs_review" as const,
    rule_id: "figma-heading-hierarchy",
    rule_title: "Headings have no visible size/weight hierarchy",
    wcag_criteria: ["2.4.6"],
    wcag_criterion: "2.4.6",
    wcag_level: "AA",
    principle: extractPrinciple("2.4.6"),
    severity: "minor" as const,
    confidence: 0.4,
    source_engines: ["figma-plugin"],
    selector: node.id,
    element_html: node.name,
    failure_summary: `All ${headings.length} layers named like headings on this screen render at the same size -- give each heading level a visually distinct size/weight so the structure survives handoff.`,
    additional_instances: 0,
    bbox: null,
    evidence: { headingCount: headings.length },
    engine_version: null,
  }));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/figma-plugin-content-structure-inspector.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add figma-plugin/src/inspectors/content-structure.ts tests/figma-plugin-content-structure-inspector.test.ts
git commit -m "Add Figma content/structure inspectors (WCAG 1.1.1, 1.4.4, 2.4.6) with tests"
```

---

## Task 6: Aggregator — `runAllChecks` + `TESTED_SC_IDS`

**Files:**
- Create: `figma-plugin/src/inspectors/index.ts`
- Test: `tests/figma-plugin-run-all-checks.test.ts`

`TESTED_SC_IDS` is what makes "full WCAG matrix, everything else marked manual" work for
free: `computeComplianceMatrix(findings, testedScIds)` (already in `src/engine/normalize.ts`)
only lets an SC report `"automated-pass"` when it's in this set — every other SC stays
`"manual"` with zero extra bookkeeping.

- [ ] **Step 1: Write the failing test**

```ts
// tests/figma-plugin-run-all-checks.test.ts
import { describe, expect, it } from "vitest";
import { runAllChecks, TESTED_SC_IDS } from "../figma-plugin/src/inspectors/index";
import type { FigmaNodeLike } from "../figma-plugin/src/types";

describe("TESTED_SC_IDS", () => {
  it("lists exactly the SC ids the live checks cover", () => {
    expect(TESTED_SC_IDS.sort()).toEqual(["1.1.1", "1.4.3", "1.4.4", "2.4.6", "2.5.8"].sort());
  });
});

describe("runAllChecks", () => {
  it("aggregates findings across all inspectors", () => {
    const parent: FigmaNodeLike = {
      id: "parent",
      name: "parent",
      type: "FRAME",
      width: 300,
      height: 300,
      fills: [{ type: "SOLID", visible: true, color: { r: 1, g: 1, b: 1 } }],
    };
    const badContrastText: FigmaNodeLike = {
      id: "t1",
      name: "t1",
      type: "TEXT",
      width: 100,
      height: 20,
      visible: true,
      fontSize: 16,
      fontWeight: 400,
      parent,
      fills: [{ type: "SOLID", visible: true, color: { r: 1, g: 1, b: 1 } }],
    };
    const smallButton: FigmaNodeLike = {
      id: "b1",
      name: "Icon Button",
      type: "INSTANCE",
      width: 16,
      height: 16,
      visible: true,
    };
    const unnamedImage: FigmaNodeLike = {
      id: "i1",
      name: "Rectangle 1",
      type: "RECTANGLE",
      width: 100,
      height: 100,
      visible: true,
      fills: [{ type: "IMAGE", visible: true }],
    };
    const findings = runAllChecks([parent, badContrastText, smallButton, unnamedImage]);
    const ruleIds = findings.map((f) => f.rule_id).sort();
    expect(ruleIds).toEqual(["figma-missing-description", "figma-text-contrast", "figma-touch-target-size"]);
  });

  it("returns an empty array for an empty scope", () => {
    expect(runAllChecks([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/figma-plugin-run-all-checks.test.ts`
Expected: FAIL — `Cannot find module '../figma-plugin/src/inspectors/index'`

- [ ] **Step 3: Write `figma-plugin/src/inspectors/index.ts`**

```ts
import type { Finding } from "@/engine/finding-mapping";
import { checkTextContrast } from "./contrast";
import { checkTouchTargetSize } from "./touch-target";
import { checkFixedResizeText, checkHeadingStructure, checkMissingDescriptions } from "./content-structure";
import type { FigmaNodeLike } from "../types";

/** Every WCAG SC id a live Figma-plugin inspector actually covers. Passed
 * as computeComplianceMatrix's testedScIds so every SC outside this set
 * reports "manual" instead of a fabricated pass -- see
 * docs/superpowers/specs/2026-08-24-figma-plugin-design.md's Checks section. */
export const TESTED_SC_IDS = ["1.4.3", "2.5.8", "1.1.1", "1.4.4", "2.4.6"];

export function runAllChecks(roots: FigmaNodeLike[]): Finding[] {
  return [
    ...checkTextContrast(roots),
    ...checkTouchTargetSize(roots),
    ...checkMissingDescriptions(roots),
    ...checkFixedResizeText(roots),
    ...checkHeadingStructure(roots),
  ];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/figma-plugin-run-all-checks.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Run the full figma-plugin test suite together**

Run: `npx vitest run tests/figma-plugin-node-helpers.test.ts tests/figma-plugin-contrast-inspector.test.ts tests/figma-plugin-touch-target-inspector.test.ts tests/figma-plugin-content-structure-inspector.test.ts tests/figma-plugin-run-all-checks.test.ts`
Expected: PASS (38 tests total)

- [ ] **Step 6: Commit**

```bash
git add figma-plugin/src/inspectors/index.ts tests/figma-plugin-run-all-checks.test.ts
git commit -m "Add runAllChecks aggregator and TESTED_SC_IDS for the Figma plugin"
```

---

## Task 7: `code.ts` — message router + `run-audit`

**Files:**
- Create: `figma-plugin/code.ts`

This and Tasks 8–9 run against the real `figma.*` API, which only exists inside Figma's
plugin runtime — same limitation the Chrome extension has with `chrome.*` APIs. There is no
way to unit-test this file from this environment; verification here is `tsc --noEmit` +
`eslint` + a successful build (Task 12), with real behavior confirmed by loading the plugin
in Figma desktop (see Task 13). This mirrors the Chrome extension's disclosed
`tab-bridge.ts`/`content-script.ts` limitation exactly.

- [ ] **Step 1: Write `figma-plugin/code.ts`**

```ts
import type { Finding } from "@/engine/finding-mapping";
import { runAllChecks, TESTED_SC_IDS } from "./src/inspectors/index";
import type { FigmaNodeLike } from "./src/types";

figma.showUI(__html__, { width: 420, height: 640, themeColors: true });

// Real SceneNodes satisfy FigmaNodeLike structurally (id/name/type/width/
// height/fills/characters/... all exist on the relevant node types) --
// this cast is the same pattern the Chrome extension uses at its
// window-vs-DOM boundary (content-script.ts's `window as unknown as {...}`).
function toNodeLike(node: SceneNode): FigmaNodeLike {
  return node as unknown as FigmaNodeLike;
}

/** Node ids from the most recent audit run, kept so "highlight" and
 * "generate report" (Tasks 8-9) can look a finding's selector (a node id)
 * back up to a real node without re-walking the tree. Cleared and
 * repopulated on every run-audit call -- deliberately NOT persisted across
 * plugin sessions (no history stored, per the project's cross-tool scoping). */
const lastAuditedNodes = new Map<string, SceneNode>();

function getScopeRoots(scope: "selection" | "page"): SceneNode[] {
  if (scope === "selection") return [...figma.currentPage.selection];
  return [...figma.currentPage.children];
}

function indexNodes(roots: SceneNode[]): void {
  lastAuditedNodes.clear();
  const visit = (node: SceneNode) => {
    lastAuditedNodes.set(node.id, node);
    if ("children" in node) {
      for (const child of node.children) visit(child as SceneNode);
    }
  };
  for (const root of roots) visit(root);
}

async function runAudit(scope: "selection" | "page"): Promise<{ findings: Finding[]; testedScIds: string[] }> {
  const roots = getScopeRoots(scope);
  indexNodes(roots);
  const findings = runAllChecks(roots.map(toNodeLike));
  return { findings, testedScIds: TESTED_SC_IDS };
}

interface PluginMessage {
  type: string;
  id: string;
  [key: string]: unknown;
}

async function handle(msg: PluginMessage): Promise<unknown> {
  switch (msg.type) {
    case "get-selection-count":
      return figma.currentPage.selection.length;
    case "run-audit":
      return runAudit(msg.scope as "selection" | "page");
    default:
      throw new Error(`Unknown message type: ${msg.type}`);
  }
}

figma.ui.onmessage = async (msg: PluginMessage) => {
  try {
    const result = await handle(msg);
    figma.ui.postMessage({ id: msg.id, ok: true, result });
  } catch (e) {
    figma.ui.postMessage({ id: msg.id, ok: false, error: e instanceof Error ? e.message : String(e) });
  }
};
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p figma-plugin/tsconfig.json`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add figma-plugin/code.ts
git commit -m "Add Figma plugin main-thread message router and run-audit handler"
```

---

## Task 8: `code.ts` — `highlight-node`

**Files:**
- Modify: `figma-plugin/code.ts`

- [ ] **Step 1: Add the handler function**

Add above `handle()`:

```ts
function highlightNode(nodeId: string): boolean {
  const node = lastAuditedNodes.get(nodeId);
  if (!node) return false;
  figma.currentPage.selection = [node];
  figma.viewport.scrollAndZoomIntoView([node]);
  return true;
}
```

- [ ] **Step 2: Wire it into the router**

In `handle()`'s `switch`, add a case above `default`:

```ts
    case "highlight-node":
      return highlightNode(msg.nodeId as string);
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p figma-plugin/tsconfig.json`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add figma-plugin/code.ts
git commit -m "Add Figma plugin highlight-node handler (select + scroll into view)"
```

---

## Task 9: `code.ts` — `generate-report`

**Files:**
- Modify: `figma-plugin/code.ts`

Creates (or replaces, marker-tagged) a `"ScanA11y Report"` page with one 1280×720 frame per
finding: title, severity/WCAG badge text, an `exportAsync` screenshot of the flagged node,
and the recommendation text already carried on each `Finding.failure_summary`.

- [ ] **Step 1: Add the report-writing function**

Add above `handle()`:

```ts
const REPORT_PAGE_NAME = "ScanA11y Report";
const REPORT_MARKER_KEY = "scana11yGenerated";
const PAGE_WIDTH = 1280;
const PAGE_HEIGHT = 720;
const PAGE_GAP = 40;

async function createReportText(
  characters: string,
  opts: { fontSize: number; bold?: boolean; x: number; y: number; width?: number }
): Promise<TextNode> {
  const style = opts.bold ? "Bold" : "Regular";
  await figma.loadFontAsync({ family: "Inter", style });
  const text = figma.createText();
  text.fontName = { family: "Inter", style };
  text.characters = characters;
  text.fontSize = opts.fontSize;
  text.x = opts.x;
  text.y = opts.y;
  if (opts.width) {
    text.textAutoResize = "HEIGHT";
    text.resize(opts.width, text.height);
  }
  return text;
}

async function buildFindingFrame(finding: Finding, y: number): Promise<FrameNode> {
  const frame = figma.createFrame();
  frame.name = finding.rule_title;
  frame.resize(PAGE_WIDTH, PAGE_HEIGHT);
  frame.x = 0;
  frame.y = y;
  frame.setPluginData(REPORT_MARKER_KEY, "1");

  const heading = await createReportText(finding.rule_title, { fontSize: 24, bold: true, x: 48, y: 48, width: 1184 });
  frame.appendChild(heading);

  const meta = await createReportText(
    `${finding.severity.toUpperCase()} · WCAG ${finding.wcag_criteria.join(", ")} (${finding.wcag_level ?? "—"})`,
    { fontSize: 14, x: 48, y: 90 }
  );
  frame.appendChild(meta);

  const node = lastAuditedNodes.get(finding.selector);
  if (node && "exportAsync" in node) {
    try {
      const bytes = await (node as ExportMixin).exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 2 } });
      const image = figma.createImage(bytes);
      const shot = figma.createRectangle();
      shot.name = "Evidence screenshot";
      shot.resize(600, 400);
      shot.x = 48;
      shot.y = 140;
      shot.fills = [{ type: "IMAGE", scaleMode: "FIT", imageHash: image.hash }];
      frame.appendChild(shot);
    } catch {
      // Node may have been deleted/moved since the audit ran -- fall back
      // to a text-only frame rather than failing the whole report.
    }
  }

  const rec = await createReportText(finding.failure_summary, { fontSize: 14, x: 700, y: 140, width: 532 });
  frame.appendChild(rec);

  return frame;
}

async function generateReport(findings: Finding[]): Promise<{ ok: boolean }> {
  let page = figma.root.children.find(
    (p): p is PageNode => p.type === "PAGE" && p.name === REPORT_PAGE_NAME
  );
  if (!page) {
    page = figma.createPage();
    page.name = REPORT_PAGE_NAME;
  } else {
    // Replace only ScanA11y-generated frames from a previous run, so
    // re-running doesn't grow the page unbounded and doesn't touch
    // anything a user might have manually added to this page.
    for (const child of [...page.children]) {
      if (child.getPluginData(REPORT_MARKER_KEY) === "1") child.remove();
    }
  }

  let y = 0;
  const cover = figma.createFrame();
  cover.name = "Cover";
  cover.resize(PAGE_WIDTH, PAGE_HEIGHT);
  cover.x = 0;
  cover.y = y;
  cover.setPluginData(REPORT_MARKER_KEY, "1");
  const title = await createReportText("ScanA11y accessibility report", { fontSize: 32, bold: true, x: 48, y: 48 });
  cover.appendChild(title);
  const summary = await createReportText(
    `${findings.length} finding(s) · generated ${new Date().toISOString().slice(0, 10)}`,
    { fontSize: 16, x: 48, y: 100 }
  );
  cover.appendChild(summary);
  page.appendChild(cover);
  y += PAGE_HEIGHT + PAGE_GAP;

  for (const finding of findings) {
    const frame = await buildFindingFrame(finding, y);
    page.appendChild(frame);
    y += PAGE_HEIGHT + PAGE_GAP;
  }

  figma.currentPage = page;
  figma.viewport.scrollAndZoomIntoView(page.children);
  return { ok: true };
}
```

- [ ] **Step 2: Wire it into the router**

In `handle()`'s `switch`, add a case above `default`:

```ts
    case "generate-report":
      return generateReport(msg.findings as Finding[]);
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p figma-plugin/tsconfig.json`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add figma-plugin/code.ts
git commit -m "Add Figma plugin report generation (16:9 frames, screenshots, recommendations)"
```

---

## Task 10: UI — `figma-bridge.ts`

**Files:**
- Create: `figma-plugin/ui/lib/figma-bridge.ts`

Same async request/response pattern as the extension's `tab-bridge.ts`, adapted to Figma's
single `postMessage` channel: every call gets a correlation id so concurrent calls don't
cross-resolve.

- [ ] **Step 1: Write `figma-plugin/ui/lib/figma-bridge.ts`**

```ts
/** Figma's plugin UI <-> main-thread channel is a single postMessage pipe
 * with no built-in request/response pairing -- callPlugin() adds a
 * correlation id per call so concurrent calls resolve to the right
 * promise, the same problem the Chrome extension's tab-bridge.ts doesn't
 * have (chrome.tabs.sendMessage already returns a promise per call). */

interface PendingEntry {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

const pending = new Map<string, PendingEntry>();
let nextId = 0;

window.onmessage = (event: MessageEvent) => {
  const msg = event.data?.pluginMessage as { id?: string; ok?: boolean; result?: unknown; error?: string } | undefined;
  if (!msg || typeof msg.id !== "string") return;
  const entry = pending.get(msg.id);
  if (!entry) return;
  pending.delete(msg.id);
  if (msg.ok) {
    entry.resolve(msg.result);
  } else {
    entry.reject(new Error(msg.error || "Plugin call failed"));
  }
};

export function callPlugin<T = unknown>(type: string, payload: Record<string, unknown> = {}): Promise<T> {
  const id = String(nextId++);
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
    parent.postMessage({ pluginMessage: { type, id, ...payload } }, "*");
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add figma-plugin/ui/lib/figma-bridge.ts
git commit -m "Add Figma plugin UI-to-main-thread bridge (correlated postMessage)"
```

---

## Task 11: UI — `App.tsx` + entry files

**Files:**
- Create: `figma-plugin/ui/App.tsx`
- Create: `figma-plugin/ui/main.tsx`
- Create: `figma-plugin/ui/index.html`
- Create: `figma-plugin/ui/styles.css`

Reuses the real `Button`/`Card`/`Badge`/`Accordion` components and
`computeComplianceMatrix`/`wcag-registry` from `src/` — same posture as the Chrome
extension's `AuditTab.tsx`.

- [ ] **Step 1: Write `figma-plugin/ui/App.tsx`**

```tsx
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import type { Finding } from "@/engine/finding-mapping";
import { computeComplianceMatrix, type WcagScoreEntry } from "@/engine/normalize";
import { callPlugin } from "./lib/figma-bridge";

const PRINCIPLES = ["Perceivable", "Operable", "Understandable", "Robust"] as const;

const STATUS_LABEL: Record<WcagScoreEntry["status"], string> = {
  "automated-pass": "Pass",
  fail: "Fail",
  needs_review: "Review",
  manual: "Manual",
  "not-applicable": "N/A",
};

function statusVariant(status: WcagScoreEntry["status"]): "default" | "destructive" | "outline" | "secondary" {
  if (status === "fail") return "destructive";
  if (status === "automated-pass") return "default";
  if (status === "needs_review") return "secondary";
  return "outline";
}

export function App() {
  const [scope, setScope] = useState<"selection" | "page">("page");
  const [loading, setLoading] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [testedScIds, setTestedScIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const runAudit = useCallback(async () => {
    setLoading(true);
    setError(null);
    setFindings(null);
    try {
      const res = await callPlugin<{ findings: Finding[]; testedScIds: string[] }>("run-audit", { scope });
      setFindings(res.findings);
      setTestedScIds(res.testedScIds);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [scope]);

  const generateReport = useCallback(async () => {
    if (!findings) return;
    setReportBusy(true);
    setError(null);
    try {
      await callPlugin("generate-report", { findings });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReportBusy(false);
    }
  }, [findings]);

  const matrix = useMemo(
    () => (findings ? computeComplianceMatrix(findings, testedScIds) : null),
    [findings, testedScIds]
  );

  const byPrinciple = useMemo(() => {
    if (!matrix) return null;
    const map = new Map<string, WcagScoreEntry[]>();
    for (const p of PRINCIPLES) map.set(p, []);
    for (const entry of matrix.sc) {
      if (!map.has(entry.principle)) map.set(entry.principle, []);
      map.get(entry.principle)!.push(entry);
    }
    return map;
  }, [matrix]);

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="flex gap-1.5">
        <Button size="sm" variant={scope === "selection" ? "default" : "outline"} className="flex-1" onClick={() => setScope("selection")}>
          Selection
        </Button>
        <Button size="sm" variant={scope === "page" ? "default" : "outline"} className="flex-1" onClick={() => setScope("page")}>
          Current page
        </Button>
      </div>

      <Button onClick={runAudit} disabled={loading} className="w-full">
        {loading ? "Auditing…" : "Run audit"}
      </Button>
      <p className="text-[11px] text-muted-foreground">
        Runs entirely in this file — no login, no network calls, nothing stored.
      </p>

      {error && <p className="text-destructive">{error}</p>}

      {matrix && (
        <>
          <Card>
            <CardContent className="pt-4 space-y-1">
              <p className="font-semibold text-sm">{matrix.wcagScore}% WCAG score</p>
              <p className="text-muted-foreground">
                {matrix.automatablePassed} of {matrix.totalAutomatable} automatable criteria passing · {findings?.length ?? 0} findings
              </p>
            </CardContent>
          </Card>

          <Button onClick={generateReport} disabled={reportBusy || !findings || findings.length === 0} variant="outline" className="w-full">
            {reportBusy ? "Writing report…" : "Generate report in file"}
          </Button>

          <Accordion defaultValue={PRINCIPLES as unknown as string[]}>
            {PRINCIPLES.map((principle) => {
              const entries = byPrinciple?.get(principle) ?? [];
              const failCount = entries.filter((e) => e.status === "fail").length;
              return (
                <AccordionItem key={principle} value={principle}>
                  <AccordionTrigger className="text-xs">
                    {principle}
                    {failCount > 0 && (
                      <Badge variant="destructive" className="ml-2">
                        {failCount}
                      </Badge>
                    )}
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-1">
                      {entries.map((entry) => (
                        <div key={entry.id} className="flex items-center justify-between text-xs py-0.5">
                          <span className="truncate">
                            {entry.id} {entry.name}
                          </span>
                          <Badge variant={statusVariant(entry.status)}>{STATUS_LABEL[entry.status]}</Badge>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>

          {findings && findings.length > 0 && (
            <div className="space-y-1.5">
              <h3 className="text-xs font-semibold">Findings</h3>
              {findings.slice(0, 40).map((f, i) => (
                <div key={i} className="border rounded px-2 py-1.5 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">{f.rule_title}</span>
                    <Badge variant={f.severity === "critical" || f.severity === "serious" ? "destructive" : "secondary"}>
                      {f.severity}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground truncate">{f.element_html}</p>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => callPlugin("highlight-node", { nodeId: f.selector }).catch(() => {})}
                  >
                    Select on canvas
                  </Button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write `figma-plugin/ui/main.tsx`**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 3: Write `figma-plugin/ui/index.html`**

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>ScanA11y</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./main.tsx"></script>
</body>
</html>
```

- [ ] **Step 4: Write `figma-plugin/ui/styles.css`**

```css
@import "../../src/app/globals.css";

/* next/font (Geist) isn't available outside the Next.js app -- fall back
   to the system font stack, same as the Chrome extension's sidepanel. */
:root {
  --font-geist-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-geist-mono: ui-monospace, "SF Mono", Menlo, monospace;
}

html, body, #root {
  height: 100%;
}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p figma-plugin/tsconfig.json`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add figma-plugin/ui/App.tsx figma-plugin/ui/main.tsx figma-plugin/ui/index.html figma-plugin/ui/styles.css
git commit -m "Add Figma plugin UI (audit view, compliance matrix, findings, report button)"
```

---

## Task 12: Build, lint, and full verification

**Files:** none new — verification only.

- [ ] **Step 1: Run the full figma-plugin-related test suite**

Run: `npx vitest run tests/figma-plugin-node-helpers.test.ts tests/figma-plugin-contrast-inspector.test.ts tests/figma-plugin-touch-target-inspector.test.ts tests/figma-plugin-content-structure-inspector.test.ts tests/figma-plugin-run-all-checks.test.ts`
Expected: PASS (38 tests)

- [ ] **Step 2: Typecheck both projects**

Run: `npx tsc --noEmit && npx tsc --noEmit -p figma-plugin/tsconfig.json`
Expected: no errors from either

- [ ] **Step 3: Lint the new source**

Run: `npx eslint figma-plugin`
Expected: no errors (warnings only if any pre-existing pattern already produces them elsewhere in the repo)

If eslint fails because `figma-plugin` isn't covered by the root `eslint.config.mjs`, check
how `chrome-extension/**` is scoped there (`chrome-extension/dist/**` and
`chrome-extension/vendor/**` are ignored, but `chrome-extension/src/**` is linted) and add
the equivalent ignore for `figma-plugin/dist/**` only — the intent is that
`figma-plugin/code.ts`, `figma-plugin/src/**`, and `figma-plugin/ui/**` all get linted like
any other first-party source.

- [ ] **Step 4: Build the plugin**

Run: `npm run build:figma-plugin`
Expected: succeeds, producing `figma-plugin/dist/ui.html` (self-contained, check its size is
more than a few KB — a near-empty file means `vite-plugin-singlefile` didn't inline the JS)
and `figma-plugin/dist/code.js`

- [ ] **Step 5: Sanity-check the UI bundle is actually self-contained**

Run: `grep -c '<script' figma-plugin/dist/ui.html` and separately confirm there is no
`src="` pointing at a separate `.js` file inside that same output — the built HTML must
contain the JS inline, not reference an external `assets/*.js` file (that would silently
fail inside Figma, which loads the HTML as an opaque string with no ability to fetch
sibling files).

- [ ] **Step 6: Commit if Step 3 required an eslint config change**

```bash
git add eslint.config.mjs
git commit -m "Lint figma-plugin/ source alongside the rest of the repo"
```

(Skip this step if Step 3 passed with no config change needed.)

---

## Task 13: `figma-plugin/README.md` — local dev-mode install

**Files:**
- Create: `figma-plugin/README.md`

- [ ] **Step 1: Write `figma-plugin/README.md`**

```markdown
# ScanA11y Figma Plugin

Audits the selected frames or the current page against a Figma-appropriate subset of
WCAG 2.2, lets you jump to any finding on canvas, and writes a full report — one 16:9 frame
per finding, with a screenshot and a recommendation — into a new "ScanA11y Report" page in
the same file. No login, no history stored, no network calls (enforced by the manifest's
`networkAccess.allowedDomains: []`).

## Build it

Run from the repo root (needs the main app's `node_modules`):

```bash
npm run build:figma-plugin
```

This produces `figma-plugin/dist/ui.html` (a single self-contained HTML file — Figma loads
plugin UI as an opaque string, so all JS/CSS is inlined) and `figma-plugin/dist/code.js` (the
main-thread plugin code).

## Load it (Figma desktop app, local dev mode)

1. `npm run build:figma-plugin`
2. Open the Figma desktop app (this flow isn't available in the browser version)
3. `Plugins` → `Development` → `Import plugin from manifest…`
4. Select `figma-plugin/manifest.json`
5. Open any file, select something (or not, for a whole-page audit), then
   `Plugins` → `Development` → `ScanA11y — Accessibility Auditor`

## What it checks

Full WCAG 2.2 compliance matrix (same `computeComplianceMatrix` + `wcag-registry` the
website uses). Only what's actually verifiable from a static Figma file runs as a live
check — contrast (1.4.3), touch-target size (2.5.8), missing image descriptions (1.1.1),
fixed-size text at risk of clipping (1.4.4), and heading-hierarchy signals (2.4.6). Every
other criterion (keyboard, focus, live regions, real reading order, screen-reader
announcement) shows as `manual` — a Figma file cannot verify those, so the plugin says so
rather than a fabricated pass.

## Updating

Rebuild (`npm run build:figma-plugin`), then in Figma: `Plugins` → `Development` →
`ScanA11y — Accessibility Auditor` → right-click → re-import isn't needed, Figma re-reads
`dist/` on each run automatically.

## Publishing to Figma Community

Not done as part of this — publishing is free (no fee, unlike the Chrome Web Store) but
still goes through Figma's review process via the
[developer dashboard](https://www.figma.com/developers). Update `manifest.json`'s
placeholder `"id"` once Figma assigns a real one at that point.
```

- [ ] **Step 2: Commit**

```bash
git add figma-plugin/README.md
git commit -m "Add Figma plugin README (build, local dev-mode install, what it checks)"
```

---

## Task 14: Website `/figma-plugin` distribution page

**Files:**
- Create: `src/app/figma-plugin/page.tsx`
- Modify: `src/app/page.tsx` (homepage link, next to the existing Extension link)
- Create: `public/downloads/scana11y-figma-plugin.zip` (built artifact, same posture as `public/downloads/scana11y-chrome-extension.zip`)

Mirrors `/extension` (`src/app/extension/page.tsx`) exactly — same layout, same "why not
published" honesty, adapted install steps for Figma's "Import plugin from manifest" flow
instead of Chrome's "Load unpacked".

- [ ] **Step 1: Write `src/app/figma-plugin/page.tsx`**

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Figma Plugin — ScanA11y",
  description:
    "Audit frames and layers in your Figma file against WCAG 2.2, jump to any finding on canvas, and generate a full 16:9 report in the file itself — free plugin, no login, nothing sent to a server.",
};

const STEPS = [
  { title: "Download the plugin", body: "Download the zip below. It contains the built plugin — no build step needed." },
  { title: "Unzip it", body: "Extract the zip to a folder you'll keep around (Figma reads the plugin from this folder every time you run it)." },
  { title: "Open Figma desktop", body: "This install flow needs the Figma desktop app — it isn't available from figma.com in a browser." },
  { title: "Import the plugin", body: "Menu → Plugins → Development → Import plugin from manifest… — then select manifest.json inside the unzipped folder." },
  { title: "Run it", body: "Open any file, select what you want audited (or nothing, for a whole-page audit), then Plugins → Development → ScanA11y — Accessibility Auditor." },
];

export default function FigmaPluginPage() {
  return (
    <>
      <div className="flex-1 w-full max-w-3xl mx-auto px-4 py-12">
        <header className="mb-10">
          <p className="text-sm text-muted-foreground mb-2">
            <Link href="/" className="hover:text-foreground transition-colors">
              ← ScanA11y
            </Link>
          </p>
          <h1 className="text-3xl font-bold tracking-tight">Figma Plugin</h1>
          <p className="text-muted-foreground mt-2 max-w-xl">
            Audit the frames and layers in your Figma file against WCAG 2.2, jump to any
            finding on canvas, and generate a full report — one 16:9 frame per finding, with
            a screenshot and a recommendation — written directly into the file. No login, no
            history stored, no network calls.
          </p>
        </header>

        <Card className="mb-8">
          <CardContent className="pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="font-semibold">scana11y-figma-plugin.zip</p>
              <p className="text-sm text-muted-foreground">
                Not on Figma Community yet — install as a local development plugin (free,
                takes under a minute, Figma desktop app required).
              </p>
            </div>
            <a
              href="/downloads/scana11y-figma-plugin.zip"
              download
              className="shrink-0 inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Download .zip
            </a>
          </CardContent>
        </Card>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Install it</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-4">
              {STEPS.map((step, i) => (
                <li key={step.title} className="flex gap-3">
                  <span className="shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold" aria-hidden="true">
                    {i + 1}
                  </span>
                  <div className="text-sm">
                    <p className="font-medium">{step.title}</p>
                    <p className="text-muted-foreground mt-0.5">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <div className="space-y-8 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold mb-2">What it checks</h2>
            <p>
              The same WCAG 2.2 compliance matrix the website uses — but a static design file
              has no live DOM, keyboard, or focus, so only what&apos;s actually verifiable
              from a Figma file runs as a live check: text contrast, touch-target size,
              missing image descriptions, text boxes at risk of clipping, and heading-hierarchy
              signals. Everything else (keyboard, focus, live regions, real reading order,
              screen-reader announcement) shows as <strong>manual</strong> — the plugin says
              so rather than a fabricated pass.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">Why local install</h2>
            <p>
              Publishing to Figma Community is free (no developer fee, unlike the Chrome Web
              Store) but still goes through review. Loading it locally is immediate and gives
              you the exact same plugin — Figma just shows it under &quot;Development&quot;
              instead of the Community tab, and you rebuild manually after an update instead
              of it auto-updating.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">Privacy</h2>
            <p>
              Everything runs inside Figma&apos;s plugin sandbox against the file already open
              on your machine. The manifest explicitly denies all network access
              (<code className="text-xs bg-muted px-1 py-0.5 rounded">networkAccess.allowedDomains: []</code>)
              — nothing is sent anywhere.
            </p>
          </section>
        </div>
      </div>
      <Footer />
    </>
  );
}
```

- [ ] **Step 2: Add the homepage link**

In `src/app/page.tsx`, next to the existing `/extension` link, add:

```tsx
            <Link
              href="/figma-plugin"
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            >
              Figma Plugin
            </Link>
```

- [ ] **Step 3: Build the zip**

From the repo root, with a clean `figma-plugin/dist/` already built (Task 12):

```bash
npm run build:figma-plugin
```

Then package `figma-plugin/manifest.json` + `figma-plugin/dist/` + `figma-plugin/README.md`
into `public/downloads/scana11y-figma-plugin.zip` — same staging approach used for
`public/downloads/scana11y-chrome-extension.zip` (stage into a clean temp directory first,
zip only the intended files, then verify the zip's contents with a listing before
committing — the extension's first zip attempt accidentally included stale demo files that
had leaked into `dist/`, so re-verify contents here too).

- [ ] **Step 4: Typecheck, lint, verify the page renders**

Run: `npx tsc --noEmit && npx eslint src/app/figma-plugin/page.tsx src/app/page.tsx`
Expected: no errors

Start the dev server, navigate to `/figma-plugin`, confirm the page renders with no console
errors, and confirm `/downloads/scana11y-figma-plugin.zip` returns `200` with
`Content-Type: application/zip` — same verification steps already used for `/extension`.

- [ ] **Step 5: Commit**

```bash
git add src/app/figma-plugin/page.tsx src/app/page.tsx public/downloads/scana11y-figma-plugin.zip
git commit -m "Add Figma Plugin distribution page with downloadable zip + install steps"
```

---

## Self-review notes

- **Spec coverage:** architecture split (Task 7), audit-scope toggle (Task 11's `scope`
  state), full WCAG matrix with manual-marked criteria (Task 6's `TESTED_SC_IDS` +
  `computeComplianceMatrix`), all five live checks (Tasks 3–5), highlight (Task 8),
  screenshots (Task 9), report generation on a dedicated page (Task 9), report-replace
  behavior from the spec's Open Question #1 (Task 9's marker-tag delete-then-recreate), UI
  reuse (Task 11), dev-mode distribution (Task 13), website page (Task 14) — every spec
  section has a task.
- **Open Question #2 from the spec** (component instances vs. main components) was
  evaluated during planning: none of the five v1 checks depend on instance/main-component
  identity in a way that produces duplicate findings across every instance of a component
  (contrast and touch-target checks read the instance's own geometry/fills, which is what
  actually renders on that screen). No special-casing needed for v1; left as a note here
  rather than a spec contradiction.
- **Type consistency:** `Finding` (from `@/engine/finding-mapping`) is used unmodified end to
  end — inspectors (Tasks 3–5) return `Finding[]`, `runAllChecks` (Task 6) returns
  `Finding[]`, `code.ts`'s `run-audit`/`generate-report` handlers (Tasks 7, 9) pass `Finding[]`
  across the bridge unchanged, and `App.tsx` (Task 11) consumes `Finding[]` directly into
  `computeComplianceMatrix`. `FigmaNodeLike` (Task 2) is the only other cross-task type and is
  used identically by every inspector and by `code.ts`'s `toNodeLike` cast.
