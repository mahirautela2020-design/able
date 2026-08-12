import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/session", () => ({
  requireSession: vi.fn(async () => ({ ok: true as const, userId: "user-1" })),
}));

vi.mock("@/lib/supabase/server", () => ({
  supabase: {
    from: () => ({ insert: () => ({ error: null }) }),
  },
  uploadEvidence: vi.fn(async () => "https://example.com/evidence/test.ipa"),
}));

import { POST } from "@/app/api/uploads/ipa/route";
import { buildIpa } from "./helpers/ipa-fixture";

function makeFile(name: string, content: Buffer) {
  const bytes = new Uint8Array(content.length);
  bytes.set(content);
  return {
    name,
    size: content.length,
    arrayBuffer: async () => bytes.buffer as ArrayBuffer,
  };
}

function makeRequest(file: unknown, auditId = "audit-1"): Request {
  const formData = {
    get: (key: string) => (key === "file" ? file : key === "auditId" ? auditId : null),
  };
  return {
    headers: { get: () => "multipart/form-data; boundary=xyz" },
    formData: async () => formData,
  } as unknown as Request;
}

describe("POST /api/uploads/ipa", () => {
  it("returns 400 when no file is provided", async () => {
    const res = await POST(makeRequest(null));
    expect(res.status).toBe(400);
  });

  it("returns 400 when the filename is not .ipa", async () => {
    const res = await POST(makeRequest(makeFile("app.apk", Buffer.from([0x50, 0x4b]))));
    expect(res.status).toBe(400);
  });

  it("returns 400 for a malformed bundle (no Payload)", async () => {
    const res = await POST(makeRequest(makeFile("broken.ipa", Buffer.from("not a zip"))));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeTruthy();
  });

  it("returns 200 with bundle + needs_review findings + guided checklist", async () => {
    const ipa = await buildIpa({ CFBundleIdentifier: "com.example.min" });
    const res = await POST(makeRequest(makeFile("app.ipa", ipa)));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.bundle).toBeTruthy();
    expect(data.bundle.bundleId).toBe("com.example.min");
    expect(Array.isArray(data.findings)).toBe(true);
    expect(data.findings.length).toBeGreaterThan(0);
    for (const f of data.findings) {
      expect(f.severity).toBe("needs_review");
      expect(f.source).toBe("ios-static");
      expect(f.criterion).toBeTruthy();
      expect(f.message).toBeTruthy();
    }
    expect(Array.isArray(data.guidedChecklist)).toBe(true);
    expect(data.guidedChecklist.length).toBeGreaterThan(0);
    for (const step of data.guidedChecklist) {
      expect(step.requiresMacOs).toBe(true);
    }
  });
});
