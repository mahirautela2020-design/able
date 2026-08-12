import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withPage } from "@/engine/browser";
import { runAxe } from "@/engine/axe-scan";
import { captureAriaSnapshot, type AriaNode } from "@/lib/sr/snapshot";

const hasChrome = !!process.env.CHROME_EXECUTABLE_PATH;

const fixtureUrl = (name: string) => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  return `file:///${path.join(dir, "fixtures", name).replace(/\\/g, "/")}`;
};

function collectRoles(node: AriaNode, out: string[]): string[] {
  out.push(node.role);
  for (const child of node.children) collectRoles(child, out);
  return out;
}

describe("explore fixture", () => {
  it.skipIf(!hasChrome)(
    "the demo fixture contains real axe violations (evidence-first, not invented)",
    async () => {
      const result = await withPage(async (page) => {
        await page.goto(fixtureUrl("explore-demo.html"), {
          waitUntil: "domcontentloaded",
          timeout: 20_000,
        });
        return runAxe(page);
      });

      const ruleIds = result.findings
        .filter((f) => f.bucket === "automated" || f.bucket === "needs_review")
        .map((f) => f.rule_id);

      expect(ruleIds).toContain("color-contrast");
      expect(ruleIds).toContain("image-alt");
      expect(ruleIds).toContain("label");
    }
  );

  it.skipIf(!hasChrome)(
    "captures the accessibility tree (AX-snapshot smoke gate)",
    async () => {
      const snapshot = await withPage(async (page) => {
        await page.goto(fixtureUrl("explore-demo.html"), {
          waitUntil: "domcontentloaded",
          timeout: 20_000,
        });
        return captureAriaSnapshot(page);
      });

      expect(snapshot).not.toBeNull();
      const roles = collectRoles(snapshot as AriaNode, []);
      expect(roles).toContain("button");
      expect(roles).toContain("textbox");
    }
  );
});
