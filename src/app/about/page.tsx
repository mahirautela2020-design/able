import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About — ScanA11y",
};

export default function AboutPage() {
  return (
    <div className="flex-1 w-full max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight">About ScanA11y</h1>
      <p className="text-muted-foreground mt-2">
        An open-source, enterprise-grade WCAG 2.2 accessibility auditor.
      </p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold mb-2">What it does</h2>
          <p>
            ScanA11y audits digital products for accessibility against the full
            WCAG 2.2 success criteria (A/AA/AAA). It covers live URLs, Figma
            design files, UI screenshots, and Android APKs — producing
            evidence-first findings with screenshots, a compliance matrix, and
            16:9 PDF reports.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">How it works</h2>
          <p>
            Automated checks run on open-source engines — <strong>axe-core</strong>{" "}
            (the same engine behind axe DevTools, Lighthouse, and Microsoft
            Accessibility Insights), <strong>Playwright</strong>, and
            deterministic color-contrast math. Vision models (Gemini / MiMo)
            only ever <em>suggest</em> issues in a needs-review bucket; they
            never create hard findings. Manual checks are surfaced for
            criteria that can&apos;t be automated.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">Why &ldquo;best value&rdquo;</h2>
          <p>
            One platform covering five input modes, WCAG 2.2 A/AA/AAA,
            evidence-first findings, ACR/VPAT export, and W3C maturity scoring —
            at a fraction of the cost of the tool stack it replaces. Built on
            open-source engines end-to-end, with zero paid APIs in the audit
            pipeline.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">Privacy &amp; data</h2>
          <p>
            Audits are owner-scoped and self-delete within 24 hours (reports,
            evidence, and Figma authorizations). See the{" "}
            <Link href="/privacy" className="text-primary hover:underline">
              Privacy Policy
            </Link>{" "}
            for details.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">Open source</h2>
          <p>
            ScanA11y is open source under the MIT License. Find the source,
            open issues, and contribute on GitHub. This project is personal
            portfolio IP — not affiliated with any employer.
          </p>
        </section>
      </div>
    </div>
  );
}
