import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  detectSilentElements,
  checkHeadingLevels,
  checkFocusOrder,
  redactSpokenText,
  runNvdaChecks,
  INTERACTIVE_ROLES,
} from "@/lib/sr/nvda-checks";
import { detectNvda, NvdaDriver } from "@/lib/sr/nvda-driver";
import { captureNvdaAnnouncements } from "@/lib/sr/nvda-snapshot";
import { withPage } from "@/engine/browser";
import type { Announcement } from "@/lib/sr/nvda-types";

const hasChrome = !!process.env.CHROME_EXECUTABLE_PATH;

const fixtureUrl = (name: string) => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  return `file:///${path.join(dir, "fixtures", name).replace(/\\/g, "/")}`;
};

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

describe("nvda-checks (fixture data, no NVDA required)", () => {
  it("flags interactive elements with empty accessible name as silent", () => {
    const log = [
      ann({ element: "#ok", role: "button", name: "Save", spoken: "Save, button" }),
      ann({ element: "#empty", role: "button", name: "", spoken: "" }),
      ann({ element: "#link", role: "link", name: null, spoken: "link" }),
      // non-interactive with empty name must NOT be flagged
      ann({ element: "h1", role: "heading", name: "", spoken: "heading level 1", level: 1 }),
    ];

    const silent = detectSilentElements(log);
    expect(silent).toHaveLength(2);
    expect(silent.map((s) => s.element).sort()).toEqual(["#empty", "#link"]);
  });

  it("does not flag named interactive elements", () => {
    const log = [
      ann({ element: "#a", role: "textbox", name: "Email", spoken: "Email, textbox" }),
      ann({ element: "#b", role: "checkbox", name: "Agree", spoken: "Agree, checkbox" }),
    ];
    expect(detectSilentElements(log)).toHaveLength(0);
  });

  it("parses heading level presence", () => {
    const log = [
      ann({ element: "h1", role: "heading", name: "Title", level: 1, spoken: "Title, heading level 1" }),
      ann({ element: "h2", role: "heading", name: "Section", level: null, spoken: "Section, heading" }),
    ];
    const res = checkHeadingLevels(log);
    expect(res.allAnnounced).toBe(false);
    expect(res.missing.map((m) => m.element)).toEqual(["h2"]);
  });

  it("reports heading levels all announced when every heading has a level", () => {
    const log = [
      ann({ element: "h1", role: "heading", name: "Title", level: 1, spoken: "Title, heading level 1" }),
      ann({ element: "h2", role: "heading", name: "Section", level: 2, spoken: "Section, heading level 2" }),
    ];
    expect(checkHeadingLevels(log).allAnnounced).toBe(true);
  });

  it("matches focus order against DOM tab order", () => {
    const log = [
      ann({ element: "#a", role: "link", name: "A", spoken: "A, link" }),
      ann({ element: "#b", role: "link", name: "B", spoken: "B, link" }),
    ];
    const ok = checkFocusOrder(log, ["#a", "#b"]);
    expect(ok.matches).toBe(true);

    const bad = checkFocusOrder(log, ["#b", "#a"]);
    expect(bad.matches).toBe(false);
    expect(bad.mismatches.length).toBeGreaterThan(0);
  });

  it("redacts spoken values to a mask of equal length", () => {
    expect(redactSpokenText("secret")).toBe("\u2605".repeat(6));
    expect(redactSpokenText("")).toBe("");
  });

  it("buckets ONLY silent interactive elements as findings; rest are suggestions", () => {
    const log = [
      ann({ element: "#silent", role: "button", name: "", spoken: "" }),
      ann({ element: "h2", role: "heading", name: "No level", level: null, spoken: "No level, heading" }),
      ann({ element: "#b", role: "link", name: "B", spoken: "B, link" }),
    ];
    const res = runNvdaChecks(log, ["#b"]);

    // findings bucket = silentElements only
    expect(res.silentElements).toHaveLength(1);
    expect(res.silentElements[0].element).toBe("#silent");

    // heading-level + focus-order issues are suggestions, never findings
    expect(res.headingLevelsAnnounced).toBe(false);
    expect(res.headingsMissingLevel).toHaveLength(1);
    const ruleIds = res.suggestions.map((s) => s.rule_id);
    expect(ruleIds).toContain("nvda-heading-level-missing");
    expect(ruleIds).toContain("nvda-focus-order-mismatch");
  });

  it("exposes the interactive-role allowlist", () => {
    expect(INTERACTIVE_ROLES.has("button")).toBe(true);
    expect(INTERACTIVE_ROLES.has("heading")).toBe(false);
  });
});

describe("nvda-driver (graceful degradation, no NVDA required)", () => {
  it("detectNvda returns a well-formed availability object and never throws", () => {
    const res = detectNvda();
    expect(typeof res.available).toBe("boolean");
    expect(res).toHaveProperty("path");
    expect(res).toHaveProperty("reason");
  });

  it("NvdaDriver with no path is unavailable and speak() returns ok:false", async () => {
    const driver = new NvdaDriver(null);
    expect(driver.available).toBe(false);
    const res = await driver.speak("hello");
    expect(res.ok).toBe(false);
  });

  it("NvdaDriver disconnect is safe to call when never connected", () => {
    const driver = new NvdaDriver(null);
    expect(() => driver.disconnect()).not.toThrow();
  });
});

describe("nvda-snapshot (browser)", () => {
  it.skipIf(!hasChrome)(
    "captures announcements from a real page without NVDA installed",
    async () => {
      const result = await withPage(async (page) => {
        await page.goto(fixtureUrl("sr-test.html"), {
          waitUntil: "domcontentloaded",
          timeout: 20_000,
        });
        return captureNvdaAnnouncements(page);
      });

      expect(result.available).toBe(false);
      expect(result.announcements.length).toBeGreaterThan(0);

      const checks = runNvdaChecks(result.announcements);
      // The fixture has named links + labelled button + headed sections.
      expect(checks.silentElements).toHaveLength(0);
    },
  );

  it.skipIf(
    !hasChrome || process.env.P7_NVDA_E2E !== "1" || !detectNvda().available
  )(
    "drives a live NVDA instance when present",
    async () => {
      const detected = detectNvda();
      const driver = new NvdaDriver(detected.path);
      const result = await withPage(async (page) => {
        await page.goto(fixtureUrl("sr-test.html"), {
          waitUntil: "domcontentloaded",
          timeout: 20_000,
        });
        return captureNvdaAnnouncements(page, { driver });
      });
      expect(result.available).toBe(true);
      expect(result.announcements.length).toBeGreaterThan(0);
    },
  );
});
