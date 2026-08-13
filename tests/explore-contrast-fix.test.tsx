import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ContrastFix } from "@/components/workbench/explore/contrast-fix";
import type { InspectedElement } from "@/lib/explore/types";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/supabase/client", () => ({
  authHeaders: vi.fn(async () => ({ Authorization: "Bearer test-token" })),
}));

import { toast } from "sonner";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const failing: InspectedElement = {
  role: "button",
  name: "Subscribe",
  tag: "button",
  selector: "#cta",
  aria: {},
  fontSize: "16px",
  touchTarget: { width: 120, height: 40 },
  tabIndex: 0,
  ancestors: ["main"],
  bbox: { x: 0, y: 0, width: 120, height: 40 },
  computed: { color: "#7a7a7a", backgroundColor: "#ffffff" },
};

describe("ContrastFix", () => {
  it("shows a failing contrast verdict with a fix", () => {
    render(<ContrastFix element={failing} auditId="audit-1" onApply={() => {}} />);
    expect(screen.getByTestId("contrast-verdict")).toHaveTextContent("fails AA");
    expect(screen.getByText(/Suggested fix/)).toBeInTheDocument();
  });

  it("apply fix calls onApply with the selector and a hex color", () => {
    const onApply = vi.fn();
    render(<ContrastFix element={failing} auditId="audit-1" onApply={onApply} />);
    fireEvent.click(screen.getByText("Apply fix"));
    expect(onApply).toHaveBeenCalledWith("#cta", expect.stringMatching(/^#[0-9a-f]{6}$/));
  });

  it("shows a passing verdict for a compliant element", () => {
    const passing: InspectedElement = {
      ...failing,
      computed: { color: "#000000", backgroundColor: "#ffffff" },
    };
    render(<ContrastFix element={passing} auditId="audit-1" onApply={() => {}} />);
    expect(screen.getByTestId("contrast-verdict")).toHaveTextContent("passes");
    expect(screen.queryByText(/Suggested fix/)).not.toBeInTheDocument();
  });

  it("shows empty state when nothing picked", () => {
    render(<ContrastFix element={null} auditId="audit-1" onApply={() => {}} />);
    expect(screen.getByTestId("contrast-fix-empty")).toBeInTheDocument();
  });

  it("shows the APCA Lc value labeled as informational", () => {
    render(<ContrastFix element={failing} auditId="audit-1" onApply={() => {}} />);
    const apca = screen.getByTestId("apca-readout");
    expect(apca).toHaveTextContent(/Lc/i);
    expect(apca).toHaveTextContent(/informational/i);
  });

  it("defaults to AA normal-text target — passing element shows no fix", () => {
    const passing: InspectedElement = { ...failing, computed: { color: "#000000", backgroundColor: "#ffffff" } };
    render(<ContrastFix element={passing} auditId="audit-1" onApply={() => {}} />);
    expect(screen.queryByText(/Suggested fix/)).not.toBeInTheDocument();
  });

  it("switching the target to AAA can turn a passing-AA element into a needs-fix element", () => {
    // #767676 on white is ~4.5:1 — passes AA-normal (4.5) but fails AAA-normal (7.0)
    const borderline: InspectedElement = { ...failing, computed: { color: "#767676", backgroundColor: "#ffffff" } };
    render(<ContrastFix element={borderline} auditId="audit-1" onApply={() => {}} />);
    expect(screen.queryByText(/Suggested fix/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("target-level-aaa"));

    expect(screen.getByText(/Suggested fix/)).toBeInTheDocument();
  });

  it("switching to large text lowers the required ratio (fewer fixes needed)", () => {
    // ~4.0:1 — fails AA-normal (4.5) but passes AA-large (3.0)
    const midGray: InspectedElement = { ...failing, computed: { color: "#7f7f7f", backgroundColor: "#ffffff" } };
    render(<ContrastFix element={midGray} auditId="audit-1" onApply={() => {}} />);
    expect(screen.getByText(/Suggested fix/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("target-size-large"));

    expect(screen.queryByText(/Suggested fix/)).not.toBeInTheDocument();
  });

  it("Flag finding posts to the contrast-finding route and shows a success toast", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ success: true, ratio: 4.29 }),
      })
    );

    render(<ContrastFix element={failing} auditId="audit-1" onApply={() => {}} />);
    fireEvent.click(screen.getByText("Flag finding"));

    await waitFor(() => expect(toast.success).toHaveBeenCalled());

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/audits/audit-1/contrast-finding",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
      })
    );
    const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(options.body as string);
    expect(body.selector).toBe("#cta");
    expect(body.fg).toBe("#7a7a7a");
    expect(body.bg).toBe("#ffffff");
    expect(body.bbox).toEqual(failing.bbox);
  });

  it("Flag finding shows an error toast on failure and does not disable re-flagging", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: "boom" }) })
    );

    render(<ContrastFix element={failing} auditId="audit-1" onApply={() => {}} />);
    fireEvent.click(screen.getByText("Flag finding"));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.getByText("Flag finding")).not.toBeDisabled();
  });

  it("disables re-flagging the same selector after a successful flag (client-side only)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ success: true }) })
    );

    render(<ContrastFix element={failing} auditId="audit-1" onApply={() => {}} />);
    fireEvent.click(screen.getByText("Flag finding"));

    await waitFor(() => expect(screen.getByText("Flagged")).toBeInTheDocument());
    expect(screen.getByText("Flagged")).toBeDisabled();
  });
});
