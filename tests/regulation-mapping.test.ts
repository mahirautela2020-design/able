import { describe, it, expect } from "vitest";
import {
  REGULATION_MAPPINGS,
  getRegulationById,
  getScRegulationCoverage,
} from "@/lib/regulation-mapping";

describe("regulation-mapping", () => {
  it("has exactly 8 regulation mappings", () => {
    expect(REGULATION_MAPPINGS).toHaveLength(8);
  });

  it("every regulation has a unique id", () => {
    const ids = REGULATION_MAPPINGS.map((r) => r.regulationId);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("getRegulationById finds existing regulation", () => {
    const reg = getRegulationById("section-508");
    expect(reg).toBeDefined();
    expect(reg?.jurisdiction).toBe("United States");
    expect(reg?.regulationName).toContain("Section 508");
  });

  it("getRegulationById returns undefined for missing regulation", () => {
    expect(getRegulationById("nonexistent")).toBeUndefined();
  });

  it("w3c-wcag-22 covers all 86 SCs", () => {
    const wcag22 = getRegulationById("w3c-wcag-22")!;
    expect(wcag22.mappedScIds).toHaveLength(86);
    expect(wcag22.mappedScIds).toContain("1.1.1");
    expect(wcag22.mappedScIds).toContain("4.1.3");
  });

  it("w3c-wcag-22 does NOT contain 4.1.1", () => {
    const wcag22 = getRegulationById("w3c-wcag-22")!;
    expect(wcag22.mappedScIds).not.toContain("4.1.1");
  });

  it("section-508 maps expected WCAG SCs", () => {
    const section508 = getRegulationById("section-508")!;
    expect(section508.mappedScIds).toContain("1.1.1");
    expect(section508.mappedScIds).toContain("1.4.3");
    expect(section508.mappedScIds).toContain("2.4.7");
    expect(section508.mappedScIds).toContain("4.1.2");
  });

  it("en-301-549 maps expected WCAG SCs", () => {
    const en = getRegulationById("en-301-549")!;
    expect(en.mappedScIds).toContain("1.4.13");
    expect(en.mappedScIds).toContain("2.5.1");
    expect(en.jurisdiction).toBe("European Union");
  });

  it("ada-title-ii maps expected WCAG SCs", () => {
    const ada = getRegulationById("ada-title-ii")!;
    expect(ada.mappedScIds).toContain("1.4.13");
    expect(ada.mappedScIds).toContain("2.5.4");
    expect(ada.notes).toContain("April 2026");
  });

  it("aoda maps expected WCAG SCs", () => {
    const aoda = getRegulationById("aoda")!;
    expect(aoda.jurisdiction).toBe("Canada (Ontario)");
    expect(aoda.mappedScIds).toContain("1.4.3");
  });

  it("aca maps expected WCAG SCs", () => {
    const aca = getRegulationById("aca")!;
    expect(aca.jurisdiction).toBe("Canada (Federal)");
    expect(aca.mappedScIds).toContain("1.4.12");
  });

  it("uk-psbar maps expected WCAG SCs", () => {
    const uk = getRegulationById("uk-psbar")!;
    expect(uk.jurisdiction).toBe("United Kingdom");
    expect(uk.mappedScIds).toContain("1.4.13");
  });

  it("every regulation SC is a valid WCAG SC id", async () => {
    const { getWcagRegistry } = await import("@/engine/wcag-registry");
    const registryIds = new Set(getWcagRegistry().map((sc) => sc.id));

    for (const reg of REGULATION_MAPPINGS) {
      for (const scId of reg.mappedScIds) {
        expect(
          registryIds.has(scId),
          `${reg.regulationId} maps unknown SC ${scId}`
        ).toBe(true);
      }
    }
  });

  it("every regulation has a non-empty name", () => {
    for (const reg of REGULATION_MAPPINGS) {
      expect(reg.regulationName.trim().length).toBeGreaterThan(0);
    }
  });

  it("every regulation has a non-empty jurisdiction", () => {
    for (const reg of REGULATION_MAPPINGS) {
      expect(reg.jurisdiction.trim().length).toBeGreaterThan(0);
    }
  });

  it("every regulation has a valid URL", () => {
    for (const reg of REGULATION_MAPPINGS) {
      expect(reg.url.startsWith("https://")).toBe(true);
    }
  });

  it("every regulation has notes", () => {
    for (const reg of REGULATION_MAPPINGS) {
      expect(reg.notes).toBeDefined();
      expect(reg.notes!.trim().length).toBeGreaterThan(0);
    }
  });

  it("getScRegulationCoverage finds regulations for a common SC", () => {
    const coverage = getScRegulationCoverage("1.4.3");
    expect(coverage.length).toBeGreaterThanOrEqual(6);
    expect(coverage).toContain("section-508");
    expect(coverage).toContain("en-301-549");
    expect(coverage).toContain("w3c-wcag-22");
  });

  it("getScRegulationCoverage for a 2.2-only SC finds limited coverage", () => {
    const coverage = getScRegulationCoverage("2.5.8");
    expect(coverage).toContain("w3c-wcag-22");
    expect(coverage).not.toContain("section-508");
  });

  it("getScRegulationCoverage for unknown SC returns empty", () => {
    const coverage = getScRegulationCoverage("9.9.9");
    expect(coverage).toHaveLength(0);
  });

  it("section-508, en-301-549, ada-title-ii, and uk-psbar do not contain 2.5.8", () => {
    const regs = ["section-508", "en-301-549", "ada-title-ii", "uk-psbar"];
    for (const rid of regs) {
      const reg = getRegulationById(rid)!;
      expect(reg.mappedScIds).not.toContain("2.5.8");
    }
  });

  it("ada-title-iii has the fewest mapped SCs", () => {
    const counts = REGULATION_MAPPINGS.map((r) => ({
      id: r.regulationId,
      count: r.mappedScIds.length,
    }));
    const min = counts.reduce((a, b) => (a.count < b.count ? a : b));
    expect(min.id).toBe("ada-title-iii");
  });

  it("each regulation has naturally sorted SC ids (ascending)", () => {
    function naturalCompare(a: string, b: string): number {
      const [a1, a2, a3] = a.split(".").map(Number);
      const [b1, b2, b3] = b.split(".").map(Number);
      if (a1 !== b1) return a1 - b1;
      if (a2 !== b2) return a2 - b2;
      return a3 - b3;
    }
    for (const reg of REGULATION_MAPPINGS) {
      for (let i = 1; i < reg.mappedScIds.length; i++) {
        const cmp = naturalCompare(reg.mappedScIds[i - 1], reg.mappedScIds[i]);
        expect(cmp, `${reg.regulationId}: ${reg.mappedScIds[i - 1]} should come before ${reg.mappedScIds[i]}`).toBeLessThanOrEqual(0);
      }
    }
  });
});
