import { requireSession } from "@/lib/supabase/session";
import { analyzeScreenshot } from "@/lib/vision";
import { runDetector } from "@/lib/audit/detection";
import type { DetectionFinding } from "@/lib/audit/detection-types";
import { checkTouchTargets } from "@/lib/audit/touch-targets";
import { checkIconContrast } from "@/lib/audit/icon-contrast";

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

    // ── 2. Deterministic UI-element detection (local only) ──
    // The Python detector measures bounding boxes (2.5.8) and icon contrast
    // (1.4.11) with math. It is a separate process (AGPL boundary) and
    // degrades gracefully to LLM-advisory-only when absent (serverless).
    const detection = await runDetector(buffer);
    let deterministicFindings: DetectionFinding[] = [];
    if (!detection.degraded && detection.elements.length > 0) {
      const touchFindings = checkTouchTargets(detection.elements, 1);
      const iconFindings = await checkIconContrast(detection.elements, buffer);
      deterministicFindings = [...touchFindings, ...iconFindings];
    }

    // ── 3. Build findings (deterministic first, vision stays advisory) ──
    const visionFindings = vision.suggestions.map((s) => ({
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

    const findings = [...deterministicFindings, ...visionFindings];

    return Response.json({
      findings,
      summary: {
        imageName: file.name,
        imageType: file.type,
        imageBytes: file.size,
        visionModel: vision.model,
        visionError: vision.error,
        suggestedFindings: visionFindings.length,
        deterministicFindings: deterministicFindings.length,
        elementsDetected: detection.elements.length,
        detectionModel: detection.model,
        detectionDegraded: detection.degraded,
        detectionReason: detection.reason,
        note: "Vision suggestions require human review (needs_review bucket). Deterministic findings are measured (element boxes + pixel sampling), not LLM guesses.",
      },
    });
  } catch (e) {
    console.error("POST /api/uploads/image error:", e);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
