"use client";

import { useState } from "react";
import { authHeaders } from "@/lib/supabase/client";

interface SrPreviewProps {
  auditId: string;
}

/**
 * SR Preview panel — shows the deterministic speech transcript
 * generated from the AX tree for the first audited page.
 */
export function SrPreview({ auditId }: SrPreviewProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lines, setLines] = useState<string[] | null>(null);
  const [error, setError] = useState(false);
  const [scrollIndex, setScrollIndex] = useState(0);

  async function fetchTranscript() {
    setLoading(true);
    setError(false);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/audits/${auditId}/sr-preview`, { headers });
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setLines(json.lines ?? []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next && lines === null && !loading) {
      await fetchTranscript();
    }
  }

  function handleReadFromTop() {
    setScrollIndex(0);
  }

  return (
    <div className="border-t bg-background">
      <button
        onClick={handleToggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/40 transition-colors"
      >
        <span className="text-sm font-medium">SR Preview (AX tree)</span>
        <span className="text-xs text-muted-foreground">
          {open ? "\u25b4 collapse" : "\u25be show transcript"}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2 max-h-96 overflow-y-auto">
          {loading && (
            <p className="text-xs text-muted-foreground">Loading transcript...</p>
          )}

          {!loading && error && (
            <p className="text-xs text-red-600 dark:text-red-400">
              Could not load SR preview. Try again.
            </p>
          )}

          {!loading && !error && lines !== null && lines.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No speech transcript available for this audit. Run an audit first.
            </p>
          )}

          {!loading && !error && lines !== null && lines.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {lines.length} announcements
                </span>
                <button
                  onClick={handleReadFromTop}
                  className="text-xs px-2 py-1 rounded border hover:bg-accent/50 transition-colors"
                >
                  Read from top
                </button>
              </div>
              <ol
                className="space-y-0.5 font-mono text-[11px] list-decimal list-inside"
                start={scrollIndex + 1}
              >
                {lines.slice(scrollIndex).map((line, i) => (
                  <li key={scrollIndex + i} className="py-0.5 border-b border-border/30">
                    {line}
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      )}
    </div>
  );
}
