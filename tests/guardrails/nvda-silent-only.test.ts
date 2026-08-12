import { describe, it, expect } from "vitest";
import {
  runNvdaChecks,
  detectSilentElements,
  INTERACTIVE_ROLES,
} from "@/lib/sr/nvda-checks";
import type { Announcement } from "@/lib/sr/nvda-types";

/**
 * Guardrail (P7 §39, ENTERPRISE_SPEC §2): the LLM never creates findings from
 * NVDA announcements, and the ONLY announcements that may become findings are
 * provably-silent *interactive* elements. Everything else — headings without a
 * level, focus-order divergence, non-interactive silence — must route to
 * needs_review (suggestions), never to a finding.
 */

function ann(overrides: Partial<Announcement> = {}): Announcement {
  return {
    at: Date.now(),
    element: "#el",
    role: "button",
    name: "Submit",
    level: null,
    spoken: "Submit, button",
    ...overrides,
  };
}

describe("guardrail: findings come ONLY from silent interactive elements", () => {
  it("never emits findings for non-interactive silent elements", () => {
    const log = [
      // silent heading (non-interactive) — must NOT be a finding
      ann({ element: "h1", role: "heading", name: "", level: 1, spoken: "heading level 1" }),
      // silent generic region (non-interactive) — must NOT be a finding
      ann({ element: "div", role: "region", name: "", spoken: "" }),
      // silent link (interactive) — the ONLY finding
      ann({ element: "#a", role: "link", name: "", spoken: "" }),
    ];

    const res = runNvdaChecks(log);
    expect(res.silentElements).toHaveLength(1);
    expect(res.silentElements[0]).toEqual({ element: "#a", role: "link" });
  });

  it("every silent element has an interactive role (invariant)", () => {
    const log = [
      ann({ element: "#b1", role: "button", name: "", spoken: "" }),
      ann({ element: "#b2", role: "button", name: "ok", spoken: "ok, button" }),
      ann({ element: "#t1", role: "textbox", name: "", spoken: "" }),
      ann({ element: "h1", role: "heading", name: "", level: 1, spoken: "heading level 1" }),
      ann({ element: "footer", role: "contentinfo", name: "", spoken: "" }),
    ];

    for (const s of detectSilentElements(log)) {
      expect(s.role).not.toBeNull();
      expect(INTERACTIVE_ROLES.has(s.role!)).toBe(true);
    }
  });

  it("headings without a level and focus-order drift are suggestions, not findings", () => {
    const log = [
      ann({ element: "#ok", role: "link", name: "Home", spoken: "Home, link" }),
      ann({ element: "h2", role: "heading", name: "No level", level: null, spoken: "No level, heading" }),
    ];

    const res = runNvdaChecks(log, ["#ok"]);
    expect(res.silentElements).toHaveLength(0);
    // The heading-level observation must be surfaced as a suggestion only.
    expect(
      res.suggestions.some((s) => s.rule_id === "nvda-heading-level-missing")
    ).toBe(true);
  });

  it("checks are pure: same input yields identical output", () => {
    const log = [
      ann({ element: "#x", role: "button", name: "", spoken: "" }),
      ann({ element: "#y", role: "link", name: "Y", spoken: "Y, link" }),
    ];
    const a = runNvdaChecks(log, ["#y"]);
    const b = runNvdaChecks(log, ["#y"]);
    expect(a).toEqual(b);
  });

  it("announcement log alone never widens the finding set (no LLM verdict path)", () => {
    // A hostile-looking log full of oddities must still only yield the one
    // provably-silent interactive element as a finding.
    const log = [
      ann({ element: "#silent", role: "switch", name: "   ", spoken: "" }),
      ann({ element: "h1", role: "heading", name: "Weird", level: null, spoken: "Weird, heading" }),
      ann({ element: "#weird", role: "link", name: "Weird phrasing!!", spoken: "Weird phrasing!!, link" }),
      ann({ element: "#b", role: "checkbox", name: "", spoken: "" }),
    ];
    const res = runNvdaChecks(log);
    expect(res.silentElements.map((s) => s.element).sort()).toEqual(["#b", "#silent"]);
    expect(res.silentElements.length).toBe(2);
  });
});
