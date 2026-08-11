import { describe, it, expect } from "vitest";
import { getWcagRegistry, getScById, deriveRuleMappings, NEW_IN_22 } from "@/engine/wcag-registry";

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
});
