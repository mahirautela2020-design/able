import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ExplorePanel } from "@/components/workbench/explore/explore-panel";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ExplorePanel ax-snapshot fetch — regression: raw JSON-parse error leaked into the UI", () => {
  it("shows a generic message, not the raw parser error, when the response isn't OK and its body isn't valid JSON (platform-level function crash/timeout)", async () => {
    // Simulates a Vercel function crash/timeout page — non-2xx status,
    // non-JSON body. Previously res.json() was called unconditionally
    // before checking res.ok, so this SyntaxError's message ("Unexpected
    // token 'A', "An error o"... is not valid JSON") was shown verbatim.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
          throw new SyntaxError(`Unexpected token 'A', "An error o"... is not valid JSON`);
        },
      })
    );

    render(<ExplorePanel targetUrl="https://example.com/page" auditId="audit-1" />);

    await waitFor(() => expect(screen.getByTestId("ax-tree-error")).toBeInTheDocument());
    const errorText = screen.getByTestId("ax-tree-error").textContent ?? "";
    expect(errorText).not.toMatch(/Unexpected token/);
    expect(errorText).toMatch(/Snapshot failed \(502\)/);
  });

  it("shows a generic message when a 200 response body itself isn't valid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected end of JSON input");
        },
      })
    );

    render(<ExplorePanel targetUrl="https://example.com/page" auditId="audit-1" />);

    await waitFor(() => expect(screen.getByTestId("ax-tree-error")).toBeInTheDocument());
    const errorText = screen.getByTestId("ax-tree-error").textContent ?? "";
    expect(errorText).not.toMatch(/Unexpected/);
  });
});
