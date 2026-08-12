import { describe, it, expect } from "vitest";
import { checkImageAltPresence } from "@/lib/audit/image-alt";
import type { FigmaNode } from "@/lib/figma/parse";

const imageNode = (id: string, overrides: Partial<FigmaNode> = {}): FigmaNode => ({
  id,
  name: `Image ${id}`,
  type: "RECTANGLE",
  fills: [{ type: "IMAGE" }],
  ...overrides,
});

describe("checkImageAltPresence (heuristic, needs-review)", () => {
  it("flags image with no label as needs_review at 0.7 confidence", () => {
    const findings = checkImageAltPresence([imageNode("1:1")]);
    expect(findings).toHaveLength(1);
    expect(findings[0].bucket).toBe("needs_review");
    expect(findings[0].confidence).toBe(0.7);
    expect(findings[0].wcagCriterion).toBe("1.1.1");
  });

  it("does NOT flag image with a text child label", () => {
    const node = imageNode("1:2", {
      children: [{ id: "1:3", name: "Label", type: "TEXT", characters: "Logo" }],
    });
    const findings = checkImageAltPresence([node]);
    expect(findings).toHaveLength(0);
  });

  it("ignores nodes without image fills", () => {
    const node: FigmaNode = {
      id: "1:4",
      name: "Plain box",
      type: "RECTANGLE",
      fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1, a: 1 }, blendMode: "NORMAL" }],
    };
    expect(checkImageAltPresence([node])).toHaveLength(0);
  });

  it("walks nested children recursively", () => {
    const parent = imageNode("1:5", {
      children: [
        imageNode("1:6", {
          children: [imageNode("1:7")],
        }),
      ],
    });
    const findings = checkImageAltPresence([parent]);
    // both the nested image (1:6) and its child (1:7) lack labels
    expect(findings.length).toBeGreaterThanOrEqual(2);
  });
});
