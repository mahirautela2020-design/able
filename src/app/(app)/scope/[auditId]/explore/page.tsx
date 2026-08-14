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

  try {
    const audit = getAuditFromFixture();
    if ((audit as Record<string, string>).id === auditId) {
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
        findings={findings}
        scopePages={scopePages}
        auditUrl={auditUrl}
        auditCreatedAt={auditCreatedAt}
      />
    </div>
  );
}
