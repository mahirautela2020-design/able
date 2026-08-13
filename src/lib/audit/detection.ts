import { spawn } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import type { DetectedElement } from "@/lib/audit/detection-types";

/**
 * Spawn the deterministic UI-element detector (`scripts/detect-elements.py`)
 * as a SEPARATE PROCESS. This is deliberate: `ultralytics` is AGPL-3.0 and
 * must never be linked into the Next.js/TypeScript bundle (P8 RISKS #2).
 *
 * The detector is a local-only enhancement — on serverless (Vercel Hobby)
 * `python`/weights are absent, so we degrade to `degraded: true` and the
 * caller keeps the LLM-advisory-only path. Never crash the route.
 */

const DETECTOR_TIMEOUT_MS = 15_000;

export interface DetectionResult {
  elements: DetectedElement[];
  degraded: boolean;
  reason: string | null;
  model: string;
}

function degraded(reason: string): DetectionResult {
  return { elements: [], degraded: true, reason, model: "local-detector" };
}

export async function runDetector(
  screenshotBuffer: Buffer
): Promise<DetectionResult> {
  const scriptPath = path.join(process.cwd(), "scripts", "detect-elements.py");
  try {
    await fs.access(scriptPath);
  } catch {
    return degraded("script-missing");
  }

  const tmpDir = os.tmpdir();
  const tmpFile = path.join(tmpDir, `${crypto.randomUUID()}.png`);

  try {
    await fs.writeFile(tmpFile, screenshotBuffer);
  } catch {
    return degraded("temp-write-failed");
  }

  try {
    const { stdout, exitCode } = await spawnDetector(
      tmpFile,
      tmpDir
    );

    if (exitCode !== 0) return degraded("detector-error");

    const parsed: unknown = JSON.parse(stdout);
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      "error" in parsed
    ) {
      return degraded(String((parsed as { error: unknown }).error));
    }
    if (!Array.isArray(parsed)) return degraded("bad-output");

    const elements = parsed.filter(isDetectedElement);
    return { elements, degraded: false, reason: null, model: "local-detector" };
  } catch {
    return degraded("detector-failed");
  } finally {
    await fs.rm(tmpFile, { force: true }).catch(() => {});
  }
}

function spawnDetector(
  imagePath: string,
  tempDir: string
): Promise<{ stdout: string; exitCode: number }> {
  const pythonBin = process.env.PYTHON_BIN || "python";

  return new Promise((resolve) => {
    let stdout = "";
    let settled = false;

    const child = spawn(/* turbopackIgnore: true */ pythonBin, [
      path.join(process.cwd(), "scripts", "detect-elements.py"),
      imagePath,
      "--temp-dir",
      tempDir,
    ]);

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      resolve({ stdout, exitCode: -1 });
    }, DETECTOR_TIMEOUT_MS);

    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString("utf8");
    });

    child.on("error", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, exitCode: -1 });
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, exitCode: code ?? -1 });
    });
  });
}

function isDetectedElement(value: unknown): value is DetectedElement {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  const bbox = v.bbox as Record<string, unknown> | undefined;
  return (
    typeof v.label === "string" &&
    typeof v.confidence === "number" &&
    typeof v.class === "string" &&
    typeof bbox === "object" &&
    bbox !== null &&
    typeof bbox.x === "number" &&
    typeof bbox.y === "number" &&
    typeof bbox.w === "number" &&
    typeof bbox.h === "number"
  );
}
