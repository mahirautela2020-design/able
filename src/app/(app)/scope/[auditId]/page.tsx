import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getAuditFromFixture, getScopePagesFromFixture } from "@/lib/seed-fixture";

export default async function ScopeDetailPage({
  params,
}: {
  params: Promise<{ auditId: string }>;
}) {
  const { auditId } = await params;

  let audit: Record<string, unknown> | null = null;
  let scopePages: Record<string, unknown>[] = [];

  try {
    audit = getAuditFromFixture();
    scopePages = getScopePagesFromFixture();

    if (!audit || (audit as Record<string, string>).id !== auditId) {
      audit = null;
      scopePages = [];
    }
  } catch {
    audit = null;
    scopePages = [];
  }

  if (!audit) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-12">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p className="text-lg font-medium">Audit not found</p>
            <p className="text-sm mt-2">
              No audit with ID &quot;{auditId}&quot; exists. Run a scan first or check the fixture data.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">
          {audit.target_url as string}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Audit created {new Date(audit.created_at as string).toLocaleDateString()}
          {(audit as Record<string, unknown>).completed_at
            ? ` · Completed ${new Date((audit as Record<string, unknown>).completed_at as string).toLocaleDateString()}`
            : ""}
        </p>
        <div className="flex items-center gap-2 mt-2">
          <Badge variant={audit.status === "complete" ? "outline" : "default"}>
            {audit.status as string}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {scopePages.length} page{scopePages.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Scanned Pages</CardTitle>
        </CardHeader>
        <CardContent>
          {scopePages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No pages scanned yet.
            </p>
          ) : (
            <div className="space-y-2">
              {scopePages.map((page) => (
                <Link
                  key={page.id as string}
                  href={`/scope/${auditId}/snapshots/${page.id}`}
                  className="flex items-center justify-between p-3 rounded-md border hover:bg-accent/50 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {(page.page_title as string) || (page.page_url as string)}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {page.page_url as string}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {page.wcag_score != null && (
                      <span className="text-sm font-mono font-medium">
                        {(page.wcag_score as number).toFixed(1)}%
                      </span>
                    )}
                    <Badge variant="outline">{page.status as string}</Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
