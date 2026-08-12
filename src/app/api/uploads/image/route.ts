import { requireSession } from "@/lib/supabase/session";
import { analyzeScreenshot } from "@/lib/vision";

const MAX_IMAGE_MB = 10;
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"]);

/**
 * POST /api/uploads/image — analyze a UI screenshot for accessibility.
 *
 * Deterministic checks (color math on extracted colors) create violations;
 * the vision model (Gemini 2.5 Flash by default) only SUGGESTS findings in
 * the needs_review bucket — the accuracy doctrine: LLM never creates
 * hard findings.
 */
export async function POST(request: Request) {
  const auth = await requireSession(request);
  if (!auth.ok) return auth.response;

  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return Response.json({ error: "Expected multipart/form-data" }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return Response.json({ error: "File is required" }, { status: 400 });
    }
    if (!ALLOWED.has(file.type)) {
      return Response.json(
        { error: `Unsupported type ${file.type}. Use PNG, JPEG, or WebP.` },
        { status: 400 }
      );
    }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      return Response.json({ error: `File too large (max ${MAX_IMAGE_MB}MB)` }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // ── 1. Vision advisory (needs_review bucket only) ──
    const vision = await analyzeScreenshot(buffer, file.type);

    // ── 2. Build findings ──
    const findings = vision.suggestions.map((s) => ({
      ruleId: `vision-${s.wcagCriterion.replace(/\./g, "-")}`,
      ruleTitle: `Vision suggestion — WCAG ${s.wcagCriterion}`,
      wcagCriterion: s.wcagCriterion,
      wcagLevel: s.wcagCriterion.startsWith("1.") ? "A" : s.wcagCriterion.startsWith("2.5.8") ? "AA" : "AA",
      principle: s.wcagCriterion.startsWith("1.") ? "Perceivable" : s.wcagCriterion.startsWith("2.") ? "Operable" : "Understandable",
      severity: s.severity,
      bucket: "needs_review",
      confidence: 0.6,
      sourceEngines: [vision.model],
      selector: null,
      elementHtml: null,
      failureSummary: s.summary,
      additionalInstances: 0,
      evidence: { vision: true, recommendation: s.recommendation },
    }));

    return Response.json({
      findings,
      summary: {
        imageName: file.name,
        imageType: file.type,
        imageBytes: file.size,
        visionModel: vision.model,
        visionError: vision.error,
        suggestedFindings: findings.length,
        note: "Vision suggestions require human review (needs_review bucket). Color-contrast failures are not measured from screenshots.",
      },
    });
  } catch (e) {
    console.error("POST /api/uploads/image error:", e);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
