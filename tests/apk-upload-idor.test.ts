import { describe, it, expect, vi, beforeEach } from "vitest";

// POST /api/uploads/apk (src/app/api/uploads/apk/route.ts) accepts an
// `auditId` form field supplied by the client and writes to
// `${auditId}/uploads/<file>` in the shared "evidence" storage bucket, plus
// an `INSERT INTO mobile_artifacts (audit_id, ...)` row -- for WHATEVER
// auditId the caller passes. mobile_artifacts.audit_id has a hard FK to
// audits(id) (0003_mobile_and_code.sql), so this is only exploitable
// against an auditId that ALREADY has a real audits row -- e.g. one created
// via URL or PDF mode, or a prior APK/iOS upload -- attaching fabricated
// Android findings (or an arbitrary file) to a stranger's real audit. Fixed
// by checking ownership of any EXISTING audit before writing.
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

const insertMock = vi.hoisted(() =>
  vi.fn(async (_table: string, _row: Record<string, unknown>) => ({ error: null }))
);
const fromMock = vi.hoisted(() =>
  vi.fn((table: string) => ({
    insert: (row: Record<string, unknown>) => insertMock(table, row),
  }))
);
const uploadEvidence = vi.hoisted(() => vi.fn(async (_buf: Buffer, path: string) => path));
vi.mock("@/lib/supabase/server", () => ({
  supabase: { from: fromMock },
  uploadEvidence,
  getAudit,
}));

vi.mock("@/lib/android/manifest", () => ({
  parseApkManifestFromBuffer: vi.fn(() => null),
}));
vi.mock("@/lib/android/dynamic", () => ({
  runDynamicAudit: vi.fn(async () => ({ ran: false, screens: [] })),
}));

import { POST } from "@/app/api/uploads/apk/route";

beforeEach(() => {
  requireSession.mockResolvedValue({ ok: true, userId: "user-b" });
  getAudit.mockReset();
  getAudit.mockResolvedValue({
    id: "audit-owned-by-user-a",
    created_by: "user-a",
    created_ip: "9.9.9.9",
  });
  insertMock.mockClear();
  fromMock.mockClear();
  uploadEvidence.mockClear();
});

// Matches the fake-Request style used by tests/ios-ipa-upload.test.ts --
// avoids depending on undici's real multipart/FormData parsing, which the
// apk/ipa routes access only via `request.formData()`.
function makeFile(name: string, content: Buffer) {
  const bytes = new Uint8Array(content.length);
  bytes.set(content);
  return {
    name,
    size: content.length,
    arrayBuffer: async () => bytes.buffer as ArrayBuffer,
  };
}

function reqFor(auditId: string): Request {
  const file = makeFile("app.apk", Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  const formData = {
    get: (key: string) => (key === "file" ? file : key === "auditId" ? auditId : null),
  };
  return {
    headers: { get: () => "multipart/form-data; boundary=xyz" },
    formData: async () => formData,
  } as unknown as Request;
}

describe("POST /api/uploads/apk -- ownership of the target auditId", () => {
  it("must NOT let an authenticated caller upload into an audit they don't own", async () => {
    // "audit-owned-by-user-a" belongs to a different account than the
    // caller (user-b). A correctly-scoped route would reject this (403/404)
    // the same way the PDF finalize route rejects a foreign auditId.
    const res = await POST(reqFor("audit-owned-by-user-a"));

    expect(res.status).toBe(403);
    // The write into another user's audit folder / mobile_artifacts row
    // must never happen for a caller who doesn't own that audit.
    expect(uploadEvidence).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("still allows a brand-new auditId with no existing row (today's common case)", async () => {
    getAudit.mockRejectedValue(new Error("row not found"));

    const res = await POST(reqFor("fresh-client-generated-id"));

    expect(res.status).toBe(200);
    expect(uploadEvidence).toHaveBeenCalled();
  });

  it("allows the real owner to upload into their own audit", async () => {
    requireSession.mockResolvedValue({ ok: true, userId: "user-a" });

    const res = await POST(reqFor("audit-owned-by-user-a"));

    expect(res.status).toBe(200);
    expect(uploadEvidence).toHaveBeenCalled();
  });
});
