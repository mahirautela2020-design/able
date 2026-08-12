import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — ScanA11y",
};

export default function TermsOfService() {
  return (
    <div className="flex-1 w-full max-w-3xl mx-auto px-4 py-12 prose prose-neutral dark:prose-invert">
      <h1 className="text-3xl font-bold tracking-tight">Terms of Service</h1>
      <p className="text-muted-foreground text-sm">Last updated: August 2026</p>

      <h2>1. Acceptance of terms</h2>
      <p>
        By accessing or using ScanA11y, you agree to be bound by these Terms of Service. If
        you do not agree to these terms, do not use the service.
      </p>

      <h2>2. Description of service</h2>
      <p>
        ScanA11y is an automated accessibility auditing tool. It scans public web pages and
        (where enabled) design files or uploaded artifacts, and generates reports of
        potential WCAG 2.2 compliance issues. Findings are produced by automated engines
        and heuristic checks.
      </p>

      <h2>3. Acceptable use</h2>
      <p>
        You agree to audit only URLs, files, or accounts you own or are authorized to
        audit. You may not use the service to scan infrastructure you do not control, to
        exceed rate limits, to probe unrelated systems, or for any unlawful purpose.
      </p>

      <h2>4. No legal advice / no guarantee</h2>
      <p>
        ScanA11y reports are informational. They do not constitute a formal accessibility
        conformance audit, legal advice, or a certification of compliance with WCAG, ADA,
        Section 508, or any other regulation. Automated tools detect a subset of potential
        issues; manual review by qualified accessibility professionals is required for
        conformance determination. The service is provided &quot;as is&quot; without warranties
        of any kind.
      </p>

      <h2>5. Your content</h2>
      <p>
        You retain all rights to the content you submit for auditing. We use it only to
        provide the service. You grant us a limited license to store and process that
        content for the purpose of delivering audit results.
      </p>

      <h2>6. Accounts & security</h2>
      <p>
        You are responsible for safeguarding your account credentials and for all activity
        under your account. You agree to notify us promptly of any unauthorized use.
      </p>

      <h2>7. Intellectual property</h2>
      <p>
        ScanA11y software and branding are the property of its developers. Open-source
        components (axe-core, Playwright, and others) remain under their respective
        licenses.
      </p>

      <h2>8. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, ScanA11y shall not be liable for any
        indirect, incidental, special, or consequential damages arising from use of the
        service or reliance on audit reports.
      </p>

      <h2>9. Changes to these terms</h2>
      <p>
        We may update these terms from time to time. Material changes will be reflected by
        updating the &quot;Last updated&quot; date above. Continued use after changes constitutes
        acceptance.
      </p>

      <h2>10. Contact</h2>
      <p>
        Questions about these terms may be directed to the ScanA11y team via the contact
        channel provided at sign-up.
      </p>
    </div>
  );
}
