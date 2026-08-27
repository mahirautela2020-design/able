"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Globe, ImageIcon, Smartphone, PenTool, Apple, FileText } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { ConnectFigmaButton } from "@/components/connect-figma-button";
import { supabase } from "@/lib/supabase/client";

type Mode = "url" | "figma" | "image" | "pdf" | "apk" | "ios";

// Vercel serverless functions hard-cap the request body at ~4.3MB
// (platform-level — not something any of these routes can raise). Above that
// the platform itself rejects the upload with a plain-text response before
// our code runs at all, which used to surface as an opaque "Request failed"
// (res.json() throwing on a non-JSON body). Checking client-side means the
// user gets a clear, immediate message instead of a doomed round-trip — and
// this cap applies regardless of what each route's own size limit claims.
const MAX_UPLOAD_MB = 4;

// PDF is the one upload type that bypasses this app's own routes for the
// file transfer itself (see handlePdfSubmit) — it PUTs directly from the
// browser to Supabase Storage via a signed URL, so Vercel's body cap above
// never applies to it. The real ceiling is Supabase Storage's own per-file
// limit, and audits (PDFs included) are deleted within 24h regardless of
// size, so 25MB is honest here in a way it never was on the old route.
const MAX_PDF_UPLOAD_MB = 25;

const MODES: { key: Mode; label: string; icon: typeof Globe; hint: string }[] = [
  { key: "url", label: "URL", icon: Globe, hint: "Public website URL" },
  { key: "figma", label: "Figma", icon: PenTool, hint: "Figma file key or share link" },
  { key: "image", label: "UI Screenshot", icon: ImageIcon, hint: "PNG / JPEG / WebP" },
  { key: "pdf", label: "PDF", icon: FileText, hint: "PDF/UA + WCAG document audit" },
  { key: "apk", label: "APK", icon: Smartphone, hint: "Android app package" },
  { key: "ios", label: "iOS", icon: Apple, hint: "iOS .ipa app bundle" },
];

/**
 * Mode-tabbed audit input: URL / Figma / UI Screenshot / APK.
 * URL starts an Inngest audit and lands in the workbench; the others
 * upload to their endpoints and show results inline (auth-gated).
 */
