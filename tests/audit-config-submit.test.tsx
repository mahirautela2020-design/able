import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
  usePathname: () => "/audit-config",
  useSearchParams: () => new URLSearchParams(),
}));

import AuditConfigPage from "@/app/audit-config/page";
import { toast } from "sonner";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("AuditConfigPage — Start Audit submission", () => {
  it("POSTs the URL and the enabled module ids, then navigates to the new workbench", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "audit-123" }) })
    );

    render(<AuditConfigPage />);

    fireEvent.change(screen.getByPlaceholderText("https://example.com"), {
      target: { value: "https://example.org" },
    });
    fireEvent.click(screen.getByText("Start Audit"));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/workbench/audit-123"));

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/audits",
      expect.objectContaining({ method: "POST" })
    );
    const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(options.body as string);
    expect(body.url).toBe("https://example.org");
    expect(Array.isArray(body.modules)).toBe(true);
    // Default preset is "standard" — automated/needs-review are always in.
    expect(body.modules).toEqual(expect.arrayContaining(["automated", "needs-review"]));
  });

  it("shows an error toast and does not navigate when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Invalid URL" }) })
    );

    render(<AuditConfigPage />);
    fireEvent.change(screen.getByPlaceholderText("https://example.com"), {
      target: { value: "https://example.org" },
    });
    fireEvent.click(screen.getByText("Start Audit"));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Invalid URL"));
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("the Start Audit button is disabled until a URL is entered", () => {
    render(<AuditConfigPage />);
    expect(screen.getByText("Start Audit").closest("button")).toBeDisabled();
  });
});

describe("AuditConfigPage — preset staleness fix", () => {
  it("resets the displayed preset to Custom after a manual module toggle", () => {
    render(<AuditConfigPage />);

    expect(screen.getByText("standard")).toBeInTheDocument();

    // "keyboard" is optional (not required), so it's actually toggleable.
    fireEvent.click(screen.getByTestId("module-keyboard"));

    expect(screen.getByText("Custom")).toBeInTheDocument();
    expect(screen.queryByText("standard")).not.toBeInTheDocument();
  });
});
