import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Workbench } from "@/components/workbench/workbench";

vi.mock("@/lib/supabase/client", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
  authHeaders: vi.fn(async () => ({})),
}));

afterEach(() => vi.unstubAllGlobals());

function stub(reportStatus: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("/cancel")) {
        return { ok: true, json: async () => ({ ok: true, status: "failed", error_code: "CANCELLED" }) };
      }
      if (u.includes("/report")) {
        return { ok: true, json: async () => ({ audit: { status: reportStatus }, findings: [] }) };
      }
      return { ok: true, json: async () => ({ blocked: false }) };
    })
  );
}

describe("Workbench — audit status states + Stop", () => {
  it("shows a Stop control while running and stops the audit into a 'Stopped' state with Retry", async () => {
    stub("running");
    render(
      <Workbench auditId="a1" targetUrl="https://example.com" auditStatus="running" findings={[]} />
    );

    expect(await screen.findByText("Running")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Stop"));

    await waitFor(() => expect(screen.getByText("Stopped")).toBeInTheDocument());
    expect(screen.getByText("Retry")).toBeInTheDocument();
    expect(screen.queryByText("Stop")).not.toBeInTheDocument();
  });

  it("labels a completed audit 'Completed'", async () => {
    stub("complete");
    render(
      <Workbench auditId="a1" targetUrl="https://example.com" auditStatus="complete" findings={[]} />
    );
    expect(await screen.findByText("Completed")).toBeInTheDocument();
  });
});
