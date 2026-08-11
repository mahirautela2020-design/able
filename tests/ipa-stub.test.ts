import { describe, it, expect } from "vitest";
import { parseIpaManifestStub } from "@/lib/ios/manifest";

describe("ipa-stub", () => {
  describe("parseIpaManifestStub", () => {
    it("returns gracefully with empty arrays", () => {
      const manifest = parseIpaManifestStub();
      expect(manifest.supportedPlatforms).toEqual([]);
      expect(manifest.capabilities).toEqual([]);
    });

    it("marks stub in raw", () => {
      const manifest = parseIpaManifestStub();
      expect(manifest.raw).toHaveProperty("stub", true);
    });
  });

  describe("parseIpaManifest", () => {
    it("returns null for unparseable paths (stub)", async () => {
      const { parseIpaManifest } = await import("@/lib/ios/manifest");
      const result = parseIpaManifest("/nonexistent/test.ipa");
      expect(result).toBeNull();
    });
  });
});
