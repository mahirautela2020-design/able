import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import type { DynamicFinding, Pixels, UiNode } from "./dynamic-checks";
import { checkContrast, checkLabels, checkTouchTargets } from "./dynamic-checks";

const execFileAsync = promisify(execFile);

/** Script that drives the emulator via adb (feature-detects adb/emulator). */
const SCRIPT_REL = "scripts/emulator-ctl.sh";

export interface DynamicScreen {
  name: string;
  densityDpi: number;
  nodes: UiNode[];
  findings: DynamicFinding[];
}

export interface DynamicAuditResult {
  ran: boolean;
  screens: DynamicScreen[];
}

export interface DynamicAuditOptions {
  /** Force the dynamic pass even without an AVD configured (for tests/CLI). */
  force?: boolean;
  /** Android package name used to launch the app (optional). */
  package?: string | null;
}

/** Parse a `uiautomator dump` XML string into flat node records. Tolerant of
 * missing attributes and malformed XML — returns [] rather than throwing. */
export function parseUiAutomatorXml(xml: string): UiNode[] {
  const nodes: UiNode[] = [];
  if (!xml || typeof xml !== "string") return nodes;

  const nodeRegex = /<node\b([^>]*)>/g;
  let match: RegExpExecArray | null;
  while ((match = nodeRegex.exec(xml)) !== null) {
    const attrs = match[1] ?? "";
    const bounds = parseBounds(getAttr(attrs, "bounds"));
    if (!bounds) continue;

    nodes.push({
      className: decodeEntities(getAttr(attrs, "class")),
      contentDesc: decodeEntities(getAttr(attrs, "content-desc")),
      text: decodeEntities(getAttr(attrs, "text")),
      bounds,
      clickable: getAttr(attrs, "clickable") === "true",
    });
  }

  return nodes;
}

function getAttr(attrs: string, name: string): string {
  const re = new RegExp(`${name}="([^"]*)"`);
  const m = re.exec(attrs);
  return m ? m[1] ?? "" : "";
}

function parseBounds(raw: string): [number, number, number, number] | null {
  const m = /\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/.exec(raw);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#10;/g, "\n")
    .replace(/&amp;/g, "&");
}

function scriptPath(): string {
  return join(process.cwd(), SCRIPT_REL);
}

function shellExecutable(): string {
  if (process.platform === "win32") {
    return process.env.SHELL || "bash";
  }
  return "sh";
}

interface ScriptResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Run an emulator-ctl.sh subcommand; never throws — non-zero exit / errors
 * become { code: N }, and callers decide how to degrade. */
async function runScript(args: string[], timeoutMs: number): Promise<ScriptResult> {
  try {
    const { stdout, stderr } = await execFileAsync(
      shellExecutable(),
      [scriptPath(), ...args],
      { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, encoding: "utf-8" }
    );
    return { code: 0, stdout: stdout ?? "", stderr: stderr ?? "" };
  } catch (e) {
    const err = e as {
      code?: number | string;
      killed?: boolean;
      stdout?: string;
      stderr?: string;
    };
    const code = typeof err.code === "number" ? err.code : err.killed ? 124 : 1;
    return { code, stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
  }
}

/** Decode a PNG screenshot into RGB pixels for contrast sampling. */
async function decodeScreenshot(pngPath: string): Promise<Pixels | null> {
  try {
    const { data, info } = await sharp(pngPath)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return {
      width: info.width,
      height: info.height,
      data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    };
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run the dynamic audit: boot an emulator, install the APK, dump the live UI
 * hierarchy, screenshot it, and run deterministic checks on the result.
 *
 * Degrades to `{ ran: false }` when the emulator is unavailable (no adb /
 * emulator / AVD) — the caller falls back to static-only results.
 */
export async function runDynamicAudit(
  apkPath: string,
  opts: DynamicAuditOptions = {}
): Promise<DynamicAuditResult> {
  const none: DynamicAuditResult = { ran: false, screens: [] };

  const force = opts.force === true || process.env.APK_DYNAMIC === "1";
  // Auto-run only when the user has pre-created an AVD (AVD_NAME) or explicitly
  // forced it. This keeps CI/dev machines without the Android SDK from
  // attempting a slow emulator boot on every upload.
  if (!force && !process.env.AVD_NAME) return none;

  const present = await runScript(["present"], 10_000);
  if (present.code !== 0) return none;

  if (!existsSync(apkPath)) return none;

  const workDir = mkdtempSync(join(tmpdir(), "apk-dynamic-"));
  const dumpPath = join(workDir, "window_dump.xml");
  const pngPath = join(workDir, "screen.png");

  try {
    const boot = await runScript(["boot"], 200_000);
    if (boot.code !== 0) return none;

    const install = await runScript(["install", apkPath], 120_000);
    if (install.code !== 0) return none;

    if (opts.package) {
      const launch = await runScript(["launch", opts.package], 60_000);
      // Launch failure is not fatal — the launcher/splash is still auditable.
      void launch;
    }

    await sleep(1500);

    const dump = await runScript(["dump", dumpPath], 60_000);
    if (dump.code !== 0) return none;

    const snapshot = await runScript(["snapshot", pngPath], 60_000);
    if (snapshot.code !== 0) return none;

    const densityOut = await runScript(["density"], 30_000);
    const densityDpi = parseInt(densityOut.stdout.trim(), 10) || 420;

    const nodes = parseUiAutomatorXml(readFileSync(dumpPath, "utf-8"));
    const pixels = await decodeScreenshot(pngPath);

    const findings = [
      ...checkLabels(nodes),
      ...checkTouchTargets(nodes, densityDpi),
      ...checkContrast(nodes, pixels),
    ];

    return {
      ran: true,
      screens: [
        {
          name: "Screen 1 (cold start)",
          densityDpi,
          nodes,
          findings,
        },
      ],
    };
  } catch {
    return none;
  } finally {
    const shutdown = await runScript(["shutdown"], 15_000);
    void shutdown;
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
}
