import { describe, it, expect, vi, beforeEach } from "vitest";

// Mirrors tests/apk-upload-idor.test.ts -- same FK-backed exploit
// (mobile_artifacts.audit_id references audits(id)) and same fix, applied
// to the iOS upload route.
const { requireSession } = vi.hoisted(() => ({
  requireSession: vi.fn(async () => ({ ok: true, userId: "user-b" })),
}));
vi.mock("@/lib/supabase/session", () => ({ requireSession }));

const { getAudit } = vi.hoisted(() => ({
  getAudit: vi.fn(async () => ({
    id: "audit-owned-by-user-a",
    created_by: "user-a",
    created_ip: "9.9.9.9",
  })),
}));
vi.mock("@/lib/http", () => ({ getClientIp: () => "1.2.3.4" }));

const insertMock = vi.hoisted(() => vi.fn(async () => ({ error: null })));
vi.mock("@/lib/supabase/server", () => ({
  supabase: { from: () => ({ insert: insertMock }) },
  uploadEvidence: vi.fn(async (_buf: Buffer, path: string) => path),
  getAudit,
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

async function reqFor(auditId: string): Promise<Request> {
  const ipaBytes = await buildIpa({ CFBundleIdentifier: "com.example.min" });
  const file = makeFile("app.ipa", ipaBytes);
  const formData = {
    get: (key: string) => (key === "file" ? file : key === "auditId" ? auditId : null),
  };
  return {
    headers: { get: () => "multipart/form-data; boundary=xyz" },
    formData: async () => formData,
  } as unknown as Request;
}

beforeEach(() => {
  requireSession.mockResolvedValue({ ok: true, userId: "user-b" });
  getAudit.mockReset();
  getAudit.mockResolvedValue({
    id: "audit-owned-by-user-a",
    created_by: "user-a",
    created_ip: "9.9.9.9",
  });
});

describe("POST /api/uploads/ipa -- ownership of the target auditId", () => {
  it("must NOT let an authenticated caller upload into an audit they don't own", async () => {
    const res = await POST(await reqFor("audit-owned-by-user-a"));
    expect(res.status).toBe(403);
  });

  it("still allows a brand-new auditId with no existing row", async () => {
    getAudit.mockRejectedValue(new Error("row not found"));
    const res = await POST(await reqFor("fresh-client-generated-id"));
    expect(res.status).not.toBe(403);
  });
});
