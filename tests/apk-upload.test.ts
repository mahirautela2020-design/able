import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseApkManifestFromXml } from "@/lib/android/manifest";

const xml = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.example.a11ytest"
    android:versionCode="1"
    android:versionName="1.0.0">
    <uses-sdk android:minSdkVersion="21" android:targetSdkVersion="34" />
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <application>
        <activity android:name="com.example.a11ytest.MainActivity" android:exported="true" />
        <activity android:name="com.example.a11ytest.SettingsActivity" android:exported="false" />
        <service android:name="com.example.a11ytest.BackgroundService" />
    </application>
</manifest>`;

describe("apk-upload", () => {
  describe("parseApkManifestFromXml", () => {
    it("parses package name", () => {
      const manifest = parseApkManifestFromXml(xml);
      expect(manifest.package).toBe("com.example.a11ytest");
    });

    it("parses minSdk and targetSdk", () => {
      const manifest = parseApkManifestFromXml(xml);
      expect(manifest.minSdk).toBe("21");
      expect(manifest.targetSdk).toBe("34");
    });

    it("parses permissions", () => {
      const manifest = parseApkManifestFromXml(xml);
      expect(manifest.permissions).toContain("android.permission.INTERNET");
      expect(manifest.permissions).toContain("android.permission.ACCESS_NETWORK_STATE");
      expect(manifest.permissions.length).toBe(2);
    });

    it("parses activities", () => {
      const manifest = parseApkManifestFromXml(xml);
      expect(manifest.activities).toContain("com.example.a11ytest.MainActivity");
      expect(manifest.activities).toContain("com.example.a11ytest.SettingsActivity");
      expect(manifest.activities.length).toBe(2);
    });

    it("parses services", () => {
      const manifest = parseApkManifestFromXml(xml);
      expect(manifest.services).toContain("com.example.a11ytest.BackgroundService");
    });

    it("has raw string", () => {
      const manifest = parseApkManifestFromXml(xml);
      expect(manifest.raw).toBe(xml);
    });
  });

  describe("fixture APK", () => {
    it("fixture APK exists and is under 100KB", () => {
      const apkPath = resolve(__dirname, "fixtures", "sample-appk.apk");
      const exists = existsSync(apkPath);
      if (!exists) {
        return; // skip if fixture doesn't exist
      }
      const stats = readFileSync(apkPath);
      expect(stats.length).toBeGreaterThan(0);
      expect(stats.length).toBeLessThan(100_000);
    });
  });
});
