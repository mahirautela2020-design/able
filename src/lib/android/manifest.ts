export interface AndroidManifest {
  package?: string;
  versionCode?: string;
  versionName?: string;
  minSdk?: string;
  targetSdk?: string;
  permissions: string[];
  activities: string[];
  services: string[];
  receivers: string[];
  raw: string;
}

/**
 * Parse aapt2 "dump badging" output — the standard, stable text format:
 *   package: name='com.example.app' versionCode='9' versionName='1.0'
 *   sdkVersion:'26'
 *   targetSdkVersion:'36'
 *   uses-permission: name='android.permission.INTERNET'
 *   launchable-activity: name='com.example.MainActivity' ...
 */
function parseBadging(badging: string): AndroidManifest {
  const manifest: AndroidManifest = {
    permissions: [],
    activities: [],
    services: [],
    receivers: [],
    raw: badging,
  };

  const packageMatch = badging.match(/package:\s*name='([^']+)'/);
  if (packageMatch) manifest.package = packageMatch[1];

  const versionCodeMatch = badging.match(/versionCode='(\d+)'/);
  if (versionCodeMatch) manifest.versionCode = versionCodeMatch[1];

  const versionNameMatch = badging.match(/versionName='([^']+)'/);
  if (versionNameMatch) manifest.versionName = versionNameMatch[1];

  const sdkMatch = badging.match(/^sdkVersion:'(\d+)'/m);
  if (sdkMatch) manifest.minSdk = sdkMatch[1];

  const targetSdkMatch = badging.match(/^targetSdkVersion:'(\d+)'/m);
  if (targetSdkMatch) manifest.targetSdk = targetSdkMatch[1];

  const permRegex = /^uses-permission:\s*name='([^']+)'/gm;
  let permMatch: RegExpExecArray | null;
  while ((permMatch = permRegex.exec(badging)) !== null) {
    manifest.permissions.push(permMatch[1]);
  }

  const activityRegex = /^launchable-activity:\s*name='([^']+)'/gm;
  let activityMatch: RegExpExecArray | null;
  while ((activityMatch = activityRegex.exec(badging)) !== null) {
    manifest.activities.push(activityMatch[1]);
  }

  // aapt2 badging doesn't enumerate all services/receivers — leave empty
  // rather than guess; full manifest XML stays available via xmltree.

  return manifest;
}

function extractBadging(filePath: string): string {
  const aapt2Path = process.env.AAPT2_PATH || "aapt2";
  const sandboxDir = mkdtempSync(join(tmpdir(), "apk-badging-"));

  try {
    const outPath = join(sandboxDir, "badging.txt");
    execSync(
      `${JSON.stringify(aapt2Path)} dump badging ${JSON.stringify(
        filePath
      )} > ${JSON.stringify(outPath)}`,
      { timeout: 30_000 }
    );

    if (existsSync(outPath)) {
      return readFileSync(outPath, "utf-8");
    }
    return "";
  } finally {
    try {
      rmSync(sandboxDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
}

export function parseApkManifest(filePath: string): AndroidManifest | null {
  try {
    const badging = extractBadging(filePath);
    if (!badging) return null;
    return parseBadging(badging);
  } catch {
    return null;
  }
}

export function parseApkManifestFromBuffer(buffer: Buffer): AndroidManifest | null {
  const sandboxDir = mkdtempSync(join(tmpdir(), "apk-parse-"));

  try {
    const apkPath = join(sandboxDir, "app.apk");
    writeFileSync(apkPath, buffer);
    return parseApkManifest(apkPath);
  } finally {
    try {
      rmSync(sandboxDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
}

// Legacy: parse raw AndroidManifest.xml text (used by tests / xmltree flow).
export function parseApkManifestFromXml(xml: string): AndroidManifest {
  const manifest: AndroidManifest = {
    permissions: [],
    activities: [],
    services: [],
    receivers: [],
    raw: xml,
  };

  const packageMatch = xml.match(/package\s*=\s*"([^"]+)"/);
  if (packageMatch) manifest.package = packageMatch[1];

  const versionCodeMatch = xml.match(/android:versionCode\s*=\s*"([^"]+)"/);
  if (versionCodeMatch) manifest.versionCode = versionCodeMatch[1];

  const versionNameMatch = xml.match(/android:versionName\s*=\s*"([^"]+)"/);
  if (versionNameMatch) manifest.versionName = versionNameMatch[1];

  const usesSdkMatch = xml.match(/<uses-sdk[^>]*\/>/);
  if (usesSdkMatch) {
    const minMatch = usesSdkMatch[0].match(/android:minSdkVersion\s*=\s*"(\d+)"/);
    if (minMatch) manifest.minSdk = minMatch[1];

    const targetMatch = usesSdkMatch[0].match(/android:targetSdkVersion\s*=\s*"(\d+)"/);
    if (targetMatch) manifest.targetSdk = targetMatch[1];
  }

  const permRegex = /<uses-permission\s+android:name\s*=\s*"([^"]+)"/g;
  let permMatch: RegExpExecArray | null;
  while ((permMatch = permRegex.exec(xml)) !== null) {
    manifest.permissions.push(permMatch[1]);
  }

  const activityRegex = /<activity[^>]*android:name\s*=\s*"([^"]+)"/g;
  let activityMatch: RegExpExecArray | null;
  while ((activityMatch = activityRegex.exec(xml)) !== null) {
    manifest.activities.push(activityMatch[1]);
  }

  const serviceRegex = /<service[^>]*android:name\s*=\s*"([^"]+)"/g;
  let serviceMatch: RegExpExecArray | null;
  while ((serviceMatch = serviceRegex.exec(xml)) !== null) {
    manifest.services.push(serviceMatch[1]);
  }

  const receiverRegex = /<receiver[^>]*android:name\s*=\s*"([^"]+)"/g;
  let receiverMatch: RegExpExecArray | null;
  while ((receiverMatch = receiverRegex.exec(xml)) !== null) {
    manifest.receivers.push(receiverMatch[1]);
  }

  return manifest;
}

import { execSync } from "child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
