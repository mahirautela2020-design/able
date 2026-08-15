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
 * "Screen reader (NVDA)" workbench panel.
 *
 * Triggers a local NVDA run against the audited page via
 * POST /api/audits/[id]/nvda. When NVDA is unavailable (serverless / non-Windows
 * / not installed) it shows an honest note rather than a silent empty panel.
 */
export function NvdaPanel({ auditId }: { auditId: string }) {
  const [open, setOpen] = useState(false);
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

  async function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next && result === null && !loading) {
      await handleRun();
    }
  }

  const announcements = result?.announcements ?? [];
  const silentElements = result?.silentElements ?? [];
  const suggestions = result?.suggestions ?? [];

  return (
    <div className="border-t bg-background">
      <button
        onClick={handleToggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/40 transition-colors"
      >
        <span className="text-sm font-medium">Screen reader (NVDA)</span>
        <span className="text-xs text-muted-foreground">
          {open ? "\u25b4 collapse" : "\u25be run local NVDA check"}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3 max-h-96 overflow-y-auto">
          {loading && (
            <p className="text-xs text-muted-foreground">Running NVDA check…</p>
          )}

          {!loading && failed && (
            <p className="text-xs text-red-600 dark:text-red-400">
              Could not reach the NVDA check. Try again.
            </p>
          )}

          {!loading && !failed && result && !result.available && (
            <div className="flex flex-col gap-1.5">
              <Badge variant="outline" className="w-fit">
                Unavailable
              </Badge>
              <p className="text-xs text-muted-foreground">
                Run this audit locally with NVDA installed on Windows to capture
                real screen-reader announcements. On this environment NVDA is not
                reachable{result.reason ? ` (${result.reason})` : ""}.
              </p>
            </div>
          )}

          {!loading && !failed && result?.available && (
            <>
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
                            {s.role && (
                              <span className="text-muted-foreground">
                                {" "}
                                ({s.role})
                              </span>
                            )}{" "}
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
                        {" \u2192 "}
                        {a.spoken || <em className="text-red-500">(silent)</em>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
