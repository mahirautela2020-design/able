import { getFindingsFromFixture, getScopePagesFromFixture, getAuditFromFixture } from "@/lib/seed-fixture";
import { FindingsListClient } from "@/components/workbench/findings-list";
import type { FindingRow } from "@/lib/axe/types";

export default async function FindingsPage({
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
    // Use empty data
  }

  return (
    <FindingsListClient
      findings={findings}
      scopePages={scopePages}
      auditUrl={auditUrl}
      auditCreatedAt={auditCreatedAt}
    />
  );
}
