import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — ScanA11y",
};

export default function PrivacyPolicy() {
  return (
    <div className="flex-1 w-full max-w-3xl mx-auto px-4 py-12 prose prose-neutral dark:prose-invert">
      <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
      <p className="text-muted-foreground text-sm">Last updated: August 2026</p>

      <h2>1. What we collect</h2>
      <p>
        ScanA11y processes the data you submit for accessibility auditing: the URL(s) you ask
        us to scan, the audit configuration, and the scan results (findings, screenshots, and
        evidence crops). If you connect a third-party account (e.g. Figma), we store the
        authorization token needed to access the files you explicitly choose to audit.
      </p>

      <h2>2. How we use it</h2>
      <p>
        Your data is used solely to run audits and generate reports. We never sell your data.
        We never use your audit content to train models. Automated findings are produced by
        open-source engines (axe-core, Playwright); no third party sees your scans.
      </p>

      <h2>3. Data storage & retention</h2>
      <p>
        Audit records are stored in our hosted database (Supabase). Screenshots and report
        files are stored in private storage and served via short-lived signed URLs. Audit
        evidence is retained for 30 days, after which it is scheduled for deletion. You can
        delete any audit at any time from the application, which removes its findings and
        evidence immediately.
      </p>

      <h2>4. Cookies & analytics</h2>
      <p>
        We use only essential cookies required for the application to function (session
        handling). We do not use third-party advertising cookies or cross-site trackers.
      </p>

      <h2>5. Third-party services</h2>
      <p>
        Audits execute in a headless browser (Chromium) hosted on our infrastructure
        (Vercel serverless functions). The Inngest service coordinates background jobs.
        These providers process data only to deliver the service under their respective
        data-processing terms.
      </p>

      <h2>6. Your rights</h2>
      <p>
        You may request a copy of your data, deletion of your data, or correction of
        inaccuracies by contacting us. Where you have connected a third-party account,
        you can revoke access at any time from that provider&apos;s settings.
      </p>

      <h2>7. Security</h2>
      <p>
        Database access is protected by row-level security; evidence storage is private with
        signed, expiring URLs. API keys are hashed at rest. We apply security updates to our
        dependencies on a regular basis.
      </p>

      <h2>8. Contact</h2>
      <p>
        For privacy inquiries, contact the ScanA11y team via the repository or project
        contact channel provided at the point of sign-up.
      </p>
    </div>
  );
}
