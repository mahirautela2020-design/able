import { describe, it, expect } from "vitest";
import { parseIpa, IpaParseError } from "@/lib/ios/ipa";
import { runIosChecks } from "@/lib/ios/checks";
import { buildIpa, buildIpaBinary } from "./helpers/ipa-fixture";

const COMPLETE_PLIST: Record<string, unknown> = {
  CFBundleIdentifier: "com.example.a11ytest",
  CFBundleDisplayName: "A11y Test",
  CFBundleShortVersionString: "1.2.3",
  CFBundleVersion: "42",
  MinimumOSVersion: "15.0",
  UILaunchStoryboardName: "LaunchScreen",
  CFBundleLocalizations: ["en", "fr", "de"],
  UIAccessibilitySpeechEnabled: true,
};

const COMPLETE_ICONS = {
  "AppIcon60x60@2x.png": Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  "AppIcon60x60@3x.png": Buffer.from([0x89, 0x50, 0x4e, 0x47]),
};

describe("ios-ipa parse", () => {
  it("parses an XML-plist .ipa into a bundle", async () => {
    const buf = await buildIpa(COMPLETE_PLIST, { files: COMPLETE_ICONS });
    const bundle = await parseIpa(buf);

    expect(bundle.plistReadable).toBe(true);
    expect(bundle.bundleId).toBe("com.example.a11ytest");
    expect(bundle.displayName).toBe("A11y Test");
    expect(bundle.version).toBe("1.2.3");
    expect(bundle.build).toBe("42");
    expect(bundle.minimumOsVersion).toBe("15.0");
    expect(bundle.launchStoryboard).toBe("LaunchScreen");
    expect(bundle.localizations).toEqual(["en", "fr", "de"]);
  });

  it("parses a binary-plist .ipa into the same bundle", async () => {
    const buf = await buildIpaBinary(COMPLETE_PLIST, { files: COMPLETE_ICONS });
    const bundle = await parseIpa(buf);

    expect(bundle.plistReadable).toBe(true);
    expect(bundle.bundleId).toBe("com.example.a11ytest");
    expect(bundle.displayName).toBe("A11y Test");
    expect(bundle.localizations).toEqual(["en", "fr", "de"]);
    expect(bundle.minimumOsVersion).toBe("15.0");
  });

  it("detects @2x and @3x icon variants and Assets.car", async () => {
    const buf = await buildIpa(COMPLETE_PLIST, {
      files: { ...COMPLETE_ICONS, "Assets.car": Buffer.from([0x01]) },
    });
    const bundle = await parseIpa(buf);

    expect(bundle.iconNames2x).toContain("AppIcon60x60");
    expect(bundle.iconNames3x).toContain("AppIcon60x60");
    expect(bundle.hasAssetsCar).toBe(true);
  });

  it("collects accessibility-related plist keys", async () => {
    const buf = await buildIpa(COMPLETE_PLIST, { files: COMPLETE_ICONS });
    const bundle = await parseIpa(buf);

    expect(bundle.accessibilityKeys).toContain("UIAccessibilitySpeechEnabled");
  });

  it("throws IpaParseError when no Payload/*.app/ is present", async () => {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    zip.file("readme.txt", "not an app");
    const buf = Buffer.from(await zip.generateAsync({ type: "uint8array" }));

    await expect(parseIpa(buf)).rejects.toThrow(IpaParseError);
  });

  it("throws IpaParseError for a non-zip buffer", async () => {
    await expect(parseIpa(Buffer.from("this is not a zip"))).rejects.toThrow(IpaParseError);
  });

  it("degrades to plistReadable=false for an unreadable plist", async () => {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    zip.file("Payload/Fake.app/Info.plist", Buffer.from([0xff, 0xfe, 0x00, 0x01]));
    zip.file("Payload/Fake.app/", null, { dir: true });
    const buf = Buffer.from(await zip.generateAsync({ type: "uint8array" }));

    const bundle = await parseIpa(buf);
    expect(bundle.plistReadable).toBe(false);
    expect(runIosChecks(bundle)).toEqual([]);
  });
});

describe("ios-ipa checks", () => {
  it("produces needs_review findings for a minimal bundle", async () => {
    const buf = await buildIpa({ CFBundleIdentifier: "com.example.min" });
    const bundle = await parseIpa(buf);
    const findings = runIosChecks(bundle);

    expect(findings.length).toBe(4);
    expect(findings.every((f) => f.severity === "needs_review")).toBe(true);
    expect(findings.every((f) => f.source === "ios-static")).toBe(true);
    expect(findings.map((f) => f.criterion)).toEqual(
      expect.arrayContaining(["1.3.1", "3.1.1", "2.2.2", "1.4.11"])
    );
  });

  it("produces zero findings for a complete bundle", async () => {
    const buf = await buildIpa(COMPLETE_PLIST, { files: COMPLETE_ICONS });
    const bundle = await parseIpa(buf);
    expect(runIosChecks(bundle)).toEqual([]);
  });

  it("flags a missing @3x variant as an icon-completeness review", async () => {
    const buf = await buildIpa(COMPLETE_PLIST, {
      files: { "AppIcon60x60@2x.png": Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
    });
    const bundle = await parseIpa(buf);
    const findings = runIosChecks(bundle);

    expect(findings).toHaveLength(1);
    expect(findings[0]!.criterion).toBe("1.4.11");
    expect(findings[0]!.severity).toBe("needs_review");
  });

  it("never emits a hard violation", async () => {
    const buf = await buildIpa({ CFBundleIdentifier: "com.example.min" });
    const bundle = await parseIpa(buf);
    for (const f of runIosChecks(bundle)) {
      expect(f.severity).toBe("needs_review");
    }
  });
});
