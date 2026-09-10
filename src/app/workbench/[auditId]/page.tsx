import { getAudit, getFindingsForAudit, createSignedUrl } from "@/lib/supabase/server";
import { Workbench } from "@/components/workbench/workbench";
import { notFound } from "next/navigation";
import { headers } from "next/headers";

export const metadata = {
  title: "Workbench — ScanA11y",
};

export default async function WorkbenchPage({
  params,
}: {
  params: Promise<{ auditId: string }>;
}) {
  const { auditId } = await params;

  let audit;
  try {
    audit = await getAudit(auditId);
  } catch {
    notFound();
  }

  if (!audit) notFound();

  // Every audit-scoped API route (report, sr-preview, pdf, cancel,
  // contrast-finding, nvda, GET /api/audits/[id]) requires an owner match
  // before returning anything. This page — the one every "create audit"
  // flow redirects to, and the one every audit link points at — never did:
  // it fetched target_url, full findings, and freshly SIGNED evidence
  // screenshot URLs with `getAudit`/`getFindingsForAudit` directly and
  // server-rendered all of it, for anyone who had the auditId.
  //
  // The fix is shaped by a real constraint: this app's Supabase session
  // lives in the BROWSER's localStorage (src/lib/supabase/client.ts uses
  // plain @supabase/supabase-js, not a cookie-backed client), so a
  // Server Component's top-level page render has no way to know who's
  // signed in — there's no Authorization header on a browser navigation,
  // only on the client's own fetch() calls. IP is the only signal
  // available here.
  //
  // So: an ANONYMOUS audit (created_by null) can still be safely
  // server-rendered when the requester's IP matches the creator's IP,
  // exactly like every other anonymous-fallback route — the common case
  // right after creating an audit with no account. An OWNED audit can
  // never be proven server-side, so its sensitive data (target_url,
  // findings, evidence) is withheld from the initial render entirely; the
  // Workbench client component hydrates it immediately on mount via
  // GET /api/audits/[id]/report, which DOES have the caller's session
  // token and is already correctly owner-scoped.
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const canServerRender = audit.created_by
    ? false
    : !!ip && audit.created_ip === ip;

  if (!canServerRender) {
    return (
      <div className="h-screen flex flex-col">
        <div className="flex-1 min-h-0">
          <Workbench
            auditId={auditId}
            targetUrl=""
            auditStatus={audit.status}
            findings={[]}
            platform={audit.platform}
            pdfPreviewUrl={null}
          />
        </div>
      </div>
    );
  }

  const findings = await getFindingsForAudit(auditId);

  // Sign evidence URLs (storage paths need short-lived signed URLs to view)
  const sign = async (path: string | null): Promise<string | null> => {
    if (!path) return null;
    try {
      return await createSignedUrl(path.replace(/^.*\/evidence\//, ""));
    } catch {
      return path;
    }
  };

  const signedFindings = await Promise.all(
    (findings || []).map(async (f) => ({
      id: f.id,
      bucket: f.bucket,
      rule_id: f.rule_id,
      rule_title: f.rule_title,
      wcag_criterion: f.wcag_criterion,
      wcag_level: f.wcag_level,
      principle: f.principle,
      severity: f.severity,
      selector: f.selector,
      failure_summary: f.failure_summary,
      screenshot_crop_url: await sign(f.screenshot_crop_url),
      full_screenshot_url: await sign(f.full_screenshot_url),
    }))
  );

  const pdfPath = (audit.config as { pdf?: { pdfPath?: string } } | null)?.pdf?.pdfPath ?? null;
  const pdfPreviewUrl = pdfPath ? await sign(pdfPath) : null;

  return (
    <div className="h-screen flex flex-col">
      <div className="flex-1 min-h-0">
        <Workbench
          auditId={auditId}
          targetUrl={audit.target_url}
          auditStatus={audit.status}
          findings={signedFindings}
          platform={audit.platform}
          pdfPreviewUrl={pdfPreviewUrl}
        />
      </div>
    </div>
  );
}
