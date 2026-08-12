import { AuditInput } from "@/components/audit-input";
import { AuditList } from "@/components/AuditList";
import { AuthStatus } from "@/components/auth-status";
import { ConnectFigmaButton } from "@/components/connect-figma-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <div className="flex-1 w-full max-w-3xl mx-auto px-4 py-12">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">ScanA11y</h1>
          <p className="text-muted-foreground mt-2">
            WCAG 2.2 accessibility auditor. Submit a URL and get a compliance report with
            evidence-first findings.
          </p>
        </div>
        <AuthStatus />
      </header>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Start an audit</CardTitle>
          <CardDescription>
            Choose a source: live URL, Figma design, UI screenshot, or Android APK.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AuditInput />
        </CardContent>
      </Card>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Figma Account</span>
            <ConnectFigmaButton />
          </CardTitle>
          <CardDescription>
            Connect your Figma account to audit design files with your own access —
            contrast, touch targets, and image alt text on real frames.
          </CardDescription>
        </CardHeader>
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
