import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, resetRateLimit, clearAllRateLimits } from "@/lib/enterprise/ratelimit";

describe("ratelimit", () => {
  beforeEach(() => {
    clearAllRateLimits();
  });

  it("allows requests within the limit", () => {
    for (let i = 0; i < 60; i++) {
      const result = checkRateLimit("key-1", 60, 60_000);
      expect(result.allowed).toBe(true);
    }
  });

  it("blocks after limit exceeded", () => {
    for (let i = 0; i < 60; i++) {
      checkRateLimit("key-2", 60, 60_000);
    }
    const result = checkRateLimit("key-2", 60, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("reports correct remaining count", () => {
    checkRateLimit("key-3", 10, 60_000);
    checkRateLimit("key-3", 10, 60_000);
    const result = checkRateLimit("key-3", 10, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(7);
  });

  it("different keys have independent limits", () => {
    for (let i = 0; i < 60; i++) {
      checkRateLimit("key-a", 60, 60_000);
    }
    const resultA = checkRateLimit("key-a", 60, 60_000);
    expect(resultA.allowed).toBe(false);

    const resultB = checkRateLimit("key-b", 60, 60_000);
    expect(resultB.allowed).toBe(true);
  });

  it("resetRateLimit clears a specific key", () => {
    for (let i = 0; i < 60; i++) {
      checkRateLimit("key-4", 60, 60_000);
    }
    resetRateLimit("key-4");
    const result = checkRateLimit("key-4", 60, 60_000);
    expect(result.allowed).toBe(true);
  });

  it("clearAllRateLimits resets all keys", () => {
    for (let i = 0; i < 60; i++) {
      checkRateLimit("key-5", 60, 60_000);
      checkRateLimit("key-6", 60, 60_000);
    }
    clearAllRateLimits();
    expect(checkRateLimit("key-5", 60, 60_000).allowed).toBe(true);
    expect(checkRateLimit("key-6", 60, 60_000).allowed).toBe(true);
  });

  it("provides resetAt timestamp", () => {
    const result = checkRateLimit("key-7", 1, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.resetAt).toBeGreaterThan(Date.now());
  });
});
