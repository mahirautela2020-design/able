import { describe, it, expect } from "vitest";
import { extractColorPairs, checkContrastPairs } from "@/lib/audit/image-contrast";
import type { FigmaNode } from "@/lib/figma/parse";
import cases from "@/lib/audit/__fixtures__/contrast-cases.json";

function makeNode(overrides: Partial<FigmaNode> = {}): FigmaNode {
  return { id: "test-1", name: "test", type: "RECTANGLE", ...overrides };
}

function makeTextNode(id: string, hex: string, fontSize?: number): FigmaNode {
  return {
    id,
    name: "text",
    type: "TEXT",
    style: {
      fontSize: fontSize ?? 16,
      fontWeight: 400,
      fills: [{ type: "SOLID", color: hexToColor(hex) }],
    },
  };
}

function hexToColor(hex: string) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.substring(0, 2), 16) / 255,
    g: parseInt(h.substring(2, 4), 16) / 255,
    b: parseInt(h.substring(4, 6), 16) / 255,
    a: 1,
  };
}

describe("image-contrast", () => {
  describe("extractColorPairs", () => {
    it("detects solid fill contrast pair", () => {
      const nodes: FigmaNode[] = [
        makeNode({
          id: "r1",
          fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1, a: 1 } }],
          children: [
            makeTextNode("c1", "#000000"),
          ],
        }),
      ];

      const pairs = extractColorPairs(nodes, nodes);
      expect(pairs.length).toBeGreaterThanOrEqual(1);
      const textPair = pairs.find((p) => p.fgNodeId === "c1");
      expect(textPair).toBeDefined();
      expect(textPair!.ratio).toBeCloseTo(21, 0);
      expect(textPair!.passesAA).toBe(true);
      expect(textPair!.passesAAA).toBe(true);
    });

    it("flags gradient fill as unmeasurable", () => {
      const nodes: FigmaNode[] = [
        makeNode({
          id: "r1",
          fills: [{ type: "GRADIENT_LINEAR" }],
        }),
      ];

      const pairs = extractColorPairs(nodes, nodes);
      const gradientPair = pairs.find((p) => p.fgNodeId === "r1");
      expect(gradientPair).toBeDefined();
      expect(gradientPair!.fgHex).toBe("gradient");
      expect(gradientPair!.ratio).toBe(0);
    });

    it("flags image fill as unmeasurable", () => {
      const nodes: FigmaNode[] = [
        makeNode({
          id: "r1",
          fills: [{ type: "IMAGE", imageRef: "abc" }],
        }),
      ];

      const pairs = extractColorPairs(nodes, nodes);
      const imgPair = pairs.find((p) => p.fgNodeId === "r1");
      expect(imgPair).toBeDefined();
      expect(imgPair!.fgHex).toBe("image");
      expect(imgPair!.ratio).toBe(0);
    });

    it("respects large text AA threshold (3:1 instead of 4.5:1)", () => {
      const nodes: FigmaNode[] = [
        makeNode({
          id: "r1",
          fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1, a: 1 } }],
          children: [
            makeTextNode("c1", "#767676", 24),
          ],
        }),
      ];

      const pairs = extractColorPairs(nodes, nodes);
      const textPair = pairs.find((p) => p.fgNodeId === "c1");
      expect(textPair).toBeDefined();
      expect(textPair!.ratio).toBeCloseTo(4.54, 0);
      expect(textPair!.passesAA).toBe(true);
      expect(textPair!.isLargeText).toBe(true);
    });
  });

  describe("checkContrastPairs", () => {
    it("emits no findings when all pairs pass AA", () => {
      const nodes = [
        makeNode({
          id: "r1",
          fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1, a: 1 } }],
          children: [makeTextNode("c1", "#000000")],
        }),
      ];

      const pairs = extractColorPairs(nodes, nodes);
      const findings = checkContrastPairs(pairs, nodes);
      expect(findings.length).toBe(0);
    });

    it("emits finding when pair fails AA", () => {
      const nodes = [
        makeNode({
          id: "r1",
          fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1, a: 1 } }],
          children: [makeTextNode("c1", "#949494")],
        }),
      ];

      const pairs = extractColorPairs(nodes, nodes);
      const findings = checkContrastPairs(pairs, nodes);
      const fail = findings.find((f) => f.evidence.pair.fgNodeId === "c1");
      expect(fail).toBeDefined();
      expect(fail!.ruleId).toContain("contrast-");
      expect(fail!.wcagCriterion).toBe("1.4.3");
      expect(fail!.sourceEngines).toContain("rule-contrast");
      expect(fail!.evidence.pair.ratio).toBeCloseTo(3, 0);
    });

    it("emits minor finding for gradient fills (skipped, not a violation)", () => {
      const nodes = [
        makeNode({
          id: "r1",
          fills: [{ type: "GRADIENT_LINEAR" }],
        }),
      ];

      const pairs = extractColorPairs(nodes, nodes);
      const findings = checkContrastPairs(pairs, nodes);
      const grad = findings.find((f) => f.evidence.pair.fgHex === "gradient");
      expect(grad).toBeDefined();
      expect(grad!.severity).toBe("minor");
      expect(grad!.failureSummary).toContain("cannot be measured");
    });

    it("emits minor finding for image fills (skipped)", () => {
      const nodes = [
        makeNode({
          id: "r1",
          fills: [{ type: "IMAGE", imageRef: "abc" }],
        }),
      ];

      const pairs = extractColorPairs(nodes, nodes);
      const findings = checkContrastPairs(pairs, nodes);
      const img = findings.find((f) => f.evidence.pair.fgHex === "image");
      expect(img).toBeDefined();
      expect(img!.severity).toBe("minor");
    });
  });

  describe("fixture cases", () => {
    it.each(cases)(
      "$description",
      (c) => {
        if (c.isGradient) {
          const nodes = [
            makeNode({
              id: c.fgNodeId,
              fills: [{ type: "GRADIENT_LINEAR" }],
            }),
          ];
          const pairs = extractColorPairs(nodes, nodes);
          const findings = checkContrastPairs(pairs, nodes);
          expect(findings.length).toBe(1);
          expect(findings[0]!.severity).toBe("minor");
          return;
        }

        if (c.fg === null) {
          return;
        }

        const bgNode = makeNode({
          id: c.bgNodeId,
          fills: [{ type: "SOLID", color: hexToColor(c.bg!) }],
          children: [
            makeTextNode(c.fgNodeId, c.fg, c.fontSize),
          ],
        });

        const pairs = extractColorPairs([bgNode], [bgNode]);
        const textPair = pairs.find((p) => p.fgNodeId === c.fgNodeId);
        expect(textPair).toBeDefined();
        expect(textPair!.ratio).toBeCloseTo(c.expectedRatio!, 0);
        expect(textPair!.passesAA).toBe(c.passesAA);
        expect(textPair!.passesAAA).toBe(c.passesAAA);
      }
    );
  });
});
