import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Browser Extension — ScanA11y",
  description:
    "Audit the page you're on, inspect any element, and apply live accessibility adjustments — free Chrome/Edge/Brave extension, no login, nothing stored.",
};

const STEPS = [
  {
    title: "Download the extension",
    body: "Download the zip below. It contains the built extension — no build step needed.",
  },
  {
    title: "Unzip it",
    body: "Extract the zip to a folder you'll keep around (don't delete it after installing — Chrome loads the extension from this folder every time it starts).",
  },
  {
    title: "Open your browser's extensions page",
    body: "Chrome: go to chrome://extensions. Edge: go to edge://extensions. Brave: go to brave://extensions. Any Chromium-based browser works the same way.",
  },
  {
    title: "Turn on Developer mode",
    body: "Toggle “Developer mode” on — it's usually a switch in the top-right corner of the extensions page.",
  },
  {
    title: "Click “Load unpacked”",
    body: "A file picker opens. Select the unzipped folder itself (the one containing manifest.json) — not a zip file, not the dist/ subfolder.",
  },
  {
    title: "Pin it and open the panel",
    body: "Click the puzzle-piece icon in the toolbar, pin ScanA11y, then click its icon to open the side panel. It stays open while you browse, unlike a popup.",
  },
];

export default function ExtensionPage() {
  return (
    <>
      <div className="flex-1 w-full max-w-3xl mx-auto px-4 py-12">
        <header className="mb-10">
          <p className="text-sm text-muted-foreground mb-2">
            <Link href="/" className="hover:text-foreground transition-colors">
              ← ScanA11y
            </Link>
          </p>
          <h1 className="text-3xl font-bold tracking-tight">Browser Extension</h1>
          <p className="text-muted-foreground mt-2 max-w-xl">
            Audit whatever page you have open, inspect any element, and try live
            accessibility adjustments — directly in a Chromium browser side panel.
            No login, no history stored, nothing sent to a server.
          </p>
        </header>

        <Card className="mb-8">
          <CardContent className="pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="font-semibold">scana11y-chrome-extension.zip</p>
              <p className="text-sm text-muted-foreground">
                Works in Chrome, Edge, Brave, and other Chromium-based browsers.
                Not on the Chrome Web Store yet — install as an unpacked
                extension (free, takes under a minute).
              </p>
            </div>
            <a
              href="/downloads/scana11y-chrome-extension.zip"
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
            <h2 className="text-lg font-semibold mb-2">What it does</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Audit</strong> — runs axe-core plus a live keyboard/focus-order
                walkthrough directly in the tab, shown as the same WCAG 2.2 compliance
                matrix the website uses.
              </li>
              <li>
                <strong>Inspect</strong> — click any element to see its role, name,
                contrast ratio, and touch-target size; step through the page&apos;s
                focus order; scan contrast pairs across the page.
              </li>
              <li>
                <strong>Accessibility options</strong> — apply the same live
                adjustments as the website (contrast, text scale, dyslexia font,
                reduced motion, and more) to see how the page responds.
              </li>
              <li>Download a 16:9 PDF report with a screenshot of every finding.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">Why an unpacked install</h2>
            <p>
              Publishing to the Chrome Web Store requires a one-time paid developer
              registration. Loading it unpacked is completely free and gives you the
              exact same extension — the only difference is Chrome shows a
              &quot;Developer mode&quot; notice, and you reload it manually after an
              update instead of it auto-updating.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">Permissions</h2>
            <p>
              The extension asks for broad host access (all sites) because it needs
              to script and screenshot whatever page you have open when you click a
              button — a side panel stays open across tab switches, so the narrower
              &quot;only when clicked&quot; permission Chrome offers isn&apos;t
              reliable here. Nothing is read or modified until you explicitly trigger
              an action from the panel; nothing is sent off your machine.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">Updating</h2>
            <p>
              Re-download the zip, unzip it over the same folder (or a fresh one),
              then click the refresh icon on the extension&apos;s card in{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">chrome://extensions</code>.
            </p>
          </section>
        </div>
      </div>
      <Footer />
    </>
  );
}
