import { readFileSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

export interface AndroidManifest {
  package?: string;
  minSdk?: string;
  targetSdk?: string;
  versionCode?: string;
  versionName?: string;
  permissions: string[];
  activities: string[];
  services: string[];
  receivers: string[];
  raw: string;
}

function parseManifestXml(xml: string): AndroidManifest {
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

function extractApk(filePath: string): string {
  const aapt2Path = process.env.AAPT2_PATH || "aapt2";
  const sandboxDir = mkdtempSync(join(tmpdir(), "apk-extract-"));

  try {
    const xmlPath = join(sandboxDir, "AndroidManifest.xml");
    execSync(
      `${JSON.stringify(aapt2Path)} dump xmltree ${JSON.stringify(filePath)} --file AndroidManifest.xml > ${JSON.stringify(xmlPath)}`,
      { timeout: 30_000 }
    );

    if (existsSync(xmlPath)) {
      return readFileSync(xmlPath, "utf-8");
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
    const xml = extractApk(filePath);
    if (!xml) return null;
    return parseManifestXml(xml);
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

export function parseApkManifestFromXml(xml: string): AndroidManifest {
  return parseManifestXml(xml);
}
