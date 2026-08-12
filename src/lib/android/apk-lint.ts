export interface ApkLintFinding {
  rule_id: string;
  severity: "error" | "warning" | "info";
  file: string;
  line: number;
  message: string;
}

export async function runApkLint(filePath: string): Promise<ApkLintFinding[]> {
  const findings: ApkLintFinding[] = [];

  try {
    const aapt2Path = process.env.AAPT2_PATH || "aapt2";
    if (!aapt2Path) {
      return [];
    }

    const { execSync } = await import("node:child_process");

    try {
      const dumpOutput = execSync(
        `${JSON.stringify(aapt2Path)} dump badging ${JSON.stringify(filePath)}`,
        { timeout: 30_000, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
      );

      findings.push(...parseAapt2Badging(dumpOutput));
    } catch {
      // aapt2 may not be installed or dump may fail
    }

    try {
      const manifestXml = execSync(
        `${JSON.stringify(aapt2Path)} dump xmltree ${JSON.stringify(filePath)} --file AndroidManifest.xml`,
        { timeout: 30_000, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
      );

      findings.push(...lintManifest(manifestXml));
    } catch {
      // manifest dump failed
    }

    return findings;
  } catch {
    return [];
  }
}

function parseAapt2Badging(output: string): ApkLintFinding[] {
  const findings: ApkLintFinding[] = [];

  if (!output.includes("package:")) {
    findings.push({
      rule_id: "android-badging-parse",
      severity: "error",
      file: "aapt2-output",
      line: 0,
      message: "Failed to parse APK badging output",
    });
  }

  const sdkMatch = output.match(/sdkVersion:\s*'(\d+)'/);
  if (sdkMatch && parseInt(sdkMatch[1], 10) < 21) {
    findings.push({
      rule_id: "android-minsdk-low",
      severity: "warning",
      file: "AndroidManifest.xml",
      line: 0,
      message: `minSdkVersion ${sdkMatch[1]} is below 21; consider raising for accessibility API support`,
    });
  }

  const targetSdkMatch = output.match(/targetSdkVersion:\s*'(\d+)'/);
  if (targetSdkMatch && parseInt(targetSdkMatch[1], 10) < 33) {
    findings.push({
      rule_id: "android-targetsdk-low",
      severity: "warning",
      file: "AndroidManifest.xml",
      line: 0,
      message: `targetSdkVersion ${targetSdkMatch[1]} is below 33; newer APIs improve a11y support`,
    });
  }

  return findings;
}

function lintManifest(xml: string): ApkLintFinding[] {
  const findings: ApkLintFinding[] = [];

  const hasAccessibility = xml.includes("android.permission.ACCESSIBILITY") ||
    xml.includes("accessibility");
  if (!hasAccessibility && xml.includes("<application")) {
    findings.push({
      rule_id: "android-accessibility-missing",
      severity: "info",
      file: "AndroidManifest.xml",
      line: 0,
      message: "No accessibility-related declarations found in manifest",
    });
  }

  const hasLabelFor = xml.includes("labelFor") || xml.includes("contentDescription");
  if (!hasLabelFor) {
    findings.push({
      rule_id: "android-content-description-missing",
      severity: "warning",
      file: "AndroidManifest.xml",
      line: 0,
      message: "No contentDescription or labelFor attributes detected in manifest dump",
    });
  }

  return findings;
}
