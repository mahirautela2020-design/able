import { describe, it, expect } from "vitest";
import { runPdfChecks, findAmbiguousLinkPhrases, summarizeStructure } from "@/lib/pdf/checks";
import { PDF_GUIDED_CHECKLIST } from "@/lib/pdf/guided-checklist";
import type { PdfDocumentModel, PdfPageModel, PdfStructNode } from "@/lib/pdf/parse";

/**
 * Rule-level tests over synthetic documents. Real PDFs exercise the parser
 * (see pdf-parse.test.ts); these pin the *decisions* — including the cases a
 * hand-authored fixture can't easily produce, like revoked extraction rights.
 */

function node(role: string, children: PdfStructNode[] = [], extra: Partial<PdfStructNode> = {}): PdfStructNode {
  return { role, children, ...extra };
}

function page(overrides: Partial<PdfPageModel> = {}): PdfPageModel {
  return {
    pageNumber: 1,
    structRoots: [],
    textLength: 500,
    text: "",
    hasRasterImage: false,
    linkAnnotations: [],
    formFields: [],
    ...overrides,
  };
}

/** A document that passes every check, so each test can break exactly one thing. */
function cleanDoc(overrides: Partial<PdfDocumentModel> = {}): PdfDocumentModel {
  return {
    pageCount: 1,
    pagesAnalyzed: 1,
    tagged: true,
    lang: "en",
    title: "Annual Report 2026",
    displayDocTitle: true,
    hasXfa: false,
    hasAcroForm: false,
    encrypted: false,
    accessibilityExtractionAllowed: true,
    pdfUaPart: "1",
    outlineCount: 3,
    pdfVersion: "1.7",
    producer: "test",
    pages: [page({ structRoots: [node("Document", [node("H1"), node("P")])] })],
    ...overrides,
  };
}

const ids = (doc: PdfDocumentModel) => runPdfChecks(doc).map((f) => f.ruleId);

describe("clean baseline", () => {
  it("produces no findings for a well-formed document", () => {
    expect(runPdfChecks(cleanDoc())).toEqual([]);
  });
});

describe("document-level rules", () => {
  it("flags an untagged document as a violation", () => {
    const findings = runPdfChecks(cleanDoc({ tagged: false }));
    const f = findings.find((x) => x.ruleId === "pdf-not-tagged")!;
    expect(f.severity).toBe("violation");
    expect(f.criterion).toBe("1.3.1");
    expect(f.matterhorn).toBe("01");
  });

  it("flags a missing document language", () => {
    const f = runPdfChecks(cleanDoc({ lang: null })).find(
      (x) => x.ruleId === "pdf-no-document-language"
    )!;
    expect(f.severity).toBe("violation");
    expect(f.technique).toBe("PDF16");
  });

  it("flags a missing title", () => {
    expect(ids(cleanDoc({ title: null }))).toContain("pdf-no-title");
  });

  it("flags a title that viewers never display", () => {
    const out = ids(cleanDoc({ displayDocTitle: false }));
    expect(out).toContain("pdf-title-not-displayed");
    // The two title rules are alternatives, never both at once.
    expect(out).not.toContain("pdf-no-title");
  });

  it("does not report title-not-displayed when there is no title at all", () => {
    const out = ids(cleanDoc({ title: null, displayDocTitle: false }));
    expect(out).toContain("pdf-no-title");
    expect(out).not.toContain("pdf-title-not-displayed");
  });

  it("flags encryption that revokes accessibility extraction", () => {
    const f = runPdfChecks(
      cleanDoc({ encrypted: true, accessibilityExtractionAllowed: false })
    ).find((x) => x.ruleId === "pdf-accessibility-extraction-blocked")!;
    expect(f.severity).toBe("violation");
    expect(f.matterhorn).toBe("26");
  });

  it("does not flag encryption that still permits extraction", () => {
    expect(ids(cleanDoc({ encrypted: true }))).not.toContain(
      "pdf-accessibility-extraction-blocked"
    );
  });

  it("flags XFA forms", () => {
    expect(ids(cleanDoc({ hasXfa: true }))).toContain("pdf-xfa-form");
  });

  it("flags a long document with no bookmarks, but not a short one", () => {
    expect(ids(cleanDoc({ pageCount: 40, outlineCount: 0 }))).toContain("pdf-no-bookmarks");
    expect(ids(cleanDoc({ pageCount: 4, outlineCount: 0 }))).not.toContain("pdf-no-bookmarks");
  });

  it("raises a missing PDF/UA identifier only for tagged files", () => {
    expect(ids(cleanDoc({ pdfUaPart: null }))).toContain("pdf-no-pdfua-identifier");
    expect(ids(cleanDoc({ pdfUaPart: null, tagged: false }))).not.toContain(
      "pdf-no-pdfua-identifier"
    );
  });
});

