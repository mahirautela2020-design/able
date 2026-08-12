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
  const provider = process.env.VISION_PROVIDER || "gemini";
  const model = process.env.VISION_MODEL || "gemini-2.5-flash";

  // Each provider uses ITS OWN key — never cross-send keys between
  // endpoints (Gemini key to opencode zen → 401, and vice versa).
  const apiKey =
    provider === "opencode"
      ? process.env.OPENCODE_GO_API_KEY ?? null
      : process.env.GEMINI_API_KEY ??
        process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
        null;

  return { apiKey, model, provider };
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
  const { apiKey, model, provider } = getConfig();
  if (!apiKey) {
    return {
      model,
      suggestions: [],
      rawText: null,
      error: "No vision API key configured (GEMINI_API_KEY / OPENCODE_GO_API_KEY)",
    };
  }

  try {
    const b64 = imageBuffer.toString("base64");
    const text =
      provider === "opencode"
        ? await callOpenCodeVision(apiKey, model, b64, mimeType)
        : await callGeminiVision(apiKey, model, b64, mimeType);

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

/** Gemini: Google generativelanguage HTTP API (native multimodal). */
async function callGeminiVision(
  apiKey: string,
  model: string,
  b64: string,
  mimeType: string
): Promise<string> {
  const body = JSON.stringify({
    contents: [
      {
        parts: [
          { text: PROMPT },
          { inline_data: { mime_type: mimeType, data: b64 } },
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
    throw new Error(`Vision API error ${res.status}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
}

/** OpenCode zen: OpenAI-compatible chat completions at opencode.ai/zen/v1. */
async function callOpenCodeVision(
  apiKey: string,
  model: string,
  b64: string,
  mimeType: string
): Promise<string> {
  const body = JSON.stringify({
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: PROMPT },
          {
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${b64}` },
          },
        ],
      },
    ],
    max_tokens: 4096,
  });

  const res = await fetch("https://opencode.ai/zen/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body,
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    throw new Error(`OpenCode vision API error ${res.status}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string | null; reasoning?: string } }[];
  };
  const msg = data.choices?.[0]?.message;
  return msg?.content ?? msg?.reasoning ?? "";
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
