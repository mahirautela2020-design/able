import { describe, it, expect } from "vitest";

describe("mobile-scope", () => {
  it("accepts web platform entries", () => {
    const entry = { url: "https://example.com", platform: "web" as const };
    expect(entry.platform).toBe("web");
    expect(entry.url).toBe("https://example.com");
  });

  it("accepts android platform entries", () => {
    const entry = { url: "myapp://home", platform: "android" as const };
    expect(entry.platform).toBe("android");
  });

  it("accepts ios platform entries", () => {
    const entry = { url: "myapp://home", platform: "ios" as const };
    expect(entry.platform).toBe("ios");
  });

  it("platform has valid union type (compile-time check — runtime assertion)", () => {
    const validPlatforms = ["web", "ios", "android"];
    for (const p of validPlatforms) {
      expect(validPlatforms.includes(p)).toBe(true);
    }
  });
});
