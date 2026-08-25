import Link from "next/link";
import { AuditInput } from "@/components/audit-input";
import { AuditList } from "@/components/AuditList";
import { AuthStatus } from "@/components/auth-status";
import { Footer } from "@/components/footer";
import { GithubBadge } from "@/components/github-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const COMPARISON = [
  {
    tool: "ScanA11y",
    type: "Automated + guided manual",
    cost: "Free — open source (MIT)",
    coverage: "URL, Figma, UI screenshots, Android APK, iOS IPA",
    highlight: true,
  },
  {
    tool: "axe DevTools (Deque)",
    type: "Browser extension / paid platform",
    cost: "Free ext. / Pro from ~$1,140/seat/yr",
    coverage: "URL only, same axe-core engine",
  },
  {
    tool: "WAVE (WebAIM)",
    type: "Browser extension / API",
    cost: "Free ext. / paid API",
    coverage: "URL only, visual overlay",
  },
  {
    tool: "Google Lighthouse",
    type: "Built into Chrome DevTools",
    cost: "Free",
    coverage: "URL only, automated checks only",
  },
  {
    tool: "JAWS",
    type: "Screen reader (manual testing)",
    cost: "~$95/yr – $1,000 one-time",
    coverage: "Manual only, Windows",
  },
  {
    tool: "NVDA",
    type: "Screen reader (manual testing)",
    cost: "Free",
    coverage: "Manual only, Windows",
  },
  {
    tool: "Enterprise platforms (Level Access, Deque)",
    type: "SaaS suite",
    cost: "$500 – $8,000/seat/yr",
    coverage: "Automated + manual, usually one input type",
  },
];

export default function Home() {
  return (
    <>
      <div className="flex-1 w-full max-w-3xl mx-auto px-4 py-12">
        <header className="mb-10">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">ScanA11y</h1>
              <p className="text-muted-foreground mt-2 max-w-xl">
                WCAG 2.2 accessibility auditing — same engine as the industry
                leaders, five input types, zero paid APIs.
              </p>
            </div>
            <div className="shrink-0">
              <AuthStatus />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <GithubBadge />
            <Link
              href="/extension"
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            >
              Browser Extension
            </Link>
            <Link
              href="/figma-plugin"
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            >
              Figma Plugin
            </Link>
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

        <Card className="mb-12">
          <CardHeader>
            <CardTitle>Recent Audits</CardTitle>
          </CardHeader>
          <CardContent>
            <AuditList />
          </CardContent>
        </Card>

        <div className="space-y-8 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold mb-2">Same capability as the industry leaders</h2>
            <p>
              ScanA11y&apos;s automated engine is <strong>axe-core</strong> — the very same
              engine behind axe DevTools, Google Lighthouse, and Microsoft Accessibility
              Insights. That means our automated findings carry the same weight as the
              tools enterprises already trust. And like JAWS and NVDA — the screen
              readers used by real users — ScanA11y verifies screen-reader readiness:
              reading order, focus behavior, announcements, live regions, and name/role/
              value completeness, with guided checklists for what must be tested by hand.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">How it compares</h2>
            <p className="mb-3">
              Matching the leaders&apos; engine while covering five input types and
              screen-reader verification usually means buying several separate tools.
              ScanA11y covers it in one, for free:
            </p>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/40 text-left">
                    <th className="p-2.5 font-semibold">Tool</th>
                    <th className="p-2.5 font-semibold">Type</th>
                    <th className="p-2.5 font-semibold">Cost</th>
                    <th className="p-2.5 font-semibold">Coverage</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON.map((row) => (
                    <tr
                      key={row.tool}
                      className={`border-b last:border-b-0 ${
                        row.highlight ? "bg-primary/5 font-medium" : ""
                      }`}
                    >
                      <td className="p-2.5">{row.tool}</td>
                      <td className="p-2.5 text-muted-foreground">{row.type}</td>
                      <td className="p-2.5 text-muted-foreground">{row.cost}</td>
                      <td className="p-2.5 text-muted-foreground">{row.coverage}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">More inputs, better workflow</h2>
            <p>
              The leaders audit one thing. ScanA11y audits <strong>five</strong>:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li><strong>Live URL</strong> — crawl + axe-core + keyboard walkthrough + evidence screenshots</li>
              <li><strong>Figma designs</strong> — contrast, touch targets, and alt text on real frames (OAuth2)</li>
              <li><strong>UI screenshots</strong> — deterministic element detection plus vision-model advisory</li>
              <li><strong>Android APK</strong> — static manifest + dynamic emulator testing</li>
              <li><strong>iOS IPA</strong> — bundle/plist/asset analysis + guided VoiceOver checklist</li>
            </ul>
            <p className="mt-2">
              One two-column workbench — live preview beside a full WCAG 2.2 checklist
              (A/AA/AAA) — plus 16:9 PDF reports, W3C maturity scoring, and ACR/VPAT
              export.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">Honest by construction</h2>
            <p>
              Automated tools detect a subset of issues; full conformance needs manual
              review by accessibility professionals. ScanA11y is explicit about this:
              vision models only <em>suggest</em> (needs-review bucket), contrast is
              measured by deterministic math, and screen-reader behavior that cannot be
              automated is surfaced as guided checklists — never fabricated results.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">Privacy &amp; data</h2>
            <p>
              Audits are owner-scoped and self-delete within 24 hours (reports, evidence,
              and Figma authorizations). See the{" "}
              <Link href="/privacy" className="text-primary hover:underline">
                Privacy Policy
              </Link>{" "}
              for details.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">Open source</h2>
            <p>
              ScanA11y is open source under the MIT License. Find the source, open
              issues, and contribute on{" "}
              <a
                href="https://github.com/mahirautela2020-design/able"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                GitHub
              </a>
              . This project is personal portfolio IP — not affiliated with any employer.
            </p>
          </section>
        </div>
      </div>
      <Footer />
    </>
  );
}
