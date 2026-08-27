// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parsePdf, PdfParseError, walkStructTree } from "@/lib/pdf/parse";
import { runPdfChecks } from "@/lib/pdf/checks";

/**
 * Integration tests against real PDFs.
 *
 * The fixtures are Chrome print-to-PDF output of the same HTML source, once
 * with tagging on and once off — so the *only* difference between them is the
 * structure tree. That makes them a precise probe: any check that reports
 * differently across the pair is genuinely reading tags, not guessing.
 */

const fixture = (name: string) =>
  readFileSync(join(__dirname, "fixtures", "pdf", name));

describe("parsePdf", () => {
  it("reads the tag tree, language and title from a tagged PDF", async () => {
    const doc = await parsePdf(fixture("tagged.pdf"));

    expect(doc.tagged).toBe(true);
    expect(doc.lang).toBe("en");
    expect(doc.title).toBe("Tagged Sample");
    expect(doc.pageCount).toBe(1);
    expect(doc.pagesAnalyzed).toBe(1);
    expect(doc.pages[0].structRoots.length).toBeGreaterThan(0);
  });

  it("extracts the roles the source HTML implies", async () => {
    const doc = await parsePdf(fixture("tagged.pdf"));
    const roles = new Set<string>();
    walkStructTree(doc.pages[0].structRoots, (node) => roles.add(node.role));

    // Sanity: the semantics survived the HTML → tagged-PDF round trip.
    for (const role of ["H1", "H3", "P", "Figure", "L", "LI", "Table", "TH", "TD"]) {
      expect(roles.has(role), `expected role ${role}`).toBe(true);
    }
  });

  it("captures Figure alt text and the missing-alt case", async () => {
    const doc = await parsePdf(fixture("tagged.pdf"));
    const figures: Array<string | undefined> = [];
    walkStructTree(doc.pages[0].structRoots, (node) => {
      if (node.role === "Figure") figures.push(node.alt);
    });

    // The source has one img with alt and one with alt="" (decorative).
    expect(figures).toContain("Blue square chart");
  });

  it("reports an untagged PDF as untagged with no structure", async () => {
    const doc = await parsePdf(fixture("untagged.pdf"));

    expect(doc.tagged).toBe(false);
    expect(doc.lang).toBeNull();
    expect(doc.pages[0].structRoots).toEqual([]);
  });

  it("still extracts text and link annotations without tags", async () => {
    const doc = await parsePdf(fixture("untagged.pdf"));

    expect(doc.pages[0].textLength).toBeGreaterThan(0);
    expect(doc.pages[0].linkAnnotations.length).toBe(2);
  });

  it("rejects non-PDF bytes with a typed error", async () => {
    await expect(parsePdf(Buffer.from("not a pdf at all"))).rejects.toBeInstanceOf(
      PdfParseError
    );
  });
});

describe("runPdfChecks against real files", () => {
  it("flags the untagged file as not tagged and missing a language", async () => {
    const doc = await parsePdf(fixture("untagged.pdf"));
    const ids = runPdfChecks(doc).map((f) => f.ruleId);

    expect(ids).toContain("pdf-not-tagged");
    expect(ids).toContain("pdf-no-document-language");
  });

  it("does not flag tagging or language on the tagged file", async () => {
    const doc = await parsePdf(fixture("tagged.pdf"));
    const ids = runPdfChecks(doc).map((f) => f.ruleId);

    expect(ids).not.toContain("pdf-not-tagged");
    expect(ids).not.toContain("pdf-no-document-language");
  });

  it("flags the tagged file's skipped heading level (H1 → H3)", async () => {
    const doc = await parsePdf(fixture("tagged.pdf"));
    const skipped = runPdfChecks(doc).find((f) => f.ruleId === "pdf-heading-level-skipped");

    expect(skipped).toBeDefined();
    expect(skipped!.evidence).toMatchObject({ from: 1, to: 3 });
  });

  it("orders violations before needs_review findings", async () => {
    const doc = await parsePdf(fixture("untagged.pdf"));
    const severities = runPdfChecks(doc).map((f) => f.severity);
    const firstReview = severities.indexOf("needs_review");

    if (firstReview !== -1) {
      expect(severities.slice(firstReview)).not.toContain("violation");
    }
  });

  it("never fabricates a finding without a WCAG criterion", async () => {
    const doc = await parsePdf(fixture("untagged.pdf"));
    for (const f of runPdfChecks(doc)) {
      expect(f.criterion).toMatch(/^\d+\.\d+\.\d+$/);
      expect(f.source).toBe("pdf-static");
      expect(f.remediation.length).toBeGreaterThan(20);
    }
  });
});
