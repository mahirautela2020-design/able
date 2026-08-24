import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Figma Plugin — ScanA11y",
  description:
    "Audit frames and layers in your Figma file against WCAG 2.2, jump to any finding on canvas, and generate a full 16:9 report in the file itself — free plugin, no login, nothing sent to a server.",
};

const STEPS = [
  { title: "Download the plugin", body: "Download the zip below. It contains the built plugin — no build step needed." },
  { title: "Unzip it", body: "Extract the zip to a folder you'll keep around (Figma reads the plugin from this folder every time you run it)." },
  { title: "Open Figma desktop", body: "This install flow needs the Figma desktop app — it isn't available from figma.com in a browser." },
  { title: "Import the plugin", body: "Menu → Plugins → Development → Import plugin from manifest… — then select manifest.json inside the unzipped folder." },
  { title: "Run it", body: "Open any file, select what you want audited (or nothing, for a whole-page audit), then Plugins → Development → ScanA11y — Accessibility Auditor." },
];

export default function FigmaPluginPage() {
  return (
    <>
      <div className="flex-1 w-full max-w-3xl mx-auto px-4 py-12">
        <header className="mb-10">
          <p className="text-sm text-muted-foreground mb-2">
            <Link href="/" className="hover:text-foreground transition-colors">
              ← ScanA11y
            </Link>
          </p>
          <h1 className="text-3xl font-bold tracking-tight">Figma Plugin</h1>
          <p className="text-muted-foreground mt-2 max-w-xl">
            Audit the frames and layers in your Figma file against WCAG 2.2, jump to any
            finding on canvas, and generate a full report — one 16:9 frame per finding, with
            a screenshot and a recommendation — written directly into the file. No login, no
            history stored, no network calls.
          </p>
        </header>

        <Card className="mb-8">
          <CardContent className="pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="font-semibold">scana11y-figma-plugin.zip</p>
              <p className="text-sm text-muted-foreground">
                Not on Figma Community yet — install as a local development plugin (free,
                takes under a minute, Figma desktop app required).
              </p>
            </div>
            <a
              href="/downloads/scana11y-figma-plugin.zip"
              download
              className="shrink-0 inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Download .zip
            </a>
          </CardContent>
        </Card>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Install it</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-4">
              {STEPS.map((step, i) => (
                <li key={step.title} className="flex gap-3">
                  <span
                    className="shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold"
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                  <div className="text-sm">
                    <p className="font-medium">{step.title}</p>
                    <p className="text-muted-foreground mt-0.5">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <div className="space-y-8 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold mb-2">What it checks</h2>
            <p>
              The same WCAG 2.2 compliance matrix the website uses — but a static design file
              has no live DOM, keyboard, or focus, so only what&apos;s actually verifiable
              from a Figma file runs as a live check: text contrast, touch-target size,
              missing image descriptions, text boxes at risk of clipping, and heading-hierarchy
              signals. Everything else (keyboard, focus, live regions, real reading order,
              screen-reader announcement) shows as <strong>manual</strong> — the plugin says
              so rather than a fabricated pass.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">Why local install</h2>
            <p>
              Publishing to Figma Community is free (no developer fee, unlike the Chrome Web
              Store) but still goes through review. Loading it locally is immediate and gives
              you the exact same plugin — Figma just shows it under &quot;Development&quot;
              instead of the Community tab, and you rebuild manually after an update instead
              of it auto-updating.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">Privacy</h2>
            <p>
              Everything runs inside Figma&apos;s plugin sandbox against the file already open
              on your machine. The manifest explicitly denies all network access
              (<code className="text-xs bg-muted px-1 py-0.5 rounded">networkAccess.allowedDomains: [&quot;none&quot;]</code>)
              — nothing is sent anywhere.
            </p>
          </section>
        </div>
      </div>
      <Footer />
    </>
  );
}
