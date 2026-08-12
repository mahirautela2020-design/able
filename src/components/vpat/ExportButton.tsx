"use client";

import { useState } from "react";

interface ExportButtonProps {
  auditId: string;
}

export function ExportButton({ auditId }: ExportButtonProps) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async (format: "json" | "csv") => {
    setExporting(true);
    try {
      const res = await fetch(
        `/api/vpat/export?auditId=${encodeURIComponent(auditId)}&format=${format}`
      );

      if (!res.ok) {
        throw new Error("Export failed");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vpat-${auditId}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Export failed silently
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => handleExport("json")}
        disabled={exporting}
        className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50"
      >
        {exporting ? "Exporting..." : "Export VPAT (JSON)"}
      </button>
      <button
        type="button"
        onClick={() => handleExport("csv")}
        disabled={exporting}
        className="px-4 py-2 border rounded-md hover:bg-muted disabled:opacity-50"
      >
        Export VPAT (CSV)
      </button>
    </div>
  );
}
