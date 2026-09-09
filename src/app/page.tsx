import Link from "next/link";
import { AuditInput } from "@/components/audit-input";
import { AuditList } from "@/components/AuditList";
import { AuthStatus } from "@/components/auth-status";
import { Footer } from "@/components/footer";
import { GithubBadge } from "@/components/github-badge";
import { LandingMotion } from "@/components/landing/landing-motion";

/** Every WCAG 2.2 success criterion, A through AAA. The compliance matrix in
 * the workbench renders one cell per criterion; this is that shape at rest. */
const WCAG_22_CRITERIA = 87;

/** A deterministic stand-in for one audit's matrix. Fixed arithmetic rather
 * than random values so the server and client render identical markup. */
const MATRIX_STATES = Array.from({ length: WCAG_22_CRITERIA }, (_, i) => {
  if (i % 11 === 3) return "fail" as const;
  if (i % 7 === 2) return "review" as const;
  if (i % 5 === 1) return "untested" as const;
  return "pass" as const;
});

const MATRIX_FILL: Record<(typeof MATRIX_STATES)[number], string> = {
  pass: "bg-[var(--ink-faint)]",
  fail: "bg-[var(--fail)]",
  review: "bg-[var(--flag)]",
  untested: "bg-[var(--rule)]",
};

const DELIVERABLES = [
  {
    title: "Evidence, not a rule name",
    body: "The crop from the scan, the criterion (1.4.3 Contrast (Minimum), AA), the measured ratio against the one required, and the fix. No crop beats a wrong crop.",
  },
  {
    title: "A matrix across all 87 criteria",
    body: "Passed, failed, needs review, not tested. Nothing untested is ever reported as passed.",
  },
  {
    title: "A 16:9 PDF, a VPAT 2.5, a maturity score",
    body: "One finding per printed page with its screenshot, scored across governance, design, dev, QA and ops.",
  },
];

const INPUTS = [
  {
    key: "URL",
    name: "A live site",
    body: "Crawls up to 5 pages: axe-core 4.13, keyboard order, reflow at 375 and 768, evidence crops.",
  },
  {
    key: "FIG",
    name: "A Figma file",
    body: "Frames over the REST API: contrast pairs, touch targets, images with no description. Connect an account or paste a link.",
  },
  {
    key: "IMG",
    name: "A UI screenshot",
    body: "Element detection first, then vision-model suggestions that stay advisory.",
  },
  {
    key: "PDF",
    name: "A PDF document",
    body: "PDF/UA structure up to 25MB: tags, reading order, language, alt text, and scans posing as documents.",
  },
  {
    key: "APK",
    name: "An Android package",
    body: "aapt2 manifest analysis, plus live checks for labels, target size and contrast when an emulator is running.",
  },
  {
    key: "IPA",
    name: "An iOS bundle",
    body: "Info.plist and asset inspection, plus a guided VoiceOver checklist for the dynamic half.",
  },
];

const COMPARISON = [
  {
    tool: "ScanA11y",
    type: "Automated plus guided manual",
    cost: "Free, open source (MIT)",
    coverage: "URL, Figma, screenshot, PDF, APK, IPA",
    highlight: true,
  },
  {
    tool: "axe DevTools (Deque)",
    type: "Browser extension, paid platform",
    cost: "Free extension, Pro from ~$1,140/seat/yr",
    coverage: "URL only, same axe-core engine",
  },
  {
    tool: "WAVE (WebAIM)",
    type: "Browser extension, API",
    cost: "Free extension, paid API",
    coverage: "URL only, visual overlay",
  },
  {
    tool: "Google Lighthouse",
    type: "Built into Chrome DevTools",
    cost: "Free",
    coverage: "URL only, automated checks",
  },
  {
    tool: "JAWS",
    type: "Screen reader, manual testing",
    cost: "~$95/yr to $1,000 one-time",
    coverage: "Manual only, Windows",
  },
  {
    tool: "NVDA",
    type: "Screen reader, manual testing",
    cost: "Free",
    coverage: "Manual only, Windows",
  },
  {
    tool: "Level Access, Deque platform",
    type: "Enterprise SaaS suite",
    cost: "$500 to $8,000/seat/yr",
    coverage: "Automated plus manual, usually one input type",
  },
];

