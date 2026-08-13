import { parseIpa, IpaParseError } from "@/lib/ios/ipa";
import { runIosChecks } from "@/lib/ios/checks";
import { IOS_GUIDED_CHECKLIST } from "@/lib/ios/guided-checklist";
import { supabase, uploadEvidence } from "@/lib/supabase/server";
import { requireSession } from "@/lib/supabase/session";

const MAX_IPA_SIZE_MB = 200;

/** Strip path separators and control chars so a user-supplied filename can't
 * traverse the storage key space (e.g. "../../other/audit/x.ipa"). */
function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  return base.replace(/[^\w.\-]/g, "_").slice(0, 100);
}

/**
 * POST /api/uploads/ipa — static analysis of an iOS .ipa bundle.
 *
 * Mirrors the APK route: session-guarded multipart, sanitized filename, stream
 * to Supabase storage, then a pure static parse → deterministic `needs_review`
 * findings + the macOS guided checklist. No dynamic claims are made here.
 */
export async function POST(request: Request) {
  const auth = await requireSession(request);
  if (!auth.ok) return auth.response;

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

    if (!file.name.endsWith(".ipa")) {
      return Response.json({ error: "Only .ipa files are accepted" }, { status: 400 });
    }

    const sizeMb = file.size / (1024 * 1024);
    if (sizeMb > MAX_IPA_SIZE_MB) {
      return Response.json(
        { error: `File too large: ${sizeMb.toFixed(1)}MB exceeds ${MAX_IPA_SIZE_MB}MB limit` },
        { status: 413 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const safeName = sanitizeFilename(file.name);
    const evidencePath = `${auditId}/uploads/${safeName}`;
    let ipaPath: string;
    try {
      ipaPath = await uploadEvidence(buffer, evidencePath, "application/octet-stream");
    } catch (e) {
      return Response.json(
        { error: `Upload failed: ${(e as Error).message}` },
        { status: 500 }
      );
    }

    // ── Static parse → deterministic needs_review findings ──
    let bundle;
    try {
      bundle = await parseIpa(buffer);
    } catch (e) {
      if (e instanceof IpaParseError) {
        return Response.json({ error: e.message }, { status: 400 });
      }
      console.error("POST /api/uploads/ipa parse error:", e);
      return Response.json({ error: "Failed to parse .ipa" }, { status: 400 });
    }

    const findings = runIosChecks(bundle);

    // Best-effort artifact row (mirrors the APK route; RLS deny-all on the table).
    if (bundle.plistReadable) {
      const { error } = await supabase
        .from("mobile_artifacts")
        .insert({
          audit_id: auditId,
          platform: "ios",
          ipa_path: ipaPath,
          bundle_id: bundle.bundleId ?? null,
          manifest_json: {
            displayName: bundle.displayName,
            version: bundle.version,
            minimumOsVersion: bundle.minimumOsVersion,
          },
          file_size: file.size,
        });

      if (error) {
        console.error("Insert mobile_artifacts error:", error);
      }
    }

    const notes: string[] = [];
    if (bundle.minimumOsVersion) {
      const major = parseInt(bundle.minimumOsVersion.split(".")[0] ?? "0", 10);
      if (!Number.isNaN(major) && major < 13) {
        notes.push(
          `MinimumOSVersion ${bundle.minimumOsVersion} targets pre-iOS 13 — review reach and modern accessibility API availability.`
        );
      }
    }
    if (bundle.hasAssetsCar && !bundle.iconNames2x.length && !bundle.iconNames3x.length) {
      notes.push("Icon detection limited on non-macOS hosts — Assets.car contents were not unpacked.");
    }

    return Response.json({
      success: true,
      ipaPath,
      bundle: {
        bundleId: bundle.bundleId ?? null,
        displayName: bundle.displayName ?? null,
        version: bundle.version ?? null,
        build: bundle.build ?? null,
        minimumOsVersion: bundle.minimumOsVersion ?? null,
        launchStoryboard: bundle.launchStoryboard ?? null,
        localizations: bundle.localizations ?? [],
        accessibilityKeys: bundle.accessibilityKeys,
        iconNames2x: bundle.iconNames2x,
        iconNames3x: bundle.iconNames3x,
        hasAssetsCar: bundle.hasAssetsCar,
        plistReadable: bundle.plistReadable,
      },
      findings,
      guidedChecklist: IOS_GUIDED_CHECKLIST,
      notes,
    });
  } catch (e) {
    console.error("POST /api/uploads/ipa error:", e);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
