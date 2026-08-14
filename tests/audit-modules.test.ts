import { describe, it, expect } from "vitest";
import {
  AUDIT_MODULES,
  MODULE_PRESETS,
  getModuleById,
  getPresetById,
  getModuleWcagCoverage,
  totalEstimatedRuntime,
  formatRuntime,
  getRequiredModuleIds,
  resolveModuleIds,
  resolveModuleGates,
} from "@/lib/audit-modules";

describe("audit-modules", () => {
  it("has exactly 10 audit modules", () => {
    expect(AUDIT_MODULES).toHaveLength(10);
  });

  it("every module has a unique id", () => {
    const ids = AUDIT_MODULES.map((m) => m.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("first two modules are required (not optional)", () => {
    expect(AUDIT_MODULES[0].optional).toBe(false);
    expect(AUDIT_MODULES[1].optional).toBe(false);
    expect(AUDIT_MODULES[0].id).toBe("automated");
    expect(AUDIT_MODULES[1].id).toBe("needs-review");
  });

  it("getRequiredModuleIds returns automated and needs-review", () => {
    const ids = getRequiredModuleIds();
    expect(ids).toContain("automated");
    expect(ids).toContain("needs-review");
    expect(ids).toHaveLength(2);
  });

  it("getModuleById finds existing module", () => {
    const mod = getModuleById("keyboard");
    expect(mod).toBeDefined();
    expect(mod?.name).toBe("Keyboard Behavior");
    expect(mod?.engine).toBe("Playwright walkthrough");
  });

  it("getModuleById returns undefined for missing module", () => {
    expect(getModuleById("nonexistent")).toBeUndefined();
  });

  it("automated module covers what axe-core rules actually detect (not every non-manual SC)", () => {
    // Regression: this used to be allAutomatableScIds() — every SC the
    // registry merely marks non-manual, regardless of whether any axe rule
    // tests it — which made module-gating a no-op (this required module's
    // over-claim always dominated testedScIds). It's now axeCoveredScIds(),
    // axe's real, narrower rule coverage.
    const automated = getModuleById("automated")!;
    expect(automated.wcagScIds.length).toBeGreaterThan(10);
    expect(automated.wcagScIds.length).toBeLessThan(40);
    expect(automated.wcagScIds).toContain("1.3.1");
    expect(automated.wcagScIds).toContain("1.4.3");
    expect(automated.wcagScIds).toContain("4.1.2");
  });

  it("manual-checklist module only covers manual SCs", () => {
    const checklist = getModuleById("manual-checklist")!;
    expect(checklist.wcagScIds.length).toBeGreaterThan(30);
    expect(checklist.estimatedRuntimeMs).toBe(0);
  });

  it("keyboard module covers expected WCAG SCs", () => {
    const keyboard = getModuleById("keyboard")!;
    expect(keyboard.wcagScIds).toContain("2.1.1");
    expect(keyboard.wcagScIds).toContain("2.1.2");
    expect(keyboard.wcagScIds).toContain("2.4.1");
    expect(keyboard.wcagScIds).toContain("2.4.3");
    expect(keyboard.wcagScIds).toContain("2.4.7");
    expect(keyboard.wcagScIds).toContain("2.4.11");
  });

  it("contrast module covers 1.4.3, 1.4.6, 1.4.11", () => {
    const contrast = getModuleById("contrast")!;
    expect(contrast.wcagScIds).toContain("1.4.3");
    expect(contrast.wcagScIds).toContain("1.4.6");
    expect(contrast.wcagScIds).toContain("1.4.11");
  });

  it("touch-targets module covers 2.5.5 and 2.5.8", () => {
    const touch = getModuleById("touch-targets")!;
    expect(touch.wcagScIds).toContain("2.5.5");
    expect(touch.wcagScIds).toContain("2.5.8");
  });

  it("responsive module covers 1.4.4 and 1.4.10", () => {
    const responsive = getModuleById("responsive")!;
    expect(responsive.wcagScIds).toContain("1.4.4");
    expect(responsive.wcagScIds).toContain("1.4.10");
  });

  it("aria module covers 4.1.2 and 4.1.3", () => {
    const aria = getModuleById("aria")!;
    expect(aria.wcagScIds).toContain("4.1.2");
    expect(aria.wcagScIds).toContain("4.1.3");
  });

  it("has 4 presets", () => {
    expect(MODULE_PRESETS).toHaveLength(4);
  });

  it("every preset has a unique id", () => {
    const ids = MODULE_PRESETS.map((p) => p.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("quick preset includes automated, needs-review, keyboard", () => {
    const quick = getPresetById("quick")!;
    expect(quick.moduleIds).toContain("automated");
    expect(quick.moduleIds).toContain("needs-review");
    expect(quick.moduleIds).toContain("keyboard");
    expect(quick.moduleIds).toHaveLength(3);
  });

  it("standard preset includes 6 modules", () => {
    const standard = getPresetById("standard")!;
    expect(standard.moduleIds).toHaveLength(6);
    expect(standard.moduleIds).toContain("automated");
    expect(standard.moduleIds).toContain("needs-review");
    expect(standard.moduleIds).toContain("keyboard");
    expect(standard.moduleIds).toContain("aria");
    expect(standard.moduleIds).toContain("contrast");
    expect(standard.moduleIds).toContain("touch-targets");
  });

  it("compliance preset includes 8 modules", () => {
    const compliance = getPresetById("compliance")!;
    expect(compliance.moduleIds).toHaveLength(8);
    expect(compliance.moduleIds).toContain("responsive");
    expect(compliance.moduleIds).toContain("manual-checklist");
  });

  it("full preset includes all 10 modules", () => {
    const full = getPresetById("full")!;
    expect(full.moduleIds).toHaveLength(10);
    expect(full.moduleIds).toContain("screen-reader");
    expect(full.moduleIds).toContain("performance");
  });

  it("getPresetById returns undefined for missing preset", () => {
    expect(getPresetById("super")).toBeUndefined();
  });

  it("regression: disabling the keyboard module actually narrows coverage (module-gating was a no-op before)", () => {
    // 2.4.7 (Focus Visible) has no axe-core rule — it's keyboard-module-only
    // coverage. Before the fix, "automated" claimed every non-manual SC
    // (including 2.4.7) regardless of which optional module ran, so this
    // set was identical with or without "keyboard".
    const withoutKeyboard = getModuleWcagCoverage(["automated", "needs-review"]);
    const withKeyboard = getModuleWcagCoverage(["automated", "needs-review", "keyboard"]);
    expect(withoutKeyboard).not.toContain("2.4.7");
    expect(withKeyboard).toContain("2.4.7");
  });

  it("getModuleWcagCoverage returns sorted unique SC ids", () => {
    const coverage = getModuleWcagCoverage(["automated", "keyboard"]);
    expect(coverage.length).toBeGreaterThan(15);
    expect(coverage[0] <= coverage[coverage.length - 1]).toBe(true);
  });

  it("totalEstimatedRuntime sums module runtimes correctly", () => {
    const quickRuntime = totalEstimatedRuntime(["automated", "needs-review", "keyboard"]);
    expect(quickRuntime).toBe(90_000);

    const fullRuntime = totalEstimatedRuntime(AUDIT_MODULES.map((m) => m.id));
    expect(fullRuntime).toBeGreaterThan(300_000);
  });

  it("formatRuntime formats 0 as —", () => {
    expect(formatRuntime(0)).toBe("—");
  });

  it("formatRuntime formats seconds only", () => {
    expect(formatRuntime(30_000)).toBe("30s");
  });

  it("formatRuntime formats minutes and seconds", () => {
    expect(formatRuntime(90_000)).toBe("1m 30s");
  });

  it("formatRuntime formats more minutes", () => {
    expect(formatRuntime(120_000)).toBe("2m 0s");
  });

  it("every preset moduleId references a real module", () => {
    const allIds = new Set(AUDIT_MODULES.map((m) => m.id));
    for (const preset of MODULE_PRESETS) {
      for (const moduleId of preset.moduleIds) {
        expect(
          allIds.has(moduleId),
          `preset ${preset.id} references unknown module ${moduleId}`
        ).toBe(true);
      }
    }
  });

  it("every module wcagScId exists in the WCAG registry", async () => {
    const { getWcagRegistry } = await import("@/engine/wcag-registry");
    const registryIds = new Set(getWcagRegistry().map((sc) => sc.id));

    for (const mod of AUDIT_MODULES) {
      for (const sc of mod.wcagScIds) {
        expect(
          registryIds.has(sc),
          `module ${mod.id} references unknown SC ${sc}`
        ).toBe(true);
      }
    }
  });

  it("optional modules are all after the first two", () => {
    expect(AUDIT_MODULES[0].optional).toBe(false);
    expect(AUDIT_MODULES[1].optional).toBe(false);
    for (let i = 2; i < AUDIT_MODULES.length; i++) {
      expect(AUDIT_MODULES[i].optional).toBe(true);
    }
  });

  it("each module has a non-empty name and description", () => {
    for (const mod of AUDIT_MODULES) {
      expect(mod.name.trim().length).toBeGreaterThan(0);
      expect(mod.description.trim().length).toBeGreaterThan(0);
      expect(mod.engine.trim().length).toBeGreaterThan(0);
    }
  });

  it("performance module has no WCAG SCs", () => {
    const perf = getModuleById("performance")!;
    expect(perf.wcagScIds).toHaveLength(0);
  });

  it("manual-checklist estimated runtime is 0", () => {
    const checklist = getModuleById("manual-checklist")!;
    expect(checklist.estimatedRuntimeMs).toBe(0);
  });

  it("getModuleWcagCoverage excludes duplicates across modules", () => {
    const coverage = getModuleWcagCoverage(["automated", "needs-review"]);
    const unique = new Set(coverage);
    expect(unique.size).toBe(coverage.length);
  });

  it("getModuleWcagCoverage with empty array returns empty", () => {
    expect(getModuleWcagCoverage([])).toHaveLength(0);
  });

  it("getModuleWcagCoverage with unknown id is graceful", () => {
    const coverage = getModuleWcagCoverage(["nonexistent"]);
    expect(coverage).toHaveLength(0);
  });

  describe("resolveModuleIds — pipeline-facing default", () => {
    it("returns the supplied list unchanged when non-empty", () => {
      expect(resolveModuleIds(["automated", "needs-review"])).toEqual([
        "automated",
        "needs-review",
      ]);
    });

    it("regression: re-adds required modules when an explicit list omits them", () => {
      // A direct API caller (bypassing the UI's ModuleSelector, which
      // already prevents unchecking required modules) sending
      // modules: ["contrast"] must not silently exclude "automated"/
      // "needs-review" from testedScIds — axe always runs regardless of
      // selection, so SCs it genuinely tested and passed would otherwise be
      // reported "manual" instead of "automated-pass".
      const ids = resolveModuleIds(["contrast"]);
      expect(ids).toContain("contrast");
      expect(ids).toContain("automated");
      expect(ids).toContain("needs-review");
    });

    it("falls back to the standard preset (+ required modules) when absent", () => {
      const ids = resolveModuleIds(undefined);
      const standard = getPresetById("standard")!;
      for (const id of standard.moduleIds) expect(ids).toContain(id);
      for (const id of getRequiredModuleIds()) expect(ids).toContain(id);
    });

    it("falls back to the standard default when given an empty array", () => {
      const ids = resolveModuleIds([]);
      expect(ids).toContain("automated");
      expect(ids).toContain("keyboard");
    });

    it("falls back to the standard default when given null", () => {
      const ids = resolveModuleIds(null);
      expect(ids).toContain("automated");
    });
  });

  describe("resolveModuleGates — which pipeline steps a module list turns on", () => {
    it("gates keyboard behind the keyboard module", () => {
      expect(resolveModuleGates(["automated"]).keyboard).toBe(false);
      expect(resolveModuleGates(["automated", "keyboard"]).keyboard).toBe(true);
    });

    it("gates the AX-tree/SR capture behind aria OR screen-reader (either enables it)", () => {
      expect(resolveModuleGates(["automated"]).axTree).toBe(false);
      expect(resolveModuleGates(["automated", "aria"]).axTree).toBe(true);
      expect(resolveModuleGates(["automated", "screen-reader"]).axTree).toBe(true);
      expect(resolveModuleGates(["automated", "aria", "screen-reader"]).axTree).toBe(true);
    });

    it("gates the responsive re-scan behind the responsive module", () => {
      expect(resolveModuleGates(["automated"]).responsive).toBe(false);
      expect(resolveModuleGates(["automated", "responsive"]).responsive).toBe(true);
    });

    it("the full preset enables every gate", () => {
      const full = getPresetById("full")!;
      const gates = resolveModuleGates(full.moduleIds);
      expect(gates.keyboard).toBe(true);
      expect(gates.axTree).toBe(true);
      expect(gates.responsive).toBe(true);
    });

    it("the quick preset only enables keyboard, not AX-tree or responsive", () => {
      const quick = getPresetById("quick")!;
      const gates = resolveModuleGates(quick.moduleIds);
      expect(gates.keyboard).toBe(true);
      expect(gates.axTree).toBe(false);
      expect(gates.responsive).toBe(false);
    });
  });
});