describe("structure rules", () => {
  it("flags a Figure with neither /Alt nor /ActualText", () => {
    const doc = cleanDoc({
      pages: [page({ structRoots: [node("Document", [node("Figure")])] })],
    });
    const f = runPdfChecks(doc).find((x) => x.ruleId === "pdf-figure-missing-alt")!;
    expect(f.severity).toBe("violation");
    expect(f.technique).toBe("PDF1");
    expect(f.element).toContain("page 1");
  });

  it("accepts a Figure described by /Alt or by /ActualText", () => {
    for (const attrs of [{ alt: "A bar chart" }, { actualText: "Q3: 41%" }]) {
      const doc = cleanDoc({
        pages: [page({ structRoots: [node("Document", [node("Figure", [], attrs)])] })],
      });
      expect(ids(doc)).not.toContain("pdf-figure-missing-alt");
    }
  });

  it("treats whitespace-only alt text as missing", () => {
    const doc = cleanDoc({
      pages: [page({ structRoots: [node("Document", [node("Figure", [], { alt: "   " })])] })],
    });
    expect(ids(doc)).toContain("pdf-figure-missing-alt");
  });

  it("flags a skipped heading level in document order", () => {
    const doc = cleanDoc({
      pages: [page({ structRoots: [node("Document", [node("H1"), node("H4")])] })],
    });
    const f = runPdfChecks(doc).find((x) => x.ruleId === "pdf-heading-level-skipped")!;
    expect(f.evidence).toMatchObject({ from: 1, to: 4 });
  });

  it("allows returning to a shallower heading level", () => {
    const doc = cleanDoc({
      pages: [page({ structRoots: [node("Document", [node("H1"), node("H2"), node("H3"), node("H1")])] })],
    });
    expect(ids(doc)).not.toContain("pdf-heading-level-skipped");
  });

  it("flags a tagged document with text but no headings", () => {
    const doc = cleanDoc({
      pages: [page({ structRoots: [node("Document", [node("P")])], textLength: 900 })],
    });
    expect(ids(doc)).toContain("pdf-no-headings");
  });

  it("does not demand headings from a document with no text", () => {
    const doc = cleanDoc({
      pages: [page({ structRoots: [node("Document", [node("P")])], textLength: 0 })],
    });
    expect(ids(doc)).not.toContain("pdf-no-headings");
  });

  it("flags a table whose data cells have no header cells", () => {
    const doc = cleanDoc({
      pages: [
        page({
          structRoots: [
            node("Document", [
              node("H1"),
              node("Table", [node("TR", [node("TD"), node("TD")])]),
            ]),
          ],
        }),
      ],
    });
    const f = runPdfChecks(doc).find((x) => x.ruleId === "pdf-table-no-header-cells")!;
    expect(f.severity).toBe("violation");
    expect(f.evidence).toMatchObject({ headerCells: 0, dataCells: 2 });
  });

  it("accepts a table that has header cells", () => {
    const doc = cleanDoc({
      pages: [
        page({
          structRoots: [
            node("Document", [
              node("H1"),
              node("Table", [node("TR", [node("TH"), node("TH")]), node("TR", [node("TD"), node("TD")])]),
            ]),
          ],
        }),
      ],
    });
    expect(ids(doc)).not.toContain("pdf-table-no-header-cells");
  });

  it("flags a list whose children are not list items", () => {
    const doc = cleanDoc({
      pages: [
        page({
          structRoots: [node("Document", [node("H1"), node("L", [node("P"), node("LI")])])],
        }),
      ],
    });
    const f = runPdfChecks(doc).find((x) => x.ruleId === "pdf-list-structure-invalid")!;
    expect(f.severity).toBe("violation");
    expect(f.evidence).toMatchObject({ invalidChildRoles: ["P"] });
  });

  it("accepts a list of LI children with an optional Caption", () => {
    const doc = cleanDoc({
      pages: [
        page({
          structRoots: [
            node("Document", [node("H1"), node("L", [node("Caption"), node("LI"), node("LI")])]),
          ],
        }),
      ],
    });
    expect(ids(doc)).not.toContain("pdf-list-structure-invalid");
  });
});

