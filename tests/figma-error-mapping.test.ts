import { describe, it, expect } from "vitest";
import { mapFigmaError } from "@/app/api/audit/figma/route";

describe("mapFigmaError — figma audit route error → HTTP status mapping", () => {
  it("maps a 404 from the Figma API to a friendly not-found message", () => {
    const result = mapFigmaError("Figma API error (404): {\"err\":\"Not found\"}");
    expect(result).toEqual({
      status: 404,
      error: "Figma file not found — check the file key or share URL.",
    });
  });

  it("maps a 403 to an access-denied message", () => {
    const result = mapFigmaError("Figma API error (403): forbidden");
    expect(result?.status).toBe(403);
    expect(result?.error).toMatch(/access denied/i);
  });

  it("maps a 429 to a rate-limit message", () => {
    const result = mapFigmaError("Figma API error (429): too many requests");
    expect(result?.status).toBe(429);
    expect(result?.error).toMatch(/rate limit/i);
  });

  it("maps a 5xx Figma outage to a 502 (we're the proxy, not the fault)", () => {
    const result = mapFigmaError("Figma API error (503): upstream down");
    expect(result?.status).toBe(502);
  });

  it("maps missing PAT to a 503 with a setup hint", () => {
    const result = mapFigmaError("FIGMA_PAT not configured");
    expect(result).toEqual({
      status: 503,
      error: "Figma disabled: add FIGMA_PAT to environment",
    });
  });

  it("maps an invalid file key to a 400, passing the message through", () => {
    const result = mapFigmaError("Invalid file key: abc123");
    expect(result).toEqual({ status: 400, error: "Invalid file key: abc123" });
  });

  it("maps an SSRF guard rejection to a 400", () => {
    const result = mapFigmaError("SSRF guard: host must be www.figma.com, got evil.com");
    expect(result?.status).toBe(400);
  });

  it("returns null for an unrecognized error, so the route falls back to a generic 500", () => {
    expect(mapFigmaError("some totally unexpected crash")).toBeNull();
  });
});
