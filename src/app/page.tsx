import { AuditForm } from "@/components/AuditForm";
import { AuditList } from "@/components/AuditList";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <div className="flex-1 w-full max-w-3xl mx-auto px-4 py-12">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Able</h1>
        <p className="text-muted-foreground mt-2">
          WCAG 2.2 accessibility auditor. Submit a URL and get a compliance report with
          evidence-first findings.
        </p>
      </header>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Audit a URL</CardTitle>
          <CardDescription>
            Enter a public URL. We&apos;ll crawl up to 5 pages and scan each with axe-core
            and keyboard walkthrough.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AuditForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Audits</CardTitle>
        </CardHeader>
        <CardContent>
          <AuditList />
        </CardContent>
      </Card>
    </div>
  );
}
