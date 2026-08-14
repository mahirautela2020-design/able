import {
  getAuditFromFixture,
  getFindingsFromFixture,
  getScopePagesFromFixture,
} from "@/lib/seed-fixture";
import { ExploreWorkbench } from "@/components/workbench/explore-workbench";
import type { FindingRow } from "@/lib/axe/types";

export const metadata = {
  title: "Explore — Able",
};

export default async function ExplorePage({
  params,
}: {
  params: Promise<{ auditId: string }>;
}) {
  const { auditId } = await params;

  let findings: FindingRow[] = [];
  let scopePages: { id: string; page_title: string | null }[] = [];
  let auditUrl = "";
  let auditCreatedAt = "";
  // targetUrl is ALWAYS the bundled demo fixture on this route — never a
  // real audited page. Only pass the real auditId through when it actually
  // matches that fixture; otherwise Contrast Lab's "Flag finding" would
  // attach a phantom finding (sourced from the demo page) to an unrelated
  // real audit's data (getAuditPageId falls back to that audit's first real
  // scanned page when the demo URL matches none of its pages).
  let matchedAuditId: string | null = null;

  try {
    const audit = getAuditFromFixture();
    if ((audit as Record<string, string>).id === auditId) {
      matchedAuditId = auditId;
      findings = getFindingsFromFixture() as unknown as FindingRow[];
      scopePages = (getScopePagesFromFixture() as Array<{ id: string; page_title: string | null }>).map(
        (p) => ({ id: p.id, page_title: p.page_title })
      );
      auditUrl = audit.target_url as string;
      auditCreatedAt = audit.created_at as string;
    }
  } catch {
    // Use empty data — the Explore workbench renders its own empty states.
  }

  return (
    <div className="h-full">
      <ExploreWorkbench
        targetUrl="/explore-demo.html"
        auditId={matchedAuditId}
        findings={findings}
        scopePages={scopePages}
        auditUrl={auditUrl}
        auditCreatedAt={auditCreatedAt}
      />
    </div>
  );
}
