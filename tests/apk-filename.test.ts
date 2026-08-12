import { describe, it, expect } from "vitest";
import { sanitizeFilename } from "@/app/api/uploads/apk/route";

describe("sanitizeFilename (storage key traversal guard)", () => {
  it("strips path separators (unix)", () => {
    expect(sanitizeFilename("../../etc/passwd.apk")).toBe("passwd.apk");
  });

  it("strips path separators (windows)", () => {
    expect(sanitizeFilename("..\\..\\other\\audit\\evil.apk")).toBe("evil.apk");
  });

  it("replaces control characters and spaces", () => {
    expect(sanitizeFilename("my file v1\0.apk")).toBe("my_file_v1_.apk");
  });

  it("keeps normal filenames intact", () => {
    expect(sanitizeFilename("app-release-1.2.3.apk")).toBe("app-release-1.2.3.apk");
  });

  it("caps length at 100 chars", () => {
    const long = "a".repeat(250) + ".apk";
    expect(sanitizeFilename(long).length).toBe(100);
  });

  it("never returns an empty key for a non-empty input", () => {
    expect(sanitizeFilename("app.apk").length).toBeGreaterThan(0);
  });
});
