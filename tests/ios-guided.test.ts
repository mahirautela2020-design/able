import { describe, it, expect } from "vitest";
import { IOS_GUIDED_CHECKLIST } from "@/lib/ios/guided-checklist";
import { getScById } from "@/engine/wcag-registry";

describe("ios-guided-checklist", () => {
  it("is non-empty", () => {
    expect(IOS_GUIDED_CHECKLIST.length).toBeGreaterThan(0);
  });

  it("every step explicitly requires macOS", () => {
    for (const step of IOS_GUIDED_CHECKLIST) {
      expect(step.requiresMacOs).toBe(true);
    }
  });

  it("every step maps to a real WCAG success criterion", () => {
    for (const step of IOS_GUIDED_CHECKLIST) {
      expect(getScById(step.wcagSc), `unknown SC ${step.wcagSc}`).toBeDefined();
    }
  });

  it("every step has an instruction and unique id", () => {
    const ids = new Set<string>();
    for (const step of IOS_GUIDED_CHECKLIST) {
      expect(step.id).toBeTruthy();
      expect(step.instruction).toBeTruthy();
      expect(ids.has(step.id)).toBe(false);
      ids.add(step.id);
    }
  });
});
