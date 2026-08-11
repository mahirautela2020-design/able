import { execSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseGitUrl, validateGitHost } from "@/lib/ssrf";

const MAX_REPO_SIZE_MB = 500;
const CLONE_TIMEOUT_MS = 300_000; // 5 minutes

export interface CloneResult {
  clonePath: string;
  commitSha: string;
  branch: string;
}

export async function cloneRepo(repoUrl: string, auditId: string): Promise<CloneResult> {
  const parsedUrl = parseGitUrl(repoUrl);
  if (!parsedUrl) {
    throw new Error(`Invalid git URL: ${repoUrl}`);
  }

  const hostname = parsedUrl.hostname;
  validateGitHost(hostname);

  const httpsUrl = repoUrl.startsWith("git@")
    ? `https://${parsedUrl.hostname}/${repoUrl.split(":")[1]}`
    : repoUrl;

  const sandboxDir = mkdtempSync(join(tmpdir(), `audit-${auditId}-`));

  try {
    const result = spawnSync(
      "git",
      [
        "clone",
        "--depth", "1",
        "--single-branch",
        "--no-tags",
        httpsUrl,
        sandboxDir,
      ],
      {
        timeout: CLONE_TIMEOUT_MS,
        stdio: ["pipe", "pipe", "pipe"],
        encoding: "utf-8",
      }
    );

    if (result.status !== 0) {
      throw new Error(`git clone failed: ${result.stderr?.slice(0, 200)}`);
    }

    const sizeMb = getDirectorySize(sandboxDir);
    if (sizeMb > MAX_REPO_SIZE_MB) {
      throw new Error(`Repo size ${sizeMb}MB exceeds cap of ${MAX_REPO_SIZE_MB}MB`);
    }

    const commitSha = execSync("git rev-parse HEAD", {
      cwd: sandboxDir,
      encoding: "utf-8",
      timeout: 10_000,
    }).trim();

    const branch = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: sandboxDir,
      encoding: "utf-8",
      timeout: 10_000,
    }).trim();

    writeFileSync(join(sandboxDir, ".audit-id"), auditId);

    return {
      clonePath: sandboxDir,
      commitSha,
      branch,
    };
  } catch (e) {
    try {
      rmSync(sandboxDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
    throw e;
  }
}

export function cleanupClone(clonePath: string): void {
  try {
    if (existsSync(clonePath)) {
      if (!clonePath.includes("audit-") || !clonePath.includes(tmpdir())) {
        throw new Error("SAFETY: clone path not in expected temp location");
      }
      rmSync(clonePath, { recursive: true, force: true });
    }
  } catch {
    // best-effort cleanup
  }
}

export function validateSandboxPath(clonePath: string): void {
  const normalized = clonePath.replace(/\\/g, "/").replace(/\/$/, "");

  if (normalized.includes("..")) {
    throw new Error(`Path traversal detected: ${clonePath}`);
  }

  if (!normalized.startsWith(tmpdir().replace(/\\/g, "/"))) {
    throw new Error(`Path outside sandbox: ${clonePath}`);
  }

  if (!normalized.includes("audit-")) {
    throw new Error(`Unexpected path structure: ${clonePath}`);
  }

  const auditIdMatch = normalized.match(/audit-([^/\\-]+)/);
  if (!auditIdMatch) {
    throw new Error(`No audit ID in path: ${clonePath}`);
  }
}

function getDirectorySize(dir: string): number {
  let totalBytes = 0;
  try {
    function walk(dirPath: string) {
      const entries = readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else {
          totalBytes += statSync(fullPath).size;
        }
      }
    }
    walk(dir);
  } catch {
    return 0;
  }
  return Math.ceil(totalBytes / (1024 * 1024));
}
