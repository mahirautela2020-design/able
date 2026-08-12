import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AxTree } from "@/components/workbench/ax-tree";
import { getAxSnapshotsFromFixture, getScopePagesFromFixture, getAuditFromFixture } from "@/lib/seed-fixture";
import { isAxSnapshot, type AxSnapshot } from "@/lib/axe/types";

export default async function AxSnapshotPage({
  params,
}: {
  params: Promise<{ auditId: string; pageId: string }>;
}) {
  const { auditId, pageId } = await params;

  let snapshot: AxSnapshot | null = null;
  let pageTitle = "";
  let pageUrl = "";

  try {
    const audit = getAuditFromFixture();
    if ((audit as Record<string, string>).id === auditId) {
      const snapshots = getAxSnapshotsFromFixture();
      const pages = getScopePagesFromFixture();

      const match = snapshots.find(
        (s: Record<string, unknown>) => s.page_id === pageId
      );

      if (match && isAxSnapshot((match as Record<string, unknown>).snapshot)) {
        snapshot = (match as { snapshot: AxSnapshot }).snapshot;
      }

      const page = pages.find(
        (p: Record<string, unknown>) => p.id === pageId
      );
      if (page) {
        pageTitle = (page.page_title as string) || "";
        pageUrl = (page.page_url as string) || "";
      }
    }
  } catch {
    // snapshot remains null
  }

  if (!snapshot) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-12">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p className="text-lg font-medium">AX Snapshot not found</p>
            <p className="text-sm mt-2">
              No accessibility tree snapshot exists for page &quot;{pageId}&quot;.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Accessibility Tree</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {pageTitle || pageUrl} — AX snapshot for page
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {snapshot.name || pageTitle}
            <span className="text-muted-foreground font-normal text-sm ml-2">
              role: {snapshot.role}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AxTree root={snapshot} />
        </CardContent>
      </Card>
    </div>
  );
}
