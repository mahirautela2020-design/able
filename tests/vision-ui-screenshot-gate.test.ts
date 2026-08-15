import { describe, it, expect, vi, afterEach } from "vitest";

// vision.ts imports the "server-only" package, which unconditionally throws
// outside Next's bundler (it relies on webpack module conditions Next sets
// up, which vitest doesn't) — neutralize it so the real module under test
// can be imported directly.
vi.mock("server-only", () => ({}));

import { analyzeScreenshot } from "@/lib/vision";

function mockGeminiResponse(text: string) {
  return {
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
  };
}

describe("analyzeScreenshot — UI-screenshot classification (anti-fooling gate)", () => {
  const originalKey = process.env.GEMINI_API_KEY;

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  });

  it("flags a non-UI photo (isUiScreenshot: false) and returns no invented issues", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockGeminiResponse(
          JSON.stringify({
            isUiScreenshot: false,
            reason: "This is a photo of a person, not a UI screenshot.",
            issues: [],
          })
        )
      )
    );

    const result = await analyzeScreenshot(Buffer.from("fake"), "image/png");
    expect(result.isUiScreenshot).toBe(false);
    expect(result.screenshotReason).toMatch(/photo of a person/i);
    expect(result.suggestions).toEqual([]);
  });

  it("even if the model tries to sneak issues into a non-UI response, they're dropped", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockGeminiResponse(
          JSON.stringify({
            isUiScreenshot: false,
            reason: "Not a UI.",
            issues: [{ wcagCriterion: "1.1.1", summary: "should be ignored" }],
          })
        )
      )
    );

    const result = await analyzeScreenshot(Buffer.from("fake"), "image/png");
    expect(result.suggestions).toEqual([]);
  });

  it("parses a real UI screenshot response and keeps its suggestions", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockGeminiResponse(
          JSON.stringify({
            isUiScreenshot: true,
            reason: "A settings screen with buttons and form fields.",
            issues: [
              {
                wcagCriterion: "1.1.1",
                severity: "moderate",
                summary: "Icon-only button has no visible label.",
                recommendation: "Add an accessible name.",
              },
            ],
          })
        )
      )
    );

    const result = await analyzeScreenshot(Buffer.from("fake"), "image/png");
    expect(result.isUiScreenshot).toBe(true);
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].wcagCriterion).toBe("1.1.1");
  });

  it("degrades gracefully to isUiScreenshot: null for the legacy bare-array shape", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockGeminiResponse(
          JSON.stringify([
            { wcagCriterion: "1.4.3", summary: "low contrast text", severity: "minor" },
          ])
        )
      )
    );

    const result = await analyzeScreenshot(Buffer.from("fake"), "image/png");
    expect(result.isUiScreenshot).toBeNull();
    expect(result.suggestions).toHaveLength(1);
  });

  it("returns isUiScreenshot: null when no vision key is configured", async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const result = await analyzeScreenshot(Buffer.from("fake"), "image/png");
    expect(result.isUiScreenshot).toBeNull();
    expect(result.error).toMatch(/No vision API key/i);
  });
});