describe("annotation and content rules", () => {
  it("flags form fields with no tooltip, ignoring push buttons", () => {
    const doc = cleanDoc({
      hasAcroForm: true,
      pages: [
        page({
          structRoots: [node("Document", [node("H1")])],
          formFields: [
            { fieldName: "email", fieldType: "Tx", tooltip: "" },
            { fieldName: "submit", fieldType: "Btn", tooltip: "" },
          ],
        }),
      ],
    });
    const f = runPdfChecks(doc).find((x) => x.ruleId === "pdf-form-field-no-label")!;
    expect(f.severity).toBe("violation");
    expect(f.evidence).toMatchObject({ missing: 1, fieldNames: ["email"] });
  });

  it("raises link annotations without alternate text as needs_review", () => {
    const doc = cleanDoc({
      pages: [
        page({
          structRoots: [node("Document", [node("H1")])],
          linkAnnotations: [{ url: "https://example.com", altText: "" }],
        }),
      ],
    });
    const f = runPdfChecks(doc).find((x) => x.ruleId === "pdf-link-annotation-no-alt")!;
    expect(f.severity).toBe("needs_review");
  });

  it("flags ambiguous link phrasing only on pages that actually have links", () => {
    const withLinks = cleanDoc({
      pages: [
        page({
          structRoots: [node("Document", [node("H1")])],
          text: "For the full policy, click here.",
          linkAnnotations: [{ url: "https://example.com", altText: "policy" }],
        }),
      ],
    });
    expect(ids(withLinks)).toContain("pdf-ambiguous-link-text");

    const withoutLinks = cleanDoc({
      pages: [
        page({ structRoots: [node("Document", [node("H1")])], text: "For the full policy, click here." }),
      ],
    });
    expect(ids(withoutLinks)).not.toContain("pdf-ambiguous-link-text");
  });

  it("flags image-only pages as an un-OCR'd scan", () => {
    const doc = cleanDoc({
      tagged: false,
      pages: [page({ hasRasterImage: true, textLength: 0 })],
    });
    const f = runPdfChecks(doc).find((x) => x.ruleId === "pdf-scanned-image-only")!;
    expect(f.severity).toBe("violation");
    expect(f.criterion).toBe("1.1.1");
  });

  it("does not call a page with images and real text a scan", () => {
    const doc = cleanDoc({
      pages: [
        page({ hasRasterImage: true, textLength: 2000, structRoots: [node("Document", [node("H1")])] }),
      ],
    });
    expect(ids(doc)).not.toContain("pdf-scanned-image-only");
  });
});

describe("helpers", () => {
  it("detects ambiguous link phrases case-insensitively", () => {
    expect(findAmbiguousLinkPhrases("Please CLICK HERE now")).toEqual(["click here"]);
    expect(findAmbiguousLinkPhrases("Download the 2026 fee schedule")).toEqual([]);
  });

  it("summarises the structure roles present", () => {
    const doc = cleanDoc({
      pages: [page({ structRoots: [node("Document", [node("H1"), node("P"), node("P")])] })],
    });
    expect(summarizeStructure(doc)).toEqual({ Document: 1, H1: 1, P: 2 });
  });
});

describe("guided checklist", () => {
  it("covers the human-judgement checkpoints with unique ids", () => {
    const checklistIds = PDF_GUIDED_CHECKLIST.map((i) => i.id);
    expect(new Set(checklistIds).size).toBe(checklistIds.length);
    expect(PDF_GUIDED_CHECKLIST.length).toBeGreaterThanOrEqual(10);
  });

  it("states a WCAG criterion and a reason for every manual step", () => {
    for (const item of PDF_GUIDED_CHECKLIST) {
      expect(item.wcagSc).toMatch(/^\d+\.\d+\.\d+$/);
      expect(item.whyManual.length).toBeGreaterThan(20);
      expect(item.instruction.length).toBeGreaterThan(20);
    }
  });
});
