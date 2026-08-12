import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

interface P1Fixture {
  audit: Record<string, unknown>;
  scope_pages: Record<string, unknown>[];
  findings: Record<string, unknown>[];
  ax_snapshots: Record<string, unknown>[];
}

let _fixture: P1Fixture | null = null;

export function loadP1Fixture(): P1Fixture {
  if (_fixture) return _fixture;

  const fixturePath = resolve(process.cwd(), "__fixtures__/audit-p1.json");

  if (!existsSync(fixturePath)) {
    throw new Error(
      `Fixture file not found at ${fixturePath}. ` +
      `The __fixtures__/audit-p1.json file must exist.`
    );
  }

  const raw = readFileSync(fixturePath, "utf-8");
  _fixture = JSON.parse(raw) as P1Fixture;
  return _fixture;
}

export function getAuditFromFixture() {
  return loadP1Fixture().audit;
}

export function getScopePagesFromFixture() {
  return loadP1Fixture().scope_pages;
}

export function getFindingsFromFixture() {
  return loadP1Fixture().findings;
}

export function getAxSnapshotsFromFixture() {
  return loadP1Fixture().ax_snapshots;
}

if (require.main === module) {
  console.log("Fixtures loaded successfully");
  const f = loadP1Fixture();
  console.log(`  Audit: ${f.audit.id}`);
  console.log(`  Scope pages: ${f.scope_pages.length}`);
  console.log(`  Findings: ${f.findings.length}`);
  console.log(`  AX snapshots: ${f.ax_snapshots.length}`);
}
