import { describe, it, expect } from "vitest";
import { getClientIp } from "@/lib/http";

describe("getClientIp", () => {
  it("returns the first address from x-forwarded-for", () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("trims whitespace around the first address", () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": " 1.2.3.4 , 5.6.7.8" },
    });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const req = new Request("http://localhost", { headers: { "x-real-ip": "9.9.9.9" } });
    expect(getClientIp(req)).toBe("9.9.9.9");
  });

  it("returns null when neither header is present", () => {
    const req = new Request("http://localhost");
    expect(getClientIp(req)).toBeNull();
  });
});
