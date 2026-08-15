import { AuditInput } from "@/components/audit-input";
import { AuditList } from "@/components/AuditList";
import { AuthStatus } from "@/components/auth-status";
import { Footer } from "@/components/footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <>
      <div className="flex-1 w-full max-w-3xl mx-auto px-4 py-12">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">ScanA11y</h1>
            <p className="text-muted-foreground mt-2">
              WCAG 2.2 accessibility auditor. Submit a URL and get a compliance report with
              evidence-first findings.
            </p>
          </div>
          <div className="shrink-0">
            <AuthStatus />
          </div>
        </header>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Start an audit</CardTitle>
          </CardHeader>
          <CardContent>
            <AuditInput />
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
      <Footer />
    </>
  );
}
