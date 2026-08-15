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
 *
 * Unlike the APK/IPA upload routes, this one doesn't persist anything to
 * per-audit storage (no auditId, no ownership to protect) — it's a
 * stateless one-shot analysis, so — matching the free-tier anonymous
 * policy already used for URL audits (5/day per IP) — no session is
 * required. Previously this hard-required a session, which is exactly why
 * anonymous users hit "Missing or invalid authorization header" here even
 * though URL audits worked fine for them.
 */
export async function POST(request: Request) {
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

    // ── Anti-fooling gate: reject uploads that plainly aren't a UI
    // screenshot (a photo of a person, a landscape, etc) before treating
    // them as one. Primary signal is the vision model's explicit
    // classification. The deterministic detector can only OVERRIDE a
    // "not a UI" verdict — if it measured real UI-shaped bounding boxes,
    // trust that over the model. It can't be required to agree, though:
    // the Python detector is unavailable on serverless (`degraded: true`
    // in production for most deployments), so requiring its confirmation
    // would make this gate never fire in the environment that matters most.
    if (vision.isUiScreenshot === false && detection.elements.length === 0) {
      return Response.json(
        {
          error:
            vision.screenshotReason ||
            "This doesn't look like a UI/website screenshot. Upload a screenshot of a website or app interface instead.",
        },
        { status: 422 }
      );
    }

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
        isUiScreenshot: vision.isUiScreenshot,
        note: "Vision suggestions require human review (needs_review bucket). Deterministic findings are measured (element boxes + pixel sampling), not LLM guesses.",
      },
    });
  } catch (e) {
    console.error("POST /api/uploads/image error:", e);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
