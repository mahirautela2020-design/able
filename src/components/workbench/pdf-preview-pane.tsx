"use client";

import { FileText, ExternalLink } from "lucide-react";

interface PdfPreviewPaneProps {
  fileName: string;
  /** Signed URL to the uploaded PDF, or null while unavailable/expired. */
  previewUrl: string | null;
}

/**
 * Right-column preview for a PDF audit — the counterpart to PreviewPane's
 * live-site iframe. A PDF renders natively in an iframe via the browser's
 * own PDF viewer, so this needs none of PreviewPane's live-DOM machinery
 * (proxy fallback, frame-block detection, Inspect bridge).
 */
export function PdfPreviewPane({ fileName, previewUrl }: PdfPreviewPaneProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-muted/10">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-background/60 text-xs">
        <span className="flex items-center gap-1.5 font-medium truncate">
          <FileText className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{fileName}</span>
        </span>
        {previewUrl && (
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          >
            Open in new tab <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
      {previewUrl ? (
        <iframe src={previewUrl} title={`Preview of ${fileName}`} className="flex-1 w-full border-0" />
      ) : (
        <div className="flex-1 flex items-center justify-center p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Preview link has expired or the file could not be found. The audit findings below are
            unaffected.
          </p>
        </div>
      )}
    </div>
  );
}
