/**
 * Static PDF structure reader — pure, no network, no LLM.
 *
 * Everything here only *reads* what the file declares: the tag (structure)
 * tree, the document catalog's language/title, viewer preferences, annotation
 * dictionaries and per-page text/image operators. Those are exactly the
 * artefacts PDF/UA-1 (ISO 14289-1) conformance is defined against, which is
 * what makes the downstream checks deterministic rather than guesswork.
 *
 * Reference model (see `checks.ts` for the rule-by-rule mapping):
 *   - PDF/UA-1 via the PDF Association's Matterhorn Protocol 1.1 — 31
 *     checkpoints / 136 failure conditions, of which ~89 are machine-checkable.
 *     https://pdfa.org/resource/matterhorn-protocol/
 *   - W3C WCAG PDF Techniques (PDF1..PDF23).
 *     https://www.w3.org/WAI/WCAG22/Techniques/#pdf
 *
 * GUARDRAILS: this module never renders, never shells out, never touches the
 * network, and never infers meaning. A structure it cannot see produces
 * absence-of-evidence, not a fabricated finding.
 */

/** Analysing every page of a 900-page file would blow the serverless budget.
 * Pages beyond this are counted but not structurally inspected — the caller
 * surfaces `pagesAnalyzed` so the report can say so honestly. */
export const MAX_ANALYZED_PAGES = 50;

/** Typed error for malformed/encrypted input — the route maps it to HTTP 400. */
export class PdfParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfParseError";
  }
}

/** One node of the PDF tag tree, normalised to the fields the checks need. */
export interface PdfStructNode {
  /** Structure type, e.g. "Document", "H1", "P", "Figure", "Table", "L". */
  role: string;
  /** `/Alt` — the text alternative (PDF1). */
  alt?: string;
  /** `/ActualText` — a replacement reading of the content. */
  actualText?: string;
  /** `/Lang` on this element (PDF19). */
  lang?: string;
  children: PdfStructNode[];
}

export interface PdfLinkAnnotation {
  url?: string;
  /** `/Contents` — the annotation's alternate description (PDF13). */
  altText: string;
}

export interface PdfFormField {
  fieldName?: string;
  fieldType?: string;
  /** `/TU` — the tooltip that supplies the field's accessible name (PDF10). */
  tooltip: string;
}

/** Per-page cap on retained text. Enough to spot link phrasing without
 * holding a whole book in memory. */
export const MAX_PAGE_TEXT_CHARS = 8_000;

export interface PdfPageModel {
  pageNumber: number;
  /** Roots of this page's tag tree; empty when the page carries no tags. */
  structRoots: PdfStructNode[];
  /** Total characters of extractable text on the page. */
  textLength: number;
  /** Extracted text, truncated to MAX_PAGE_TEXT_CHARS. */
  text: string;
  /** True when the page paints at least one raster image / image mask. */
  hasRasterImage: boolean;
  linkAnnotations: PdfLinkAnnotation[];
  formFields: PdfFormField[];
}

export interface PdfDocumentModel {
  pageCount: number;
  /** Number of pages actually inspected (see MAX_ANALYZED_PAGES). */
  pagesAnalyzed: number;
  /** `/MarkInfo /Marked true` — the document declares itself tagged. */
  tagged: boolean;
  /** Catalog `/Lang` (PDF16). */
  lang: string | null;
  /** Document information dictionary `/Title` (PDF18). */
  title: string | null;
  /** `/ViewerPreferences /DisplayDocTitle` — whether viewers show that title. */
  displayDocTitle: boolean;
  hasXfa: boolean;
  hasAcroForm: boolean;
  encrypted: boolean;
  /** False only when encryption explicitly revokes accessibility extraction. */
  accessibilityExtractionAllowed: boolean;
  /** XMP `pdfuaid:part` value when the file claims PDF/UA conformance. */
  pdfUaPart: string | null;
  /** Number of top-level bookmarks in the document outline (PDF2). */
  outlineCount: number;
  pdfVersion: string | null;
  producer: string | null;
  pages: PdfPageModel[];
}

/** pdf.js struct-tree nodes are loosely typed; narrow only what we read. */
interface RawStructNode {
  role?: string;
  alt?: string;
  actualText?: string;
  lang?: string;
  type?: string;
  children?: RawStructNode[];
}

function normalizeStructNode(raw: RawStructNode): PdfStructNode | null {
  // Content leaves (`{type: "content", id}`) carry no semantics of their own.
  if (!raw.role) return null;
  const children: PdfStructNode[] = [];
  for (const child of raw.children ?? []) {
    const node = normalizeStructNode(child);
    if (node) children.push(node);
  }
  return {
    role: raw.role,
    ...(raw.alt ? { alt: raw.alt } : {}),
    ...(raw.actualText ? { actualText: raw.actualText } : {}),
    ...(raw.lang ? { lang: raw.lang } : {}),
    children,
  };
}

/**
 * Depth-first, **document-order** walk over a page's tag tree.
 *
 * Order matters: the tag sequence *is* the reading order, so any rule about
 * sequence (heading levels, for instance) is only correct if siblings are
 * visited left-to-right. A LIFO stack would silently reverse them.
 */