const LIMITS = [
  {
    claim: "Automated testing cannot certify conformance.",
    body: "It catches a subset. The rest becomes a guided checklist for a human, never a silent pass.",
  },
  {
    claim: "Vision models never create a finding.",
    body: "They suggest, into needs review, labelled advisory. Contrast is deterministic colour maths.",
  },
  {
    claim: "iOS dynamic testing needs macOS.",
    body: "Nothing on Windows or Linux can drive the iOS Simulator. You get static bundle analysis and a Mac checklist.",
  },
  {
    claim: "Sites behind a bot wall will not scan.",
    body: "The challenge page is reported as blocked, with the reason, not as a clean pass.",
  },
];

/** Aligns a section's body to the heading's text edge, past the number gutter. */
function SectionBody({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={`sm:pl-[var(--gutter)] ${className}`}>{children}</div>;
}

function SectionHead({
  n,
  title,
  lede,
}: {
  n: string;
  title: string;
  lede?: string;
}) {
  return (
    <div className={lede ? "mb-12" : "mb-8"}>
      <div data-rule className="h-px w-full origin-left bg-[var(--rule-strong)]" />
      {/* GUTTER is the page's single vertical rhythm: the section number hangs
          in it and every body block below aligns to the heading's text edge,
          so the numerals read as a register rather than as stray marks. */}
      <div
        data-anim="head"
        className="mt-6 grid gap-y-3 sm:grid-cols-[var(--gutter)_minmax(0,1fr)]"
      >
        <span className="font-mono text-xs tabular-nums text-[var(--ink-faint)] sm:pt-2">
          {n}
        </span>
        <div className="max-w-3xl">
          <h2 className="text-[clamp(1.75rem,3.4vw,2.75rem)] font-semibold leading-[1.08] tracking-[-0.025em]">
            {title}
          </h2>
          {lede && (
            <p className="mt-4 max-w-[62ch] text-[1.0625rem] leading-relaxed text-[var(--ink-soft)]">
              {lede}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** The product's own output, rendered as the hero image. A dev tool's imagery
 * is what it puts on your screen. */
function Specimen() {
  return (
    <div
      data-anim="hero-panel"
      className="overflow-hidden rounded-lg border border-[var(--rule-strong)] bg-[var(--paper)] shadow-[0_1px_0_0_var(--rule),0_18px_40px_-28px_oklch(0.2_0.02_85/0.45)]"
    >
      <div className="flex items-center justify-between border-b border-[var(--rule)] px-4 py-2.5 font-mono text-[11px] text-[var(--ink-faint)]">
        <span>evidence / page 1 of 5</span>
        <span className="text-[var(--fail)]">serious</span>
      </div>

      {/* The captured region, abstracted: what the crop shows is a piece of a
          real page with the failing element ringed. */}
      <div className="relative isolate bg-[var(--paper-sunk)] px-5 py-6">
        <div
          data-anim="scan"
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 z-20 h-16 -translate-y-1/2 bg-[linear-gradient(to_bottom,transparent,var(--flag),transparent)] opacity-25"
        />
        <div className="space-y-3" aria-hidden="true">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-sm bg-[var(--ink)]" />
            <div className="h-1.5 w-16 rounded-full bg-[var(--rule-strong)]" />
            <div className="ml-auto flex gap-2">
              <div className="h-1.5 w-8 rounded-full bg-[var(--rule)]" />
              <div className="h-1.5 w-8 rounded-full bg-[var(--rule)]" />
            </div>
          </div>
          <div className="h-3 w-3/5 rounded-sm bg-[var(--ink)]/85" />
          <div className="h-1.5 w-11/12 rounded-full bg-[var(--rule-strong)]" />
          <div className="h-1.5 w-4/5 rounded-full bg-[var(--rule-strong)]" />

          <div className="relative inline-block pt-2">
            <div
              data-anim="target"
              className="absolute -inset-1.5 rounded-[3px] border-2 border-[var(--flag)] bg-[var(--flag)]/15"
            />
            {/* The finding this panel illustrates IS a contrast failure, but
                shipping failing text on an accessibility product's own page
                would be indefensible. The verdict rows below carry the real
                colours and the measured ratio; the label itself stays
                readable. */}
            <span className="relative text-[13px] font-medium text-[var(--ink-soft)]">
              Continue to checkout
            </span>
          </div>
        </div>
      </div>

      <div
        data-anim="verdict"
        className="divide-y divide-[var(--rule)] border-t border-[var(--rule)]"
      >
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <span className="rounded-sm bg-[var(--flag)] px-2 py-0.5 font-mono text-[11px] font-medium text-[var(--flag-ink)]">
            1.4.3
          </span>
          <span className="text-sm font-medium">Contrast (Minimum)</span>
          <span className="rounded-sm border border-[var(--rule-strong)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--ink-soft)]">
            AA
          </span>
        </div>
        <div className="flex items-baseline gap-3 px-4 py-3 font-mono text-[13px] tabular-nums">
          <span className="text-[var(--fail)]">2.94:1</span>
          <span className="text-[var(--ink-faint)]">measured</span>
          <span className="ml-auto text-[var(--ink-soft)]">4.5:1 required</span>
        </div>
        <p className="px-4 py-3 text-[13px] leading-relaxed text-[var(--ink-soft)]">
          Foreground <span className="font-mono">#9aa0a6</span> on{" "}
          <span className="font-mono">#ffffff</span>. Darkening to{" "}
          <span className="font-mono">#6b7075</span> reaches 4.83:1.
        </p>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div
      data-surface="landing"
      style={{ "--gutter": "3.5rem" } as React.CSSProperties}
      className="flex flex-1 flex-col bg-[var(--paper)] text-[var(--ink)]"
    >
      <LandingMotion />

      <header className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-3 gap-y-4 px-6 py-6">
        <span className="text-[15px] font-semibold tracking-[-0.02em]">ScanA11y</span>
        <span className="hidden font-mono text-[11px] text-[var(--ink-faint)] sm:inline">
          WCAG 2.2 / A / AA / AAA
        </span>
        <nav
          aria-label="Related tools"
          className="ml-auto flex flex-wrap items-center gap-2"
        >
          <GithubBadge />
          <Link
            href="/extension"
            className="rounded-full border border-[var(--rule-strong)] px-3 py-1 text-xs font-medium text-[var(--ink-soft)] transition-colors hover:bg-[var(--paper-sunk)] hover:text-[var(--ink)]"
          >
            Browser extension
          </Link>
          <Link
            href="/figma-plugin"
            className="rounded-full border border-[var(--rule-strong)] px-3 py-1 text-xs font-medium text-[var(--ink-soft)] transition-colors hover:bg-[var(--paper-sunk)] hover:text-[var(--ink)]"
          >
            Figma plugin
          </Link>
          <AuthStatus />
        </nav>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-6xl px-6 pb-12 pt-10 sm:pt-14">
        <div className="grid gap-x-12 gap-y-12 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <h1 className="text-[clamp(2.5rem,6.4vw,4.75rem)] font-semibold leading-[0.98] tracking-[-0.035em]">
              {["Every failure,", "with the proof", "attached."].map((line) => (
                <span key={line} className="block overflow-hidden pb-[0.06em]">
                  <span data-anim="hero-line" className="block">
                    {line}
                  </span>
                </span>
              ))}
            </h1>

            <p
              data-anim="hero-sub"
              className="mt-7 max-w-[52ch] text-[1.125rem] leading-relaxed text-[var(--ink-soft)]"
            >
              Site, Figma file, screenshot, PDF, Android or iOS build: you get
              the element that failed, the criterion it breaks, and the fix.
            </p>
          </div>

          <div className="lg:col-span-5 lg:pt-1">
            <Specimen />
            <p className="mt-3 max-w-[42ch] text-[13px] leading-relaxed text-[var(--ink-faint)]">
              One finding, as the workbench renders it.
            </p>
          </div>
        </div>
      </section>

      {/* ── The audit bar ────────────────────────────────────────────────────
          Deliberately wears the same ring the Specimen puts around a failing
          element. The page's one signal colour marks the thing to act on, so
          the primary action and the product's own output speak the same
          visual language instead of competing. */}
      <section className="mx-auto w-full max-w-6xl px-6 pb-20">
        <div
          data-anim="hero-cta"
          className="rounded-xl border-2 border-[var(--flag)] bg-[var(--flag)]/10 p-5 sm:p-7"
        >
          <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <h2 className="text-base font-medium tracking-[-0.01em]">Start an audit</h2>
            <p className="font-mono text-[11px] text-[var(--ink-soft)]">
              Five a day without an account. Everything deletes itself in 24 hours.
            </p>
          </div>
          <AuditInput />
        </div>
      </section>

      {/* ── Recent audits ────────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-6xl px-6 pb-20">
        <div data-rule className="h-px w-full origin-left bg-[var(--rule)]" />
        <h2 className="mb-4 mt-5 font-mono text-xs text-[var(--ink-faint)]">
          Recent audits
        </h2>
        <AuditList />
      </section>

      {/* ── 01 What comes back ───────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-6xl px-6 pb-28">
        <SectionHead n="01" title="What comes back" />

        <SectionBody className="grid gap-x-12 gap-y-16 lg:grid-cols-12">
          <dl data-stagger className="lg:col-span-7">
            {DELIVERABLES.map((d) => (
              <div
                key={d.title}
                className="border-t border-[var(--rule)] py-6 first:border-t-0 first:pt-0"
              >
                <dt className="text-lg font-medium tracking-[-0.01em]">{d.title}</dt>
                <dd className="mt-2 max-w-[64ch] leading-relaxed text-[var(--ink-soft)]">
                  {d.body}
                </dd>
              </div>
            ))}
          </dl>

          <div className="lg:col-span-5">
            <div className="rounded-lg border border-[var(--rule-strong)] bg-[var(--paper-sunk)] p-5">
              <p className="font-mono text-[11px] text-[var(--ink-faint)]">
                compliance matrix / {WCAG_22_CRITERIA} criteria
              </p>
              <div
                data-anim="matrix"
                aria-hidden="true"
                className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(14px,1fr))] gap-1.5"
              >
                {MATRIX_STATES.map((state, i) => (
                  <span
                    key={i}
                    className={`aspect-square rounded-[2px] ${MATRIX_FILL[state]}`}
                  />
                ))}
              </div>
              <ul className="mt-5 space-y-2 font-mono text-[11px] text-[var(--ink-soft)]">
                {(
                  [
                    ["pass", "passed automated checks"],
                    ["fail", "failed, evidence attached"],
                    ["review", "needs a human"],
                    ["untested", "not tested, and says so"],
                  ] as const
                ).map(([state, label]) => (
                  <li key={state} className="flex items-center gap-2.5">
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-[2px] ${MATRIX_FILL[state]}`}
                    />
                    {label}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </SectionBody>
      </section>

      {/* ── 02 Ways in ───────────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-6xl px-6 pb-28">
        <SectionHead n="02" title="Six ways in" />

        <div className="relative pl-6 sm:pl-[var(--gutter)]">
          <div
            aria-hidden="true"
            className="absolute bottom-0 left-0 top-0 w-px bg-[var(--rule)]"
          />
          <div
            data-anim="track"
            aria-hidden="true"
            className="absolute bottom-0 left-0 top-0 w-px origin-top bg-[var(--ink)]"
          />
          <dl data-stagger>
            {INPUTS.map((input) => (
              <div
                key={input.key}
                className="grid gap-x-8 gap-y-2 border-b border-[var(--rule)] py-7 last:border-b-0 sm:grid-cols-[4.5rem_1fr]"
              >
                <dt className="font-mono text-xs text-[var(--ink-faint)] sm:pt-1.5">
                  {input.key}
                </dt>
                <dd>
                  <p className="text-lg font-medium tracking-[-0.01em]">{input.name}</p>
                  <p className="mt-2 max-w-[68ch] leading-relaxed text-[var(--ink-soft)]">
                    {input.body}
                  </p>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── 03 Workbench ─────────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-6xl px-6 pb-28">
        <SectionHead
          n="03"
          title="One place to work through it"
          lede="Three modes over one audit: the page on one side, the WCAG 2.2 checklist on the other."
        />
        <SectionBody>
        <dl
          data-stagger
          className="grid gap-px overflow-hidden rounded-lg border border-[var(--rule-strong)] bg-[var(--rule)] sm:grid-cols-3"
        >
          {[
            [
              "Checklist",
              "Every criterion by principle, with findings, evidence and verdict, filterable to what each module covered.",
            ],
            [
              "Inspect",
              "Click any element for its contrast, target size and accessible name; simulate colour vision deficiency, larger text, reduced motion.",
            ],
            [
              "Screen reader",
              "A transcript built from the accessibility tree, read aloud in the browser, nothing to install.",
            ],
          ].map(([title, body]) => (
            <div key={title} className="bg-[var(--paper)] p-6">
              <dt className="text-base font-medium">{title}</dt>
              <dd className="mt-2 text-[15px] leading-relaxed text-[var(--ink-soft)]">
                {body}
              </dd>
            </div>
          ))}
        </dl>
        </SectionBody>
      </section>

      {/* ── 04 Comparison ────────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-6xl px-6 pb-28">
        <SectionHead
          n="04"
          title="How it compares"
          lede="Same axe-core engine as axe DevTools, Lighthouse and Accessibility Insights. What changes is how many tools you need around it."
        />
        <SectionBody>
        {/* A horizontally scrollable region must be reachable by keyboard
            (WCAG 2.1.1); axe flags this exact pattern as
            scrollable-region-focusable when the container is not focusable. */}
        <div
          tabIndex={0}
          role="region"
          aria-label="Tool comparison table, scrolls horizontally"
          className="overflow-x-auto rounded-lg border border-[var(--rule-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
        >
          <table className="w-full min-w-[42rem] border-collapse text-left text-sm">
            <caption className="sr-only">
              ScanA11y compared with common accessibility testing tools, by type,
              cost and coverage.
            </caption>
            <thead>
              <tr className="border-b border-[var(--rule-strong)] bg-[var(--paper-sunk)]">
                {["Tool", "Type", "Cost", "Coverage"].map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className="px-4 py-3 font-mono text-[11px] font-medium text-[var(--ink-faint)]"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody data-stagger>
              {COMPARISON.map((row) => (
                <tr
                  key={row.tool}
                  className={`border-b border-[var(--rule)] last:border-b-0 ${
                    row.highlight ? "bg-[var(--flag)]/12" : ""
                  }`}
                >
                  <th
                    scope="row"
                    className={`px-4 py-3.5 text-left font-medium ${
                      row.highlight ? "text-[var(--ink)]" : ""
                    }`}
                  >
                    {row.tool}
                  </th>
                  <td className="px-4 py-3.5 text-[var(--ink-soft)]">{row.type}</td>
                  <td className="px-4 py-3.5 text-[var(--ink-soft)]">{row.cost}</td>
                  <td className="px-4 py-3.5 text-[var(--ink-soft)]">{row.coverage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 max-w-[70ch] text-[13px] leading-relaxed text-[var(--ink-faint)]">
          Published list prices, which move; the column that matters is
          coverage.
        </p>
        </SectionBody>
      </section>

      {/* ── 05 Limits ────────────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-6xl px-6 pb-28">
        <SectionHead n="05" title="What it will not do" />
        <SectionBody>
        <dl data-stagger className="grid gap-x-12 gap-y-8 sm:grid-cols-2">
          {LIMITS.map((l) => (
            <div key={l.claim} className="border-t border-[var(--rule)] pt-5">
              <dt className="text-base font-medium leading-snug">{l.claim}</dt>
              <dd className="mt-2 max-w-[54ch] leading-relaxed text-[var(--ink-soft)]">
                {l.body}
              </dd>
            </div>
          ))}
        </dl>
        </SectionBody>
      </section>

      {/* ── 06 Open source ───────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-6xl px-6 pb-32">
        <SectionHead n="06" title="Read the code" />
        <SectionBody className="grid gap-x-12 gap-y-10 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <p className="max-w-[64ch] text-[1.0625rem] leading-relaxed text-[var(--ink-soft)]">
              MIT licensed, with every engine in the audit path open source.
              Disagree with a finding and you can read the check that produced it.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <a
                href="https://github.com/mahirautela2020-design/able"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md bg-[var(--ink)] px-4 py-2.5 text-sm font-medium text-[var(--paper)] transition-opacity hover:opacity-88"
              >
                Source on GitHub
              </a>
              <Link
                href="/privacy"
                className="rounded-md border border-[var(--rule-strong)] px-4 py-2.5 text-sm font-medium text-[var(--ink-soft)] transition-colors hover:bg-[var(--paper-sunk)] hover:text-[var(--ink)]"
              >
                How data is handled
              </Link>
            </div>
          </div>
          <p className="max-w-[46ch] self-end text-[13px] leading-relaxed text-[var(--ink-faint)] lg:col-span-5">
            A personal portfolio project, not affiliated with any employer. Built
            on Next.js, Supabase, Inngest, Playwright and axe-core.
          </p>
        </SectionBody>
      </section>

      <Footer />
    </div>
  );
}
