"use client";

import { useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase/client";
import Link from "next/link";

interface Audit {
  id: string;
  target_url: string;
  status: string;
  created_at: string;
}

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  queued: "secondary",
  running: "default",
  complete: "outline",
  failed: "destructive",
};

export function AuditList() {
  const [audits, setAudits] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetch("/api/audits")
      .then((r) => r.json())
      .then((data) => setAudits(Array.isArray(data) ? data : []))
      .catch(() => setAudits([]))
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(id: string) {
    setDeleting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch(`/api/audits?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: session
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
      });
      if (res.ok) {
        setAudits((prev) => prev.filter((a) => a.id !== id));
      } else {
        const body = await res.json().catch(() => null);
        alert(body?.error || "Failed to delete audit");
      }
    } catch {
      alert("Failed to delete audit");
    } finally {
      setDeleting(false);
      setConfirmId(null);
    }
  }

  if (loading) {
    return <div className="h-32 flex items-center justify-center text-muted-foreground">Loading...</div>;
  }

  if (audits.length === 0) {
    return (
      <div className="h-32 flex items-center justify-center text-muted-foreground">
        No audits yet. Submit a URL above to get started.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>URL</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Date</TableHead>
          <TableHead className="w-[160px] text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {audits.map((audit) => (
          <TableRow key={audit.id}>
            <TableCell className="font-mono text-sm truncate max-w-[300px]">
              {audit.target_url}
            </TableCell>
            <TableCell>
              <Badge variant={statusVariant[audit.status] || "secondary"}>
                {audit.status}
              </Badge>
            </TableCell>
            <TableCell className="text-muted-foreground text-sm">
              {new Date(audit.created_at).toLocaleDateString()}
            </TableCell>
            <TableCell className="text-right whitespace-nowrap">
              {(audit.status === "complete" || audit.status === "failed") && (
                <>
                  <Link
                    href={`/workbench/${audit.id}`}
                    className="text-primary hover:underline text-sm mr-3"
                  >
                    Workbench
                  </Link>
                  <Link
                    href={`/audits/${audit.id}`}
                    className="text-primary hover:underline text-sm mr-3"
                  >
                    View
                  </Link>
                </>
              )}
              {confirmId === audit.id ? (
                <button
                  onClick={() => handleDelete(audit.id)}
                  disabled={deleting}
                  className="text-destructive hover:underline text-sm font-medium disabled:opacity-50"
                >
                  {deleting ? "Deleting…" : "Confirm delete"}
                </button>
              ) : (
                <button
                  onClick={() => setConfirmId(audit.id)}
                  className="text-muted-foreground hover:text-destructive hover:underline text-sm transition-colors"
                  aria-label={`Delete audit for ${audit.target_url}`}
                >
                  Delete
                </button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