export function walkStructTree(
  roots: PdfStructNode[],
  visit: (node: PdfStructNode, parent: PdfStructNode | null) => void
): void {
  const descend = (node: PdfStructNode, parent: PdfStructNode | null): void => {
    visit(node, parent);
    for (const child of node.children) descend(child, node);
  };
  for (const root of roots) descend(root, null);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/**
 * Read a PDF into the structural model the checks run against.
 *
 * Throws `PdfParseError` when the bytes aren't a readable PDF or the file is
 * password-protected (we deliberately never attempt to bypass encryption).
 */
export async function parsePdf(buffer: Buffer): Promise<PdfDocumentModel> {
  // Imported lazily: pdf.js is a large ESM-only dependency that must not be
  // pulled into the module graph of routes that never touch a PDF.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  // The loading task (not the document proxy) owns teardown in pdf.js v6+,
  // so it has to stay in scope for the `finally` below.
  let loadingTask;
  let doc;
  try {
    loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      // No rendering happens here, so no font/canvas machinery is needed —
      // and `verbosity: ERRORS` keeps pdf.js's per-key warnings out of logs.
      useSystemFonts: false,
      verbosity: pdfjs.VerbosityLevel.ERRORS,
    });
    doc = await loadingTask.promise;
  } catch (e) {
    await loadingTask?.destroy().catch(() => {});
    const message = (e as Error).message || "Unreadable PDF";
    if (/password/i.test(message)) {
      throw new PdfParseError(
        "This PDF is password-protected. Remove the password and re-upload — the audit never attempts to bypass encryption."
      );
    }
    throw new PdfParseError(`Could not read this PDF: ${message}`);
  }

  try {
    const metadata = await doc.getMetadata();
    const info = metadata.info as Record<string, unknown>;

    // `getPermissions()` returns null for an unencrypted file (everything is
    // permitted); an array means encryption is present and only the listed
    // flags are granted.
    const permissions = await doc.getPermissions();
    const encrypted = permissions !== null;
    const accessibilityExtractionAllowed =
      permissions === null || permissions.includes(pdfjs.PermissionFlag.COPY_FOR_ACCESSIBILITY);

    const markInfo = await doc.getMarkInfo();

    let displayDocTitle = false;
    try {
      const prefs = (await doc.getViewerPreferences()) as Record<string, unknown> | null;
      displayDocTitle = prefs?.DisplayDocTitle === true;
    } catch {
      displayDocTitle = false;
    }

    let outlineCount = 0;
    try {
      outlineCount = (await doc.getOutline())?.length ?? 0;
    } catch {
      outlineCount = 0;
    }

    // PDF/UA conformance is asserted in XMP, not the info dictionary.
    let pdfUaPart: string | null = null;
    const rawXmp = metadata.metadata?.getRaw?.() ?? "";
    const uaMatch = /pdfuaid[:\s]*part[^0-9]{0,12}(\d+)/i.exec(rawXmp);
    if (uaMatch) pdfUaPart = uaMatch[1];

    const pagesAnalyzed = Math.min(doc.numPages, MAX_ANALYZED_PAGES);
    const pages: PdfPageModel[] = [];

    for (let pageNumber = 1; pageNumber <= pagesAnalyzed; pageNumber++) {
      const page = await doc.getPage(pageNumber);

      let structRoots: PdfStructNode[] = [];
      try {
        const tree = (await page.getStructTree()) as RawStructNode | null;
        if (tree) {
          for (const child of tree.children ?? []) {
            const node = normalizeStructNode(child);
            if (node) structRoots.push(node);
          }
        }
      } catch {
        structRoots = [];
      }

      let textLength = 0;
      let text = "";
      try {
        const textContent = await page.getTextContent();
        for (const item of textContent.items) {
          if ("str" in item && typeof item.str === "string") {
            textLength += item.str.trim().length;
            if (text.length < MAX_PAGE_TEXT_CHARS) text += item.str;
          }
        }
        text = text.slice(0, MAX_PAGE_TEXT_CHARS);
      } catch {
        textLength = 0;
        text = "";
      }

      let hasRasterImage = false;
      try {
        const ops = await page.getOperatorList();
        const imageOps = new Set<number>([
          pdfjs.OPS.paintImageXObject,
          pdfjs.OPS.paintInlineImageXObject,
          pdfjs.OPS.paintImageMaskXObject,
        ]);
        hasRasterImage = ops.fnArray.some((fn: number) => imageOps.has(fn));
      } catch {
        hasRasterImage = false;
      }

      const linkAnnotations: PdfLinkAnnotation[] = [];
      const formFields: PdfFormField[] = [];
      try {
        const annotations = (await page.getAnnotations()) as Array<Record<string, unknown>>;
        for (const a of annotations) {
          if (a.subtype === "Link") {
            const contentsObj = a.contentsObj as { str?: string } | undefined;
            linkAnnotations.push({
              ...(typeof a.url === "string" ? { url: a.url } : {}),
              altText: contentsObj?.str ?? (typeof a.contents === "string" ? a.contents : "") ?? "",
            });
          } else if (a.subtype === "Widget") {
            formFields.push({
              ...(typeof a.fieldName === "string" ? { fieldName: a.fieldName } : {}),
              ...(typeof a.fieldType === "string" ? { fieldType: a.fieldType } : {}),
              tooltip: typeof a.alternativeText === "string" ? a.alternativeText : "",
            });
          }
        }
      } catch {
        // A page whose annotations can't be read contributes none, rather
        // than causing the whole audit to fail.
      }

      pages.push({
        pageNumber,
        structRoots,
        textLength,
        text,
        hasRasterImage,
        linkAnnotations,
        formFields,
      });

      page.cleanup();
    }

    return {
      pageCount: doc.numPages,
      pagesAnalyzed,
      tagged: markInfo?.Marked === true,
      lang: asString(info.Language),
      title: asString(info.Title),
      displayDocTitle,
      hasXfa: info.IsXFAPresent === true,
      hasAcroForm: info.IsAcroFormPresent === true,
      encrypted,
      accessibilityExtractionAllowed,
      pdfUaPart,
      outlineCount,
      pdfVersion: asString(info.PDFFormatVersion),
      producer: asString(info.Producer),
      pages,
    };
  } finally {
    await loadingTask.destroy();
  }
}
