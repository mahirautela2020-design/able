import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Workbench } from "@/components/workbench/workbench";

beforeEach(() => {
  // jsdom doesn't implement these — the PDF download path calls them.
  URL.createObjectURL = vi.fn(() => "blob:mock-url");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubFetch({ postAuditsCalled }: { postAuditsCalled: (body: unknown) => void }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.startsWith("/api/preview-check")) {
        return { ok: true, json: async () => ({ blocked: false }) };
      }
      if (url.includes("/pdf")) {
        return { ok: true, blob: async () => new Blob(["fake-pdf"]) };
      }
      if (url === "/api/audits" && init?.method === "POST") {
        postAuditsCalled(init.body ? JSON.parse(init.body as string) : null);
        return { ok: true, json: async () => ({ id: "new-audit-id" }) };
      }
      return { ok: true, json: async () => ({}) };
    })
  );
}

describe("Workbench — warn before a completed audit's results become hard to find (regression: Re-run/URL-edit navigated away with no warning)", () => {
  it("shows a warning instead of immediately re-running when the audit is complete and nothing has been downloaded yet", async () => {
    const postAuditsCalled = vi.fn();
    stubFetch({ postAuditsCalled });
    render(
      <Workbench auditId="audit-1" targetUrl="https://example.com" auditStatus="complete" findings={[]} />
    );

    fireEvent.click(screen.getByText("Re-run"));

    expect(
      screen.getByText("Download this report before starting a new audit?")
    ).toBeInTheDocument();
    expect(postAuditsCalled).not.toHaveBeenCalled();
  });

  it("'Continue anyway' proceeds with the re-run without downloading", async () => {
    const postAuditsCalled = vi.fn();
    stubFetch({ postAuditsCalled });
    render(
      <Workbench auditId="audit-1" targetUrl="https://example.com" auditStatus="complete" findings={[]} />
    );

    fireEvent.click(screen.getByText("Re-run"));
    fireEvent.click(screen.getByText("Continue anyway"));

    await waitFor(() => expect(postAuditsCalled).toHaveBeenCalled());
    expect(
      screen.queryByText("Download this report before starting a new audit?")
    ).not.toBeInTheDocument();
  });

  it("'Download PDF' downloads the report then proceeds with the re-run", async () => {
    const postAuditsCalled = vi.fn();
    stubFetch({ postAuditsCalled });
    render(
      <Workbench auditId="audit-1" targetUrl="https://example.com" auditStatus="complete" findings={[]} />
    );

    fireEvent.click(screen.getByText("Re-run"));
    // Two "Download PDF" buttons are visible at this point — the top
    // toolbar's (always shown once complete) and the warning modal's own.
    // The modal's is the one rendered last in the DOM.
    const downloadButtons = screen.getAllByText("Download PDF");
    fireEvent.click(downloadButtons[downloadButtons.length - 1]);

    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
    await waitFor(() => expect(postAuditsCalled).toHaveBeenCalled());
  });

  it("skips the warning once a PDF has already been downloaded this session", async () => {
    const postAuditsCalled = vi.fn();
    stubFetch({ postAuditsCalled });
    render(
      <Workbench auditId="audit-1" targetUrl="https://example.com" auditStatus="complete" findings={[]} />
    );

    fireEvent.click(screen.getByText("Download PDF"));
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());

    fireEvent.click(screen.getByText("Re-run"));

    expect(
      screen.queryByText("Download this report before starting a new audit?")
    ).not.toBeInTheDocument();
    await waitFor(() => expect(postAuditsCalled).toHaveBeenCalled());
  });

  it("does not warn for a non-complete audit (nothing finished to lose yet)", async () => {
    const postAuditsCalled = vi.fn();
    stubFetch({ postAuditsCalled });
    render(
      <Workbench auditId="audit-1" targetUrl="https://example.com" auditStatus="failed" findings={[]} />
    );

    // A failed audit shows a second, small "Re-run" button in the left
    // status column in addition to the toolbar's — click the toolbar one
    // (the last "Re-run" button in the DOM), same as the other tests here.
    const rerunButtons = screen.getAllByText("Re-run");
    fireEvent.click(rerunButtons[rerunButtons.length - 1]);

    expect(
      screen.queryByText("Download this report before starting a new audit?")
    ).not.toBeInTheDocument();
    await waitFor(() => expect(postAuditsCalled).toHaveBeenCalled());
  });
});
