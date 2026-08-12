import { describe, it, expect } from "vitest";
import { checkApkSize, MAX_APK_SIZE_MB } from "@/app/api/uploads/apk/route";

const MB = 1024 * 1024;

describe("apk-upload size cap (RISKS #3 — size bomb guard)", () => {
  it("accepts files under the cap", () => {
    expect(checkApkSize(10 * MB).ok).toBe(true);
  });

  it("accepts a file exactly at the cap boundary", () => {
    expect(checkApkSize(MAX_APK_SIZE_MB * MB).ok).toBe(true);
  });

  it("rejects files over the cap with a 413-able error message", () => {
    const result = checkApkSize((MAX_APK_SIZE_MB + 1) * MB);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/exceeds 200MB limit/);
  });

  it("rejects a 1GB upload", () => {
    expect(checkApkSize(1024 * MB).ok).toBe(false);
  });

  it("rejects a 200MB+1byte upload", () => {
    expect(checkApkSize(MAX_APK_SIZE_MB * MB + 1).ok).toBe(false);
  });
});
