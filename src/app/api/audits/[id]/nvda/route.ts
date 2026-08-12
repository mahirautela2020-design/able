import { withPage } from "@/engine/browser";
import { sanitizeUrl, validateHost } from "@/engine/crawl";
import { runKeyboard } from "@/engine/keyboard";
import { waitForPageSettle } from "@/engine/settle";
import { detectNvda, NvdaDriver } from "@/lib/sr/nvda-driver";
import { captureNvdaAnnouncements } from "@/lib/sr/nvda-snapshot";
import { runNvdaChecks } from "@/lib/sr/nvda-checks";
import { getAudit } from "@/lib/supabase/server";
import { requireSession } from "@/lib/supabase/session";

// Single-instance NVDA guard: concurrent runs collide on the named pipe
// (RISKS §7). In-process mutex keyed by audit id; fleet-level control is out
// of scope for a local-only feature.
const inFlight = new Map<string, Promise<Response>>();

/**
 * POST /api/audits/[id]/nvda — drive a local NVDA run against the audited page.
 *
 * Local-only by design: NVDA is a Windows named-pipe service, so on non-Windows
 * / serverless this returns HTTP 200 `{ available: false }` (a documented
 * limitation, not an error — P7 §29, RISKS §2). Auth-gated like the other
 * run/scan routes.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;

  // Availability first — cheap, and the common (non-Windows) path exits here.
  const detected = detectNvda();
  if (!detected.available) {
    return Response.json({
      available: false,
      reason: detected.reason,
      announcements: [],
      silentElements: [],
      suggestions: [],
    });
  }

  // Serialize per-audit so a hung NVDA run can't stack concurrent pipe writes.
  const existing = inFlight.get(id);
  if (existing) return existing;

  const run = (async (): Promise<Response> => {
    try {
      let audit;
      try {
        audit = await getAudit(id);
      } catch {
        return Response.json({ error: "Audit not found" }, { status: 404 });
      }

      // The target was already SSRF-validated at creation; re-validate before
      // launching a local browser against it (standing guardrail: SSRF guard).
      const sanitized = sanitizeUrl(audit.target_url);
      if (!sanitized) {
        return Response.json({ error: "Invalid target URL" }, { status: 400 });
      }
      try {
        await validateHost(sanitized.hostname);
      } catch (e) {
        return Response.json(
          { error: `URL rejected: ${(e as Error).message}` },
          { status: 400 }
        );
      }

      const driver = new NvdaDriver(detected.path);

      const result = await withPage(async (page) => {
        await page.goto(sanitized.href, {
          waitUntil: "domcontentloaded",
          timeout: 20_000,
        });
        await waitForPageSettle(page, { networkidleTimedOut: false });

        const snapshot = await captureNvdaAnnouncements(page, { driver });

        // Real focus order (P2 keyboard.ts) — used to diff NVDA's announcement
        // order against the DOM tab order (P7 §21, §26).
        let tabOrder: string[] = [];
        try {
          const keyboard = await runKeyboard(page);
          tabOrder = keyboard.tabSequence.map((s) => s.selector);
        } catch {
          // best-effort — focus-order comparison degrades to a no-op
        }

        return { snapshot, tabOrder };
      });

      const checks = runNvdaChecks(result.snapshot.announcements, result.tabOrder);

      return Response.json({
        available: result.snapshot.available,
        announcements: result.snapshot.announcements,
        ...checks,
      });
    } catch (e) {
      console.error("POST /api/audits/[id]/nvda error:", e);
      return Response.json(
        { error: "NVDA run failed", available: false, announcements: [] },
        { status: 500 }
      );
    } finally {
      inFlight.delete(id);
    }
  })();

  inFlight.set(id, run);
  return run;
}
