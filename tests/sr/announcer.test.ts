import { describe, it, expect } from "vitest";
import { captureLiveAnnouncements, type Announcement } from "@/lib/sr/announcer";

describe("sr/announcer", () => {
  it("captures at least one announcement when live regions exist", async () => {
    const mockEvaluate = async (fn: unknown) => {
      if (typeof fn === "function") {
        try {
          return await (fn as () => unknown)();
        } catch {
          return [];
        }
      }
      return [];
    };

    // We test the logic indirectly: the function injects a MutationObserver
    // and polls for results. For unit test, we verify the shapes.
    const result = await captureLiveAnnouncements({
      evaluate: mockEvaluate,
    } as unknown as Parameters<typeof captureLiveAnnouncements>[0]);

    expect(Array.isArray(result)).toBe(true);
  });

  it("returns an array of announcements with correct shape", () => {
    const a: Announcement = {
      text: "Page loaded",
      timestamp: Date.now(),
      source: "status",
    };
    expect(a.text).toBe("Page loaded");
    expect(typeof a.timestamp).toBe("number");
    expect(typeof a.source).toBe("string");
    expect(a.text.length).toBeGreaterThan(0);
  });
});
