"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Globe, ImageIcon, Smartphone, PenTool } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { ConnectFigmaButton } from "@/components/connect-figma-button";
import { supabase } from "@/lib/supabase/client";

type Mode = "url" | "figma" | "image" | "apk";

const MODES: { key: Mode; label: string; icon: typeof Globe; hint: string }[] = [
  { key: "url", label: "URL", icon: Globe, hint: "Public website URL" },
  { key: "figma", label: "Figma", icon: PenTool, hint: "Figma file key or share link" },
  { key: "image", label: "UI Screenshot", icon: ImageIcon, hint: "PNG / JPEG / WebP" },
  { key: "apk", label: "APK", icon: Smartphone, hint: "Android app package" },
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);

    if (mode === "url") {
      if (!url.trim()) return toast.error("Enter a URL");
      setLoading(true);
      try {
        // Free tier: anonymous audits allowed (5/day per IP). Send the
        // session token when present so the audit is owner-scoped.
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (session) headers.Authorization = `Bearer ${session.access_token}`;

        const res = await fetch("/api/audits", {
          method: "POST",
          headers,
          body: JSON.stringify({ url }),
        });
        const data = await res.json();
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

    // Upload modes: Figma (JSON body) / image / apk (multipart)
    setLoading(true);
    try {
      if (mode === "figma") {
        if (!figmaInput.trim()) return toast.error("Enter a Figma file key or share URL");
        const res = await fetch("/api/audit/figma", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileKey: figmaInput }),
        });
        const data = await res.json();
        if (!res.ok) {
          setResult({ error: data.error });
          if (res.status === 401) toast.error(data.error);
          return;
        }
        setResult({ findings: data.findings, summary: data.summary });
        return;
      }

      if (!file) return toast.error("Choose a file first");
      const form = new FormData();
      form.append("file", file);
      if (mode === "apk") form.append("auditId", crypto.randomUUID());

      const res = await fetch(
        mode === "apk" ? "/api/uploads/apk" : "/api/uploads/image",
        { method: "POST", body: form }
      );
      const data = await res.json();
      if (!res.ok) {
        setResult({ error: data.error });
        if (res.status === 401) toast.error(data.error);
        return;
      }
      setResult({ findings: data.findings, summary: data.summary, dynamic: data.dynamic });
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
        {(mode === "image" || mode === "apk") && (
          <label className="flex flex-col items-center justify-center gap-1 border-2 border-dashed rounded-md p-6 cursor-pointer hover:bg-accent/40 transition-colors text-center">
            <input
              type="file"
              className="sr-only"
              accept={mode === "image" ? "image/png,image/jpeg,image/webp" : ".apk"}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={loading}
            />
            <span className="text-sm font-medium">
              {file ? file.name : mode === "image" ? "Upload a UI screenshot" : "Upload an APK"}
            </span>
            <span className="text-xs text-muted-foreground">
              {file ? `${(file.size / 1024).toFixed(0)} KB` : "Click to choose"}
            </span>
          </label>
        )}

        <Button type="submit" disabled={loading} className="w-full sm:w-auto">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {loading ? "Working…" : mode === "url" ? "Audit" : "Analyze"}
        </Button>
      </form>

      {result?.error && (
        <p className="text-sm text-destructive mt-3">{result.error}</p>
      )}
      {result?.findings && (
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
