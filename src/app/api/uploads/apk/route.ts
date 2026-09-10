import { runDynamicAudit } from "@/lib/android/dynamic";
import type { DynamicScreen } from "@/lib/android/dynamic";
import type { DynamicFinding } from "@/lib/android/dynamic-checks";
import { parseApkManifestFromBuffer } from "@/lib/android/manifest";
import { supabase, uploadEvidence, getAudit } from "@/lib/supabase/server";
import { requireSession } from "@/lib/supabase/session";
import { getClientIp } from "@/lib/http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const MAX_APK_SIZE_MB = 200;

export interface ApkSizeResult {
  ok: boolean;
  error?: string;
}

/** Reject oversized uploads before they hit memory/storage (RISKS #3 — size bomb). */
export function checkApkSize(sizeBytes: number): ApkSizeResult {
  const sizeMb = sizeBytes / (1024 * 1024);
  if (sizeMb > MAX_APK_SIZE_MB) {
    return {
      ok: false,
      error: `File too large: ${sizeMb.toFixed(1)}MB exceeds ${MAX_APK_SIZE_MB}MB limit`,
    };
  }
  return { ok: true };
}

/** Strip path separators and control chars so a user-supplied filename can't
 * traverse the storage key space (e.g. "../../other/audit/x.apk"). */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  return base.replace(/[^\w.\-]/g, "_").slice(0, 100);
}

export async function POST(request: Request) {
  // requireSession only proves *a* session exists, not that it's this
  // audit's owner -- the actual guard is the ownership check below, once
  // auditId is in hand. (A "session is enough" comment used to sit here;
  // it was wrong, matching the bug class fixed across the /audits/[id]/*
  // routes -- see cancel/route.ts.)
  const auth = await requireSession(request);
  if (!auth.ok) return auth.response;
  const ip = getClientIp(request);

  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return Response.json({ error: "Expected multipart/form-data" }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const auditId = formData.get("auditId") as string | null;

    if (!file) {
      return Response.json({ error: "File is required" }, { status: 400 });
    }

    if (!auditId) {
      return Response.json({ error: "auditId is required" }, { status: 400 });
    }

    // mobile_artifacts.audit_id has a hard FK to audits(id) -- today no
    // `audits` row is ever created for an APK/iOS submission (insertAudit
    // is only called from the URL and PDF-init routes), so this insert
    // silently fails downstream for a brand-new client-generated id (a
    // pre-existing, separate functional gap, not addressed here). What
    // MUST be rejected here is the exploitable case: `auditId` referencing
    // an audit that DOES already exist (created via URL/PDF/a prior
    // upload) and belongs to someone else -- without this check, any
    // signed-in caller could attach fabricated Android findings, or an
    // arbitrary file, to a stranger's real audit.
    let existing: Awaited<ReturnType<typeof getAudit>> | null = null;
    try {
      existing = await getAudit(auditId);
    } catch {
      existing = null; // no row yet -- fine, this is the common case today
    }
    if (existing) {
      const isOwner = existing.created_by
        ? auth.ok && existing.created_by === auth.userId
        : !!ip && existing.created_ip === ip;
      if (!isOwner) {
        return Response.json(
          { error: "You don't have permission to upload to this audit" },
          { status: 403 }
        );
      }
    }

    if (!file.name.endsWith(".apk")) {
      return Response.json({ error: "Only .apk files are accepted" }, { status: 400 });
    }

    const sizeCheck = checkApkSize(file.size);
    if (!sizeCheck.ok) {
      return Response.json({ error: sizeCheck.error }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const safeName = sanitizeFilename(file.name);
    const evidencePath = `${auditId}/uploads/${safeName}`;
    let apkPath: string;
    try {
      apkPath = await uploadEvidence(buffer, evidencePath, "application/vnd.android.package-archive");
    } catch (e) {
      return Response.json(
        { error: `Upload failed: ${(e as Error).message}` },
        { status: 500 }
      );
    }

    const manifest = parseApkManifestFromBuffer(buffer);

    if (manifest) {
      const { error } = await supabase
        .from("mobile_artifacts")
        .insert({
          audit_id: auditId,
          platform: "android",
          apk_path: apkPath,
          bundle_id: manifest.package || null,
          min_sdk: manifest.minSdk || null,
          target_sdk: manifest.targetSdk || null,
          permissions: manifest.permissions,
          activities: manifest.activities,
          services: manifest.services,
          manifest_json: manifest,
          file_size: file.size,
        });

      if (error) {
        console.error("Insert mobile_artifacts error:", error);
      }
    }

    // ── Dynamic pass (emulator) — gated by AVD_NAME / APK_DYNAMIC; degrades to
    // static-only when the emulator is absent. Findings are measured, not LLM.
    let dynamic: { ran: boolean; screens: DynamicScreen[] } = { ran: false, screens: [] };
    try {
      const tmpDir = mkdtempSync(join(tmpdir(), "apk-dynamic-"));
      const tmpApk = join(tmpDir, "app.apk");
      try {
        writeFileSync(tmpApk, buffer);
        const result = await runDynamicAudit(tmpApk, { package: manifest?.package ?? null });
        dynamic = { ran: result.ran, screens: result.screens };
      } finally {
        try {
          rmSync(tmpDir, { recursive: true, force: true });
        } catch {
          // best-effort cleanup
        }
      }
    } catch {
      dynamic = { ran: false, screens: [] };
    }

    const dynamicFindings: DynamicFinding[] = dynamic.screens.flatMap((s) => s.findings);

    return Response.json({
      success: true,
      apkPath,
      manifest: manifest
        ? {
            package: manifest.package,
            minSdk: manifest.minSdk,
            targetSdk: manifest.targetSdk,
            permissions: manifest.permissions.length,
            activities: manifest.activities.length,
          }
        : null,
      dynamic,
      findings: dynamicFindings,
    });
  } catch (e) {
    console.error("POST /api/uploads/apk error:", e);
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
