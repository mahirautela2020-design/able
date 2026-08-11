import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export interface CodeLintFinding {
  rule_id: string;
  severity: "error" | "warning" | "info";
  file: string;
  line: number;
  message: string;
}

export async function runCodeLint(repoPath: string): Promise<CodeLintFinding[]> {
  const findings: CodeLintFinding[] = [];

  const eslintFindings = await runEslint(repoPath);
  findings.push(...eslintFindings);

  const axeHtmlFindings = await runAxeHtml(repoPath);
  findings.push(...axeHtmlFindings);

  return findings;
}

async function runEslint(repoPath: string): Promise<CodeLintFinding[]> {
  const findings: CodeLintFinding[] = [];

  try {
    const eslintConfigPath = join(repoPath, ".eslintrc.json");
    const eslintConfigJsPath = join(repoPath, ".eslintrc.js");
    const eslintFlatConfigPath = join(repoPath, "eslint.config.mjs");
    const eslintFlatConfigJsPath = join(repoPath, "eslint.config.js");

    const hasConfig =
      existsSync(eslintConfigPath) ||
      existsSync(eslintConfigJsPath) ||
      existsSync(eslintFlatConfigPath) ||
      existsSync(eslintFlatConfigJsPath);

    if (!hasConfig) {
      findings.push({
        rule_id: "eslint-no-config",
        severity: "info",
        file: ".",
        line: 0,
        message: "No ESLint config found in repo; lint skipped",
      });
      return findings;
    }

    const npxPath = process.env.NPX_PATH || "npx";
    const output = execSync(`${npxPath} eslint . --format json 2>&1 || true`, {
      cwd: repoPath,
      encoding: "utf-8",
      timeout: 60_000,
      stdio: ["pipe", "pipe", "pipe"],
    });

    try {
      const eslintResults = JSON.parse(output) as Array<{
        filePath: string;
        messages: Array<{
          ruleId: string | null;
          message: string;
          line: number;
          severity: number;
        }>;
      }>;

      for (const result of eslintResults) {
        for (const msg of result.messages) {
          if (msg.ruleId && isAccessibilityRule(msg.ruleId)) {
            findings.push({
              rule_id: `eslint/${msg.ruleId}`,
              severity: msg.severity === 2 ? "error" : "warning",
              file: result.filePath,
              line: msg.line,
              message: msg.message,
            });
          }
        }
      }
    } catch {
      // JSON parse failed; ESLint may have produced non-JSON output
    }
  } catch {
    // ESLint not available
  }

  return findings;
}

function isAccessibilityRule(ruleId: string): boolean {
  const a11yRules = [
    "jsx-a11y/",
    "alt-text",
    "anchor-has-content",
    "aria-props",
    "aria-role",
    "aria-unsupported-elements",
    "click-events-have-key-events",
    "heading-has-content",
    "html-has-lang",
    "iframe-has-title",
    "img-redundant-alt",
    "label-has-associated-control",
    "no-access-key",
    "no-redundant-roles",
    "tabindex-no-positive",
    "@typescript-eslint/prefer-accessible",
  ];

  return a11yRules.some((r) => ruleId.startsWith(r));
}

async function runAxeHtml(repoPath: string): Promise<CodeLintFinding[]> {
  const findings: CodeLintFinding[] = [];

  try {
    const htmlFiles = findHtmlFiles(repoPath);
    if (htmlFiles.length === 0) return findings;

    // Use the pinned axe-core version from the project's package.json
    const packageJsonPath = join(process.cwd(), "package.json");
    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
        const rawVersion = packageJson.dependencies?.["axe-core"] || packageJson.devDependencies?.["axe-core"];
        if (!rawVersion) return findings;
      } catch {
        // keep default
      }
    }

    for (const htmlFile of htmlFiles.slice(0, 10)) {
      try {
        const axeCore = (await import("axe-core")).default;
        const { JSDOM } = await import("jsdom");
        const html = readFileSync(htmlFile, "utf-8");
        const dom = new JSDOM(html);
        const results = await axeCore.run(dom.window.document);

        for (const violation of results.violations) {
          for (const node of violation.nodes) {
            findings.push({
              rule_id: `axe/${violation.id}`,
              severity: "error",
              file: htmlFile,
              line: 0,
              message: `${violation.help}: ${node.failureSummary || ""}`.trim(),
            });
          }
        }

        for (const incomplete of results.incomplete) {
          for (const node of incomplete.nodes) {
            findings.push({
              rule_id: `axe/${incomplete.id}`,
              severity: "warning",
              file: htmlFile,
              line: 0,
              message: `[NEEDS REVIEW] ${incomplete.help}: ${node.failureSummary || ""}`.trim(),
            });
          }
        }
      } catch {
        // skip file
      }
    }
  } catch {
    // axe-core not available
  }

  return findings;
}

function findHtmlFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    function walk(dirPath: string) {
      const entries = readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules" || entry.name === ".git") continue;
          walk(fullPath);
        } else if (entry.name.endsWith(".html") || entry.name.endsWith(".htm")) {
          results.push(fullPath);
        }
      }
    }
    walk(dir);
  } catch {
    // skip
  }
  return results;
}
