import "server-only";

/**
 * Vision layer for ScanA11y image mode.
 *
 * ACCURACY DOCTRINE: LLM output is ALWAYS advisory. Deterministic checks
 * (axe-core, color math) create violations; the vision model only
 * *suggests* findings that land in the needs_review bucket — a human
 * confirms before they become real issues.
 *
 * Production path: Google Gemini (HTTP API, works in serverless functions).
 * Fallback: any OpenAI-compatible vision endpoint via env override.
 */

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export interface VisionSuggestion {
  /** WCAG criterion the model suspects (e.g. "1.1.1", "1.4.3") */
  wcagCriterion: string;
  severity: "moderate" | "minor";
  summary: string;
  recommendation: string;
}

export interface VisionResult {
  model: string;
  suggestions: VisionSuggestion[];
  rawText: string | null;
  error: string | null;
}

function getConfig() {
  return {
    apiKey:
      process.env.GEMINI_API_KEY ??
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
      null,
    // Default: gemini-2.5-flash — cheap, strong vision, serverless-friendly.
    // Override with VISION_MODEL for e.g. "mimo-v2.5" (opencode-go) or a
    // Gemini Pro model.
    model: process.env.VISION_MODEL || "gemini-2.5-flash",
  };
}

const PROMPT = `You are an accessibility expert reviewing a UI screenshot for WCAG 2.2 issues.
Analyze the image and return ONLY a JSON array of potential issues, each with:
- "wcagCriterion": the WCAG success criterion id (e.g. "1.1.1", "1.4.3", "2.5.8", "3.3.2")
- "severity": "moderate" or "minor"
- "summary": one sentence describing the suspected issue
- "recommendation": one sentence with a concrete fix

Rules:
- These are SUGGESTIONS, not verdicts. Flag only what you can SEE in the image.
- Never claim color-contrast failures numerically — you cannot measure contrast
  from a screenshot reliably; leave 1.4.3 to the contrast engine.
- Focus on: missing alt text (1.1.1), small touch targets (2.5.8), missing
  labels on inputs (3.3.2), sensory-only instructions (1.3.3), low-clarity text.
- Return an empty array [] if nothing is clearly wrong.
- Output valid JSON only — no markdown fences, no commentary.`;

/**
 * Ask the vision model to suggest accessibility issues in a screenshot.
 * Returns structured suggestions; never throws for model errors — the
 * caller treats failures as "no suggestions" so audits don't break.
 */
export async function analyzeScreenshot(
  imageBuffer: Buffer,
  mimeType: string
): Promise<VisionResult> {
  const { apiKey, model } = getConfig();
  if (!apiKey) {
    return {
      model,
      suggestions: [],
      rawText: null,
      error: "No vision API key configured (GEMINI_API_KEY)",
    };
  }

  try {
    const b64 = imageBuffer.toString("base64");
    const body = JSON.stringify({
      contents: [
        {
          parts: [
            { text: PROMPT },
            {
              inline_data: { mime_type: mimeType, data: b64 },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 4096,
      },
    });

    const res = await fetch(
      `${GEMINI_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(30_000),
      }
    );

    if (!res.ok) {
      return {
        model,
        suggestions: [],
        rawText: null,
        error: `Vision API error ${res.status}`,
      };
    }

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text =
      data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";

    const suggestions = parseSuggestions(text);
    return { model, suggestions, rawText: text, error: null };
  } catch (e) {
    return {
      model,
      suggestions: [],
      rawText: null,
      error: (e as Error).message,
    };
  }
}

/** Tolerantly parse the model's JSON array (strip fences/whitespace). */
function parseSuggestions(text: string): VisionSuggestion[] {
  try {
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
    const parsed = JSON.parse(cleaned) as VisionSuggestion[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (s) =>
          typeof s.wcagCriterion === "string" &&
          typeof s.summary === "string"
      )
      .map((s) => ({
        wcagCriterion: s.wcagCriterion,
        severity: s.severity === "minor" ? "minor" : "moderate",
        summary: s.summary,
        recommendation: s.recommendation ?? "",
      }));
  } catch {
    return [];
  }
}
