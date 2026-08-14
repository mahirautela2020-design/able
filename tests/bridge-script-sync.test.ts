import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ABLE_INSPECT_BRIDGE_SCRIPT } from "@/lib/explore/bridge-script";

// Normalize line endings only — git's autocrlf can check these fixtures out
// as CRLF on Windows while this source file is LF; that's an environment
// detail, not real drift, so it shouldn't fail the sync guard.
const toLf = (s: string) => s.replace(/\r\n/g, "\n");

function extractInlineScript(htmlPath: string): string {
  const html = readFileSync(resolve(__dirname, "..", htmlPath), "utf-8");
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!match) throw new Error(`No <script> block found in ${htmlPath}`);
  return toLf(match[1]);
}

describe("bridge-script sync guard", () => {
  it("ABLE_INSPECT_BRIDGE_SCRIPT matches the inline script in public/explore-demo.html verbatim", () => {
    expect(toLf(ABLE_INSPECT_BRIDGE_SCRIPT)).toBe(extractInlineScript("public/explore-demo.html"));
  });

  it("ABLE_INSPECT_BRIDGE_SCRIPT matches the inline script in tests/fixtures/explore-demo.html verbatim", () => {
    expect(toLf(ABLE_INSPECT_BRIDGE_SCRIPT)).toBe(extractInlineScript("tests/fixtures/explore-demo.html"));
  });

  it("exposes window.__ableInspect with the full bridge API surface", () => {
    for (const fn of [
      "inspect",
      "focusables",
      "contrastPairs",
      "highlight",
      "highlightByRoleName",
      "patch",
      "focusEl",
      "setFilter",
      "applyAccessibilityProfile",
      "clearHighlight",
    ]) {
      expect(ABLE_INSPECT_BRIDGE_SCRIPT).toContain(`${fn}:`);
    }
  });
});
