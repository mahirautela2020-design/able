import { parseApkManifestFromBuffer } from "@/lib/android/manifest";
import { supabase, uploadEvidence } from "@/lib/supabase/server";
import { requireSession } from "@/lib/supabase/session";

const MAX_APK_SIZE_MB = 200;

/** Strip path separators and control chars so a user-supplied filename can't
 * traverse the storage key space (e.g. "../../other/audit/x.apk"). */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  return base.replace(/[^\w.\-]/g, "_").slice(0, 100);
}

export async function POST(request: Request) {
  // Auth guard: uploading to someone else's audit storage must require a session.
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

    if (!file.name.endsWith(".apk")) {
      return Response.json({ error: "Only .apk files are accepted" }, { status: 400 });
    }

    const sizeMb = file.size / (1024 * 1024);
    if (sizeMb > MAX_APK_SIZE_MB) {
      return Response.json(
        { error: `File too large: ${sizeMb.toFixed(1)}MB exceeds ${MAX_APK_SIZE_MB}MB limit` },
        { status: 413 }
      );
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
    });
  } catch (e) {
    console.error("POST /api/uploads/apk error:", e);
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
