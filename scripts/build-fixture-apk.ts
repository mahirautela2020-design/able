// Builds a minimal fixture APK for P4 tests.
// APK format is just a ZIP with AndroidManifest.xml inside.
// Size target: <100KB. This script uses Node.js built-ins — no Android toolchain needed.
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const FIXTURE_DIR = join(import.meta.dirname, "..", "tests", "fixtures");
const APK_PATH = join(FIXTURE_DIR, "sample-appk.apk");
const TMP_DIR = join(FIXTURE_DIR, ".apk-build");

if (existsSync(TMP_DIR)) {
  rmSync(TMP_DIR, { recursive: true, force: true });
}
mkdirSync(TMP_DIR, { recursive: true });

const manifestXml = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.example.a11ytest"
    android:versionCode="1"
    android:versionName="1.0.0">

    <uses-sdk
        android:minSdkVersion="21"
        android:targetSdkVersion="34" />

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

    <application
        android:label="A11y Test App"
        android:theme="@android:style/Theme.Material.Light">

        <activity
            android:name="com.example.a11ytest.MainActivity"
            android:label="Main"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <activity
            android:name="com.example.a11ytest.SettingsActivity"
            android:label="Settings"
            android:exported="false" />

        <service
            android:name="com.example.a11ytest.BackgroundService"
            android:exported="false" />

    </application>
</manifest>
`;

writeFileSync(join(TMP_DIR, "AndroidManifest.xml"), manifestXml);

// Build APK using Node.js ZIP or fall back to system zip
try {
  execSync(`powershell -Command "Compress-Archive -Path '${TMP_DIR}\\*' -DestinationPath '${APK_PATH}' -Force"`, {
    encoding: "utf-8",
    timeout: 10_000,
  });
} catch {
  // PowerShell may not have Compress-Archive available; try a manual minimal ZIP
  // Create a minimal ZIP with just the manifest
  const manifestContent = Buffer.from(manifestXml, "utf-8");
  const manifestName = Buffer.from("AndroidManifest.xml", "utf-8");

  // ZIP local file header + compressed data + central directory + end record
  // Using "store" (no compression) for simplicity
  const crc32 = crc32FromBuffer(manifestContent);

  const localHeader = Buffer.alloc(30 + manifestName.length + manifestContent.length);
  let offset = 0;
  localHeader.writeUInt32LE(0x04034b50, offset); offset += 4; // local file header signature
  localHeader.writeUInt16LE(20, offset); offset += 2; // version needed
  localHeader.writeUInt16LE(0, offset); offset += 2; // general purpose bit flag
  localHeader.writeUInt16LE(0, offset); offset += 2; // compression method (store)
  localHeader.writeUInt16LE(0, offset); offset += 2; // last mod time
  localHeader.writeUInt16LE(0, offset); offset += 2; // last mod date
  localHeader.writeUInt32LE(crc32, offset); offset += 4; // crc-32
  localHeader.writeUInt32LE(manifestContent.length, offset); offset += 4; // compressed size
  localHeader.writeUInt32LE(manifestContent.length, offset); offset += 4; // uncompressed size
  localHeader.writeUInt16LE(manifestName.length, offset); offset += 2; // file name length
  localHeader.writeUInt16LE(0, offset); offset += 2; // extra field length
  manifestName.copy(localHeader, offset); offset += manifestName.length;
  manifestContent.copy(localHeader, offset); offset += manifestContent.length;

  const localHeaderOffset = 0;

  const centralDir = Buffer.alloc(46 + manifestName.length);
  offset = 0;
  centralDir.writeUInt32LE(0x02014b50, offset); offset += 4; // central dir signature
  centralDir.writeUInt16LE(20, offset); offset += 2; // version made by
  centralDir.writeUInt16LE(20, offset); offset += 2; // version needed
  centralDir.writeUInt16LE(0, offset); offset += 2; // general purpose bit flag
  centralDir.writeUInt16LE(0, offset); offset += 2; // compression method
  centralDir.writeUInt16LE(0, offset); offset += 2; // last mod time
  centralDir.writeUInt16LE(0, offset); offset += 2; // last mod date
  centralDir.writeUInt32LE(crc32, offset); offset += 4; // crc-32
  centralDir.writeUInt32LE(manifestContent.length, offset); offset += 4; // compressed size
  centralDir.writeUInt32LE(manifestContent.length, offset); offset += 4; // uncompressed size
  centralDir.writeUInt16LE(manifestName.length, offset); offset += 2; // file name length
  centralDir.writeUInt16LE(0, offset); offset += 2; // extra field length
  centralDir.writeUInt16LE(0, offset); offset += 2; // file comment length
  centralDir.writeUInt16LE(0, offset); offset += 2; // disk number start
  centralDir.writeUInt16LE(0, offset); offset += 2; // internal file attributes
  centralDir.writeUInt32LE(0, offset); offset += 4; // external file attributes
  centralDir.writeUInt32LE(localHeaderOffset, offset); offset += 4; // relative offset of local header
  manifestName.copy(centralDir, offset);
  offset += manifestName.length;

  const centralDirOffset = localHeader.length;

  const eocd = Buffer.alloc(22);
  offset = 0;
  eocd.writeUInt32LE(0x06054b50, offset); offset += 4; // end of central dir signature
  eocd.writeUInt16LE(0, offset); offset += 2; // disk number
  eocd.writeUInt16LE(0, offset); offset += 2; // disk with central dir
  eocd.writeUInt16LE(1, offset); offset += 2; // entries on this disk
  eocd.writeUInt16LE(1, offset); offset += 2; // total entries
  eocd.writeUInt32LE(centralDir.length, offset); offset += 4; // size of central dir
  eocd.writeUInt32LE(centralDirOffset, offset); offset += 4; // offset of central dir
  eocd.writeUInt16LE(0, offset); // comment length

  const apkBuffer = Buffer.concat([localHeader, centralDir, eocd]);
  writeFileSync(APK_PATH, apkBuffer);
}

// Verify size
if (existsSync(APK_PATH)) {
  const sizeKb = statSync(APK_PATH).size / 1024;
  console.log(`Created ${APK_PATH} (${sizeKb.toFixed(1)} KB)`);
  if (statSync(APK_PATH).size > 100_000) {
    console.warn(`WARNING: fixture APK is ${sizeKb.toFixed(1)}KB (target: <100KB). Consider regenerating.`);
  }
} else {
  console.error("Failed to create APK fixture");
  process.exit(1);
}

rmSync(TMP_DIR, { recursive: true, force: true });

function crc32FromBuffer(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ 0xedb88320;
      } else {
        crc = crc >>> 1;
      }
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
