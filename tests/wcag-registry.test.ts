import { describe, it, expect } from "vitest";
import {
  getWcagRegistry,
  getScById,
  deriveRuleMappings,
  axeCoveredScIds,
  normalizeTag,
  NEW_IN_22,
} from "@/engine/wcag-registry";

describe("wcag-registry", () => {
  it("has exactly 86 success criteria (WCAG 2.2, 4.1.1 absent)", () => {
    const registry = getWcagRegistry();
    expect(registry.length).toBe(86);
  });

  it("has 9 new-in-2.2 SCs with correct levels", () => {
    expect(NEW_IN_22).toHaveLength(9);

    const registry = getWcagRegistry();
    const newScs = registry.filter((sc) => NEW_IN_22.includes(sc.id));

    const sc2_5_8 = newScs.find((s) => s.id === "2.5.8");
    expect(sc2_5_8?.level).toBe("AA");

    const sc3_2_6 = newScs.find((s) => s.id === "3.2.6");
    expect(sc3_2_6?.level).toBe("A");

    const sc3_3_7 = newScs.find((s) => s.id === "3.3.7");
    expect(sc3_3_7?.level).toBe("A");

    const sc3_3_8 = newScs.find((s) => s.id === "3.3.8");
    expect(sc3_3_8?.level).toBe("AA");

    const sc3_3_9 = newScs.find((s) => s.id === "3.3.9");
    expect(sc3_3_9?.level).toBe("AAA");
  });

  it("4.1.1 is absent", () => {
    const registry = getWcagRegistry();
    expect(registry.find((sc) => sc.id === "4.1.1")).toBeUndefined();
  });

  it("getScById finds existing SC", () => {
    const sc = getScById("1.4.3");
    expect(sc).toBeDefined();
    expect(sc?.level).toBe("AA");
    expect(sc?.name).toBe("Contrast (Minimum)");
  });

  it("getScById returns undefined for missing SC", () => {
    expect(getScById("9.9.9")).toBeUndefined();
  });

  it("correctly identifies AA levels for well-known SCs", () => {
    const sc1_4_3 = getScById("1.4.3");
    expect(sc1_4_3?.level).toBe("AA");

    const sc2_4_7 = getScById("2.4.7");
    expect(sc2_4_7?.level).toBe("AA");
  });

  it("deriveRuleMappings returns mappings for all axe rules", () => {
    const mappings = deriveRuleMappings();
    expect(mappings.size).toBeGreaterThan(0);

    const registry = getWcagRegistry();
    const registryIds = new Set(registry.map((sc) => sc.id));

    for (const _scIds of mappings.values()) {
      for (const scId of _scIds) {
        expect(registryIds.has(scId)).toBe(true);
      }
    }
  });

  it("regression: deriveRuleMappings includes AAA-only rules (color-contrast-enhanced -> 1.4.6)", () => {
    // Before this fix, axe.getRules() was only asked for A/AA tags, so
    // AAA-only rules (this PR turns AAA scanning on) never appeared in the
    // mapping at all — their violations could never resolve to an SC id.
    const mappings = deriveRuleMappings();
    expect(mappings.get("color-contrast-enhanced")).toContain("1.4.6");
  });

  it("regression: deriveRuleMappings keeps Principle-2 SC-specific tags (they share a prefix with the level tags)", () => {
    // The level-tag exclusion used to be `!t.startsWith("wcag2") &&
    // !t.startsWith("wcag21") && !t.startsWith("wcag22")`, meant to drop
    // "wcag2aa"/"wcag21a"/"wcag22aa" etc. But every Principle-2 (Operable)
    // SC-specific tag ALSO starts with those same literal prefixes --
    // "wcag241" (2.4.1) starts with "wcag2", "wcag211" (2.1.1) starts with
    // "wcag21", "wcag221" (2.2.1) starts with "wcag22" -- so the prefix
    // check silently discarded them too, and 11 real SCs (2.1.1, 2.1.3,
    // 2.2.1, 2.2.2, 2.2.4, 2.4.1, 2.4.2, 2.4.4, 2.4.9, 2.5.3, 2.5.8) could
    // never resolve from an axe violation to a dotted SC id, even though
    // axe-core genuinely tests every one of them.
    const mappings = deriveRuleMappings();
    expect(mappings.get("bypass")).toContain("2.4.1"); // Bypass Blocks
    expect(mappings.get("document-title")).toContain("2.4.2"); // Page Titled
    expect(mappings.get("link-name")).toContain("2.4.4"); // Link Purpose (In Context)
    expect(mappings.get("identical-links-same-purpose")).toContain("2.4.9"); // Link Purpose (Link Only)
    expect(mappings.get("target-size")).toContain("2.5.8"); // Target Size Minimum
    expect(mappings.get("frame-focusable-content")).toContain("2.1.1"); // Keyboard
  });

  it("normalizeTag converts an axe-style tag to the registry's dotted id", () => {
    expect(normalizeTag("wcag143")).toBe("1.4.3");
    expect(normalizeTag("wcag1411")).toBe("1.4.11");
  });

  it("normalizeTag is idempotent on already-dotted input", () => {
    expect(normalizeTag("1.4.3")).toBe("1.4.3");
  });

  it("normalizeTag passes non-SC tags through unchanged", () => {
    expect(normalizeTag("wcag2aa")).toBe("wcag2aa");
  });

  it("axeCoveredScIds returns a narrower, real-coverage set (not every non-manual SC)", () => {
    const ids = axeCoveredScIds();
    const registry = getWcagRegistry();
    const automatableCount = registry.filter((sc) => !sc.manualTest).length;
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.length).toBeLessThan(automatableCount);
    expect(ids).toContain("1.4.3");
  });

  it("regression: axeCoveredScIds includes Principle-2 SCs axe-core actually tests", () => {
    // AUDIT_MODULES (src/lib/audit-modules.ts) advertises this set as "all
    // automatable WCAG 2.2 success criteria" and it gates which SCs
    // computeComplianceMatrix is allowed to mark "automated-pass" -- if a
    // covered SC is missing here, a page that genuinely passes it (e.g. has
    // a skip link, so "bypass" reports no violation) stays stuck at
    // "manual"/"not tested" forever instead of "automated-pass".
    const ids = axeCoveredScIds();
    for (const sc of ["2.1.1", "2.2.1", "2.4.1", "2.4.2", "2.4.4", "2.4.9", "2.5.8"]) {
      expect(ids).toContain(sc);
    }
  });
});