export function AuditInput() {
  const [mode, setMode] = useState<Mode>("url");
  const [url, setUrl] = useState("");
  const [figmaInput, setFigmaInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    findings?: unknown[];
    summary?: Record<string, unknown>;
    bundle?: {
      bundleId?: string | null;
      displayName?: string | null;
      version?: string | null;
      build?: string | null;
      minimumOsVersion?: string | null;
      launchStoryboard?: string | null;
      localizations?: string[];
      accessibilityKeys?: string[];
      iconNames2x?: string[];
      iconNames3x?: string[];
      hasAssetsCar?: boolean;
      plistReadable?: boolean;
    };
    guidedChecklist?: Array<{ id: string; instruction: string; wcagSc: string; requiresMacOs: boolean }>;
    notes?: string[];
    dynamic?: {
      ran: boolean;
      screens: Array<{
        name: string;
        findings: Array<{
          ruleTitle?: string;
          wcagCriterion?: string;
          failureSummary?: string;
          severity?: string;
        }>;
      }>;
    };
    error?: string;
  } | null>(null);
  const router = useRouter();

  /**
   * PDF audits get the same workbench experience as URL audits (left
   * checklist, right preview, downloadable 16:9 report) rather than an
   * inline result — which means the audit needs a real persisted id before
   * analysis even starts. Three steps:
   *   1. POST /api/uploads/pdf/init — creates the audit row, mints a
   *      Supabase Storage signed upload URL. Tiny request/response, so
   *      Vercel's body cap is irrelevant here.
   *   2. Upload the file DIRECTLY to Supabase Storage from the browser —
   *      bypasses this app's routes (and their body limit) entirely.
   *   3. POST /api/uploads/pdf/finalize — downloads it server-side, runs the
   *      deterministic PDF/UA + WCAG checks, marks the audit complete.
   * Then redirect to /workbench/:id, exactly like a URL audit does.
   */
  async function handlePdfSubmit(file: File) {
    if (file.size > MAX_PDF_UPLOAD_MB * 1024 * 1024) {
      toast.error(
        `"${file.name}" is ${(file.size / (1024 * 1024)).toFixed(1)}MB — the limit is ${MAX_PDF_UPLOAD_MB}MB.`
      );
      return;
    }
    if (!supabase) {
      toast.error("Upload isn't configured right now — try again later.");
      return;
    }

    setLoading(true);
    try {
      const initRes = await fetch("/api/uploads/pdf/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, fileSize: file.size }),
      });
      const initData = await initRes.json().catch(() => null);
      if (!initData) {
        toast.error(`Upload failed (server responded ${initRes.status})`);
        return;
      }
      if (initRes.status === 429 && initData.redirectTo) {
        toast.error(initData.error);
        window.location.href = initData.redirectTo;
        return;
      }
      if (!initRes.ok) {
        toast.error(initData.error || "Failed to start PDF audit");
        return;
      }

      const { auditId, path, token } = initData;
      const { error: uploadError } = await supabase.storage
        .from("evidence")
        .uploadToSignedUrl(path, token, file);
      if (uploadError) {
        toast.error(`Upload failed: ${uploadError.message}`);
        return;
      }

      const finalizeRes = await fetch("/api/uploads/pdf/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auditId }),
      });
      const finalizeData = await finalizeRes.json().catch(() => null);
      if (!finalizeRes.ok) {
        toast.error(finalizeData?.error || "PDF analysis failed");
        // The audit row still exists (marked failed by the route) so the
        // user can see why on the workbench rather than losing the context.
        router.push(`/workbench/${auditId}`);
        return;
      }

      toast.success("PDF audit complete");
      router.push(`/workbench/${auditId}`);
    } catch {
      toast.error("Upload failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);

    if (mode === "pdf") {
      if (!file) return toast.error("Choose a file first");
      return handlePdfSubmit(file);
    }

    if (mode === "url") {
      if (!url.trim()) return toast.error("Enter a URL");
      setLoading(true);
      try {
        // Free tier: anonymous audits allowed (5/day per IP). Send the
        // session token when present so the audit is owner-scoped.
        const {
          data: { session },
        } = await (supabase?.auth.getSession() ?? Promise.resolve({ data: { session: null } }));
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (session) headers.Authorization = `Bearer ${session.access_token}`;

        const res = await fetch("/api/audits", {
          method: "POST",
          headers,
          body: JSON.stringify({ url }),
        });
        const data = await res.json().catch(() => null);
        if (!data) return toast.error(`Failed to start audit (server responded ${res.status})`);
        if (res.status === 429 && data.redirectTo) {
          toast.error(data.error);
          window.location.href = data.redirectTo;
          return;
        }
        if (!res.ok) return toast.error(data.error || "Failed to start audit");
        toast.success("Audit started");
        router.push(`/workbench/${data.id}`);
      } catch {
        toast.error("Failed to start audit");
      } finally {
        setLoading(false);
      }
      return;
    }

    // Upload modes: Figma (JSON body) / image / apk (multipart) — all of
    // these are session-gated server-side, so (like the URL mode above) we
    // must attach the Supabase access token when one exists. Previously
    // these fetches sent no Authorization header at all, so a signed-in
    // user still got "Missing or invalid authorization header" here even
    // though URL audits worked fine.
    setLoading(true);
    try {
      const {
        data: { session },
      } = await (supabase?.auth.getSession() ?? Promise.resolve({ data: { session: null } }));
      const authHeader: Record<string, string> = session
        ? { Authorization: `Bearer ${session.access_token}` }
        : {};

      if (mode === "figma") {
        if (!figmaInput.trim()) return toast.error("Enter a Figma file key or share URL");
        const res = await fetch("/api/audit/figma", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeader },
          body: JSON.stringify({ fileKey: figmaInput }),
        });
        const data = await res.json();
        if (!res.ok) {
          setResult({ error: data.error });
          if (res.status === 401) {
            toast.error(session ? data.error : "Sign in to audit Figma files.");
          }
          return;
        }
        setResult({ findings: data.findings, summary: data.summary });
        return;
      }

      if (!file) return toast.error("Choose a file first");

      // Checked here, not just server-side: Vercel rejects an oversized
      // request body at the platform level, before any route runs, with a
      // plain-text response — res.json() below would throw on that, which is
      // exactly how this used to surface as an opaque "Request failed" with
      // no indication of why. Catching it here means an immediate, specific
      // message instead of a doomed upload.
      if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
        return toast.error(
          `"${file.name}" is ${(file.size / (1024 * 1024)).toFixed(1)}MB — the server can't accept uploads over ${MAX_UPLOAD_MB}MB.`
        );
      }

      const form = new FormData();
      form.append("file", file);
      if (mode === "apk" || mode === "ios") form.append("auditId", crypto.randomUUID());

      const res = await fetch(
        mode === "apk"
          ? "/api/uploads/apk"
          : mode === "ios"
            ? "/api/uploads/ipa"
            : "/api/uploads/image",
        // Don't set Content-Type manually for FormData — the browser needs
        // to add its own multipart boundary.
        { method: "POST", body: form, headers: authHeader }
      );

      // The success/validation-error paths below always return JSON, but a
      // platform-level rejection (413 from Vercel, a proxy timeout, etc.)
      // does not — parsing that as JSON would throw and land in the generic
      // catch below with no useful message. Handle it here instead.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- shape varies per upload mode; used loosely throughout this file already.
      let data: any;
      try {
        data = await res.json();
      } catch {
        toast.error(
          res.status === 413
            ? "That file is too large for the server to accept."
            : `Upload failed (server responded ${res.status}). Try a smaller file or try again.`
        );
        return;
      }

      if (!res.ok) {
        setResult({ error: data.error ?? "Upload failed" });
        if (res.status === 401) {
          toast.error(session ? data.error : "Sign in to analyze this file type.");
        } else if (res.status === 422) {
          toast.error(data.error);
        }
        return;
      }
      setResult({
        findings: data.findings,
        summary: data.summary,
        dynamic: data.dynamic,
        bundle: data.bundle,
        guidedChecklist: data.guidedChecklist,
        notes: data.notes,
      });
    } catch {
      toast.error("Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {/* Mode tabs */}
      <div className="flex gap-1 mb-4 flex-wrap" role="tablist" aria-label="Audit type">
        {MODES.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            role="tab"
            aria-selected={mode === key}
            onClick={() => {
              setMode(key);
              setResult(null);
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              mode === key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {mode === "url" && (
          <Input
            type="url"
            placeholder="https://example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={loading}
          />
        )}
        {mode === "figma" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2">
              <span className="text-xs text-muted-foreground">
                Audit files from your connected Figma account
              </span>
              <ConnectFigmaButton />
            </div>
            <Input
              type="text"
              placeholder="https://www.figma.com/design/<fileKey>/Name or fileKey"
              value={figmaInput}
              onChange={(e) => setFigmaInput(e.target.value)}
              disabled={loading}
            />
          </div>
        )}
        {(mode === "image" || mode === "pdf" || mode === "apk" || mode === "ios") && (
          <label className="flex flex-col items-center justify-center gap-1 border-2 border-dashed rounded-md p-6 cursor-pointer hover:bg-accent/40 transition-colors text-center">
            <input
              type="file"
              className="sr-only"
              accept={
                mode === "image"
                  ? "image/png,image/jpeg,image/webp"
                  : mode === "pdf"
                    ? "application/pdf,.pdf"
                    : mode === "ios"
                      ? ".ipa"
                      : ".apk"
              }
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={loading}
            />
            <span className="text-sm font-medium">
              {file
                ? file.name
                : mode === "image"
                  ? "Upload a UI screenshot"
                  : mode === "pdf"
                    ? "Upload a PDF document"
                    : mode === "ios"
                      ? "Upload an .ipa"
                      : "Upload an APK"}
            </span>
            {(() => {
              const maxMb = mode === "pdf" ? MAX_PDF_UPLOAD_MB : MAX_UPLOAD_MB;
              const overLimit = !!file && file.size > maxMb * 1024 * 1024;
              return (
                <span className={`text-xs ${overLimit ? "text-destructive" : "text-muted-foreground"}`}>
                  {file
                    ? `${(file.size / 1024).toFixed(0)} KB${overLimit ? ` — over the ${maxMb}MB limit` : ""}`
                    : `Click to choose (max ${maxMb}MB)`}
                </span>
              );
            })()}
          </label>
        )}

        <Button type="submit" disabled={loading} className="w-full sm:w-auto">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {loading ? "Working…" : mode === "url" || mode === "pdf" ? "Audit" : "Analyze"}
        </Button>
      </form>

      {result?.error && (
        <p className="text-sm text-destructive mt-3">{result.error}</p>
      )}
      {result?.bundle && (
        <div className="mt-4 space-y-3">
          <div className="rounded-md border p-3">
            <p className="text-sm font-medium mb-1.5">Bundle (static metadata)</p>
            <dl className="text-xs space-y-1 text-muted-foreground">
              <div className="flex gap-2">
                <dt className="font-medium text-foreground w-28 shrink-0">Display name</dt>
                <dd>{result.bundle.displayName ?? "—"}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="font-medium text-foreground w-28 shrink-0">Bundle ID</dt>
                <dd className="font-mono">{result.bundle.bundleId ?? "—"}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="font-medium text-foreground w-28 shrink-0">Version</dt>
                <dd>{result.bundle.version ?? "—"}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="font-medium text-foreground w-28 shrink-0">Minimum OS</dt>
                <dd>{result.bundle.minimumOsVersion ?? "—"}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="font-medium text-foreground w-28 shrink-0">Localizations</dt>
                <dd>{(result.bundle.localizations ?? []).length} declared</dd>
              </div>
              <div className="flex gap-2">
                <dt className="font-medium text-foreground w-28 shrink-0">Icons</dt>
                <dd>
                  {result.bundle.iconNames2x?.length ?? 0} @2x ·{" "}
                  {result.bundle.iconNames3x?.length ?? 0} @3x
                  {result.bundle.hasAssetsCar ? " · Assets.car present" : ""}
                </dd>
              </div>
            </dl>
            {result.bundle.plistReadable === false && (
              <p className="text-xs text-amber-600 mt-1.5">
                Info.plist could not be read — no static findings produced.
              </p>
            )}
          </div>

          <div>
            <p className="text-sm font-medium mb-1.5">
              Static findings ({result.findings?.length ?? 0})
            </p>
            <p className="text-xs text-muted-foreground mb-1.5">
              Static metadata only — bundle inspection cannot prove a live
              failure, so every result needs manual review.
            </p>
            {(result.findings?.length ?? 0) === 0 ? (
              <p className="text-xs text-muted-foreground">No static flags.</p>
            ) : (
              <ul className="space-y-1.5">
                {(result.findings as { criterion?: string; message?: string; severity?: string }[]).map((f, i) => (
                  <li key={i} className="text-xs bg-muted/50 rounded-md p-2">
                    <span className="font-mono font-medium">{f.criterion ?? "—"}</span>{" "}
                    <span className="text-muted-foreground">({f.severity ?? "needs_review"})</span>
                    <span className="text-muted-foreground block mt-0.5">
                      {f.message ?? ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-md border border-dashed p-3">
            <p className="text-sm font-medium mb-1">
              Dynamic checks (macOS only)
            </p>
            <p className="text-xs text-muted-foreground mb-2">
              VoiceOver and Simulator testing requires macOS / Xcode and cannot
              run on this host. Complete these steps manually on a Mac.
            </p>
            <ol className="list-decimal list-inside space-y-1">
              {(result.guidedChecklist ?? []).map((step) => (
                <li key={step.id} className="text-xs">
                  <span className="font-mono text-muted-foreground">{step.wcagSc}</span>{" "}
                  {step.instruction}
                </li>
              ))}
            </ol>
            {result.notes && result.notes.length > 0 && (
              <ul className="mt-2 space-y-1">
                {result.notes.map((n, i) => (
                  <li key={i} className="text-xs text-muted-foreground">• {n}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      {result?.findings && !result?.bundle && (
        <div className="mt-4">
          <p className="text-sm font-medium mb-2">
            {result.findings.length} findings
            {result.summary?.visionModel ? ` · vision: ${result.summary.visionModel}` : ""}
          </p>
          <ul className="space-y-1.5">
            {(result.findings as { ruleTitle?: string; wcagCriterion?: string; failureSummary?: string; bucket?: string }[]).slice(0, 8).map((f, i) => (
              <li key={i} className="text-xs bg-muted/50 rounded-md p-2">
                <span className="font-mono font-medium">{f.wcagCriterion ?? "—"}</span>{" "}
                <span className="font-medium">{f.ruleTitle ?? ""}</span>
                <span className="text-muted-foreground block mt-0.5">
                  {f.failureSummary ?? ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {result?.dynamic?.ran && (
        <div className="mt-4">
          <p className="text-sm font-medium mb-2">Dynamic (emulator)</p>
          {result.dynamic.screens.map((screen, i) => (
            <div key={i} className="border rounded-md p-3 mb-2">
              <p className="text-xs font-semibold mb-1">{screen.name}</p>
              {screen.findings.length === 0 ? (
                <p className="text-xs text-muted-foreground">No issues on this screen.</p>
              ) : (
                <ul className="space-y-1.5">
                  {screen.findings.map((f, j) => (
                    <li key={j} className="text-xs bg-muted/50 rounded-md p-2">
                      <span className="font-mono font-medium">{f.wcagCriterion ?? "—"}</span>{" "}
                      <span className="font-medium">{f.ruleTitle ?? ""}</span>{" "}
                      <span className="text-muted-foreground">({f.severity ?? ""})</span>
                      <span className="text-muted-foreground block mt-0.5">
                        {f.failureSummary ?? ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
