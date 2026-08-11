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

  useEffect(() => {
    fetch("/api/audits")
      .then((r) => r.json())
      .then((data) => setAudits(Array.isArray(data) ? data : []))
      .catch(() => setAudits([]))
      .finally(() => setLoading(false));
  }, []);

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
          <TableHead className="w-[80px]"></TableHead>
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
            <TableCell>
              {(audit.status === "complete" || audit.status === "failed") && (
                <Link
                  href={`/audits/${audit.id}`}
                  className="text-primary hover:underline text-sm"
                >
                  View
                </Link>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
