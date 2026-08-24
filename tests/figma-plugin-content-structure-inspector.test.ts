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

  it("does not flag an invisible node even with a default name and image fill", () => {
    const node: FigmaNodeLike = {
      id: "n1",
      name: "Rectangle 4",
      type: "RECTANGLE",
      width: 100,
      height: 100,
      visible: false,
      fills: [{ type: "IMAGE", visible: true }],
    };
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

  it("does not flag an invisible node even with fixed-resize + long text", () => {
    const node: FigmaNodeLike = {
      id: "n1",
      name: "Body copy",
      type: "TEXT",
      width: 200,
      height: 60,
      visible: false,
      textAutoResize: "NONE",
      characters: "This is a long paragraph of body copy that runs well past forty characters.",
    };
    expect(checkFixedResizeText([node])).toHaveLength(0);
  });

  it("flags fixed-size text at exactly MIN_FLAGGED_LENGTH (40) characters -- boundary is inclusive", () => {
    const exactly40 = "x".repeat(40);
    expect(exactly40).toHaveLength(40);
    const node: FigmaNodeLike = {
      id: "n1",
      name: "Body copy",
      type: "TEXT",
      width: 200,
      height: 60,
      visible: true,
      textAutoResize: "NONE",
      characters: exactly40,
    };
    const findings = checkFixedResizeText([node]);
    expect(findings).toHaveLength(1);
    expect(findings[0].evidence).toEqual({ characters: 40 });
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

  it("excludes headings with a mixed/Symbol fontSize from both the comparison and the output", () => {
    const mixedFontSizeHeading: FigmaNodeLike = {
      id: "h3",
      name: "Heading",
      type: "TEXT",
      width: 200,
      height: 30,
      visible: true,
      fontSize: Symbol("mixed"),
    };
    const findings = checkHeadingStructure([heading("h1", 16), heading("h2", 16), mixedFontSizeHeading]);
    // Only h1 and h2 are verifiably uniform (both fontSize 16); h3's actual
    // size was never resolved, so it must not be counted or included.
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.selector).sort()).toEqual(["h1", "h2"]);
    expect(findings[0].evidence).toEqual({ headingCount: 2 });
    expect(findings[0].failure_summary).toContain("All 2 layers");
  });

  it("treats a layer named 'Subheading' as heading-like, per the unanchored HEADING_NAME_PATTERN", () => {
    const subheading: FigmaNodeLike = {
      id: "s1",
      name: "Subheading",
      type: "TEXT",
      width: 200,
      height: 30,
      visible: true,
      fontSize: 16,
    };
    const findings = checkHeadingStructure([heading("h1", 16), subheading]);
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.selector).sort()).toEqual(["h1", "s1"]);
  });
});
