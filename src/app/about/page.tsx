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
        Best-value WCAG 2.2 accessibility auditing — enterprise capability, open source.
      </p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed">
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
          <h2 className="text-lg font-semibold mb-2">Best value, by design</h2>
          <p>
            Enterprise tools cost $500–$8,000 per seat per year — and you still need
            four different products for the inputs ScanA11y covers in one. ScanA11y is
            open source (MIT), uses zero paid APIs in the audit pipeline, and runs on
            your own infrastructure. Same engine as the leaders, broader coverage,
            a fraction of the cost.
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
            issues, and contribute on GitHub. This project is personal portfolio IP —
            not affiliated with any employer.
          </p>
        </section>
      </div>
    </div>
  );
}
