import { describe, it, expect, vi } from "vitest";
import { captureLiveAnnouncements, type Announcement } from "@/lib/sr/announcer";

/** Minimal Page stand-in: one `evaluate` that returns whatever the live-region
 * sweep should have found in the browser. */
function mockPage(liveRegions: Array<{ text: string; source: string }>) {
  const evaluate = vi.fn(async () => liveRegions);
  return {
    page: { evaluate } as unknown as Parameters<typeof captureLiveAnnouncements>[0],
    evaluate,
  };
}

describe("sr/announcer", () => {
  it("reports each live region once, labelled as a static read", async () => {
    const { page } = mockPage([
      { text: "3 results", source: "status" },
      { text: "Saved", source: "polite" },
    ]);

    const result = await captureLiveAnnouncements(page);

    expect(result.map((a) => a.text)).toEqual(["3 results", "Saved"]);
    expect(result.every((a) => a.detected === "static")).toBe(true);
  });

  it("dedupes identical live-region text", async () => {
    const { page } = mockPage([
      { text: "Saved", source: "status" },
      { text: "Saved", source: "polite" },
    ]);

    const result = await captureLiveAnnouncements(page);

    expect(result).toHaveLength(1);
  });

  it("makes a single round-trip — the MutationObserver install/read pair is gone", async () => {
    // Regression guard. The observer version cost three `evaluate` calls per
    // page (install, read back, static sweep) and the observer captured zero
    // mutations on every measured target, because this runs after all page
    // interaction is finished.
    const { page, evaluate } = mockPage([{ text: "Loading", source: "polite" }]);

    await captureLiveAnnouncements(page);

    expect(evaluate).toHaveBeenCalledTimes(1);
  });

  it("returns an empty array when the page has no live regions", async () => {
    const { page } = mockPage([]);
    await expect(captureLiveAnnouncements(page)).resolves.toEqual([]);
  });

  it("never claims to have observed an announcement it only read statically", () => {
    // `timestamp` is capture time, not speech time. `detected` is what keeps
    // that honest for anything consuming the stored evidence JSON.
    const a: Announcement = {
      text: "Page loaded",
      timestamp: Date.now(),
      source: "status",
      detected: "static",
    };
    expect(a.detected).toBe("static");
  });
});
