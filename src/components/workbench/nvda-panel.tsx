"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type {
  Announcement,
  NvdaSilentElement,
  NvdaSuggestion,
} from "@/lib/sr/nvda-types";

interface NvdaResponse {
  available: boolean;
  reason?: string | null;
  announcements?: Announcement[];
  silentElements?: NvdaSilentElement[];
  suggestions?: NvdaSuggestion[];
  error?: string;
}

/**
 * NVDA is a real Windows screen reader — it only runs when this app is
 * running locally on Windows with NVDA installed, never on a serverless
 * deployment. Shown as plain, always-visible text (not a collapsible
 * section) since there's nothing to browse until the check is run.
 */
export function NvdaPanel({ auditId }: { auditId: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<NvdaResponse | null>(null);
  const [failed, setFailed] = useState(false);

  async function handleRun() {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/audits/${auditId}/nvda`, { method: "POST" });
      if (!res.ok) throw new Error(`NVDA check failed (${res.status})`);
      const json = (await res.json()) as NvdaResponse;
      setResult(json);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  const announcements = result?.announcements ?? [];
  const silentElements = result?.silentElements ?? [];
  const suggestions = result?.suggestions ?? [];

  return (
    <div className="border-t bg-background px-3 py-2 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">Screen reader (NVDA)</span>
        <button
          onClick={handleRun}
          disabled={loading}
          className="text-xs px-2 py-1 rounded border hover:bg-accent/50 transition-colors disabled:opacity-50"
        >
          {loading ? "Running…" : "Run local NVDA check"}
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        NVDA is a real Windows screen reader — it can only run when this app is running locally
        on Windows with NVDA installed. On a hosted deployment it is always unavailable; use the
        SR Preview above for a deterministic, always-available accessibility-tree transcript.
      </p>

      {failed && (
        <p className="text-xs text-red-600 dark:text-red-400">
          Could not reach the NVDA check. Try again.
        </p>
      )}

      {!failed && result && !result.available && (
        <div className="flex items-center gap-1.5">
          <Badge variant="outline">Unavailable</Badge>
          <span className="text-xs text-muted-foreground">
            {result.reason ? `(${result.reason})` : "NVDA not reachable in this environment."}
          </span>
        </div>
      )}

      {!failed && result?.available && (
        <div className="space-y-3">
          {silentElements.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold mb-1.5">
                Silent interactive elements ({silentElements.length})
              </h4>
              <div className="space-y-1.5">
                {silentElements.map((s) => (
                  <Card key={`${s.element}-${s.role}`}>
                    <CardContent className="p-2">
                      <p className="text-xs">
                        <span className="font-mono">{s.element}</span>
                        {s.role && <span className="text-muted-foreground"> ({s.role})</span>}{" "}
                        announces nothing.
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {suggestions.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold mb-1.5">Suggestions</h4>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {suggestions.map((s) => (
                  <li key={s.rule_id}>{s.detail}</li>
                ))}
              </ul>
            </div>
          )}

          {announcements.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold mb-1.5">
                Announcements ({announcements.length})
              </h4>
              <ul className="space-y-0.5 font-mono text-[11px]">
                {announcements.map((a, i) => (
                  <li key={i} className="truncate">
                    <span className="text-muted-foreground">{a.element}</span>
                    {" → "}
                    {a.spoken || <em className="text-red-500">(silent)</em>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
