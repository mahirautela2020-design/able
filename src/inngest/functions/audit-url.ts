import { inngest } from "@/inngest/client";
import { withPage } from "@/engine/browser";
import { waitForPageSettle } from "@/engine/settle";
import { runAxe } from "@/engine/axe-scan";
import { runKeyboard } from "@/engine/keyboard";
import { crawl, isBotBlocked } from "@/engine/crawl";
import { computeComplianceMatrix, buildProgress } from "@/engine/normalize";
import { captureAriaSnapshot } from "@/lib/sr/snapshot";
import { captureLiveAnnouncements } from "@/lib/sr/announcer";
import { captureAxTree } from "@/engine/ax-tree";
import { runAxChecks } from "@/engine/ax-checks";
import { axTreeToTranscript } from "@/engine/sr-speech";
import { scanResponsive } from "@/engine/responsive-scan";
import { cropRectFor } from "@/engine/evidence-crop";
import { resolveModuleIds, resolveModuleGates, getModuleWcagCoverage } from "@/lib/audit-modules";
import {
  getAudit,
  updateAuditStatus,
  updateAuditProgress,
  insertAuditPage,
  deleteFindingsForPage,
  insertFindings,
  uploadEvidence,
} from "@/lib/supabase/server";
import { buildAndStoreReport } from "@/lib/report";
import sharp from "sharp";

const MAX_PAGES = parseInt(process.env.MAX_PAGES || "5", 10);

/** Hard cap per page-scan step — a single pathological page must not stall
 * the whole audit forever (koa.com hung 200s+ on one page). On timeout the
 * page is marked failed and the audit continues with the next page.
 *
 * MUST stay comfortably under the `/api/inngest` route's `maxDuration` (60s,
 * see src/app/api/inngest/route.ts) — Vercel kills the function at that wall
 * clock regardless of what our own watchdog is set to, and an uncaught
 * platform kill never runs our timeout-handling code, so the audit is left
 * stuck at status="running" forever with no failed page row and no ability
 * for onFailure/cancel to recover it. Leaves ~15s headroom for Supabase
 * writes, sharp image processing, and response serialization after the
 * scan itself returns. */
const PAGE_SCAN_TIMEOUT_MS = 35_000;

/** Same reasoning as PAGE_SCAN_TIMEOUT_MS — the crawl step (page discovery)
 * previously had no deadline at all, so a slow/JS-heavy seed page could hang
 * the "crawl" step past the platform's maxDuration with the same silent-
 * stuck-forever failure mode. */
const CRAWL_TIMEOUT_MS = 20_000;

/** Race a promise against a deadline; on expiry resolves with "TIMEOUT". */
async function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T | "TIMEOUT"> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<"TIMEOUT">((resolve) => {
        timer = setTimeout(() => resolve("TIMEOUT"), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export const auditUrl = inngest.createFunction(
  {
    id: "audit-url",
    concurrency: 1,
    retries: 1,
    triggers: [{ event: "audit/url" }],
    // Runs once all retries are exhausted (e.g. connection refused/timeout
    // mid-scan, or the worker crashing) — without this, the audit row is
    // left stuck at status="running" forever with no automatic recovery.
    onFailure: async ({ event, error }) => {
      const originalEvent = (
        event as { data?: { event?: { data?: { auditId?: string } } } }
      )?.data?.event;
      const auditId = originalEvent?.data?.auditId;
      if (!auditId) return;

      await updateAuditStatus(auditId, "failed", {
        error_code: "SCAN_FAILED",
        error_detail: error instanceof Error ? error.message : String(error),
      }).catch(() => {
        // best-effort — nothing further to do if this write also fails
      });
    },
  },
  async ({ event, step }) => {
    const { auditId, url, modules } = event.data as {
      auditId: string;
      url: string;
      modules?: string[];
    };
    // No `modules` sent (older callers, MCP) -> behaves exactly as before
    // this phase: the "standard" preset's steps all run.
    const moduleIds = resolveModuleIds(modules);
    const gates = resolveModuleGates(moduleIds);
    const coveredScIds = getModuleWcagCoverage(moduleIds);

    // Cancel guard, same family as cancel-check-${i} and cancel-check-final
    // below, but for the gap those two don't cover: a queued audit can be
    // cancelled (status -> "failed"/CANCELLED) before this function's first
    // step ever runs. Without this check, the unconditional
    // updateAuditStatus(auditId, "running") right below resurrected it —
    // confirmed live: cancel a queued audit, watch it go running -> complete
    // anyway, findings the user explicitly stopped generated and persisted
    // regardless, with the DB row left at a permanently contradictory
    // status:"complete" + error_code:"CANCELLED".
    const initialStatus = await step.run("cancel-check-initial", async () => {
      return (await getAudit(auditId)).status;
    });
    if (initialStatus !== "queued" && initialStatus !== "running") {
      return { auditId, status: initialStatus };
    }

    await step.run("crawl", async () => {
      await updateAuditStatus(auditId, "running");
      const outcome = await withDeadline(crawl(url, MAX_PAGES), CRAWL_TIMEOUT_MS);
      if (outcome === "TIMEOUT") {
        throw new Error(`CRAWL_TIMEOUT: page discovery exceeded ${CRAWL_TIMEOUT_MS}ms`);
      }
      return { pages: outcome };
    });

    const pagesStep = (await step.run("get-pages", async () => {
      const { data } = await import("@/lib/supabase/server").then((m) =>
        m.supabase
          .from("audits")
          .select("progress")
          .eq("id", auditId)
          .single()
      );
      return data?.progress || {};
    })) as Record<string, unknown>;

    const pages = (pagesStep as Record<string, unknown>)?.pages as string[] || (await step.run("re-crawl", () => crawl(url, MAX_PAGES))) as string[];

    const allFindings: unknown[] = [];

    for (const [i, pageUrl] of (pages as string[]).entries()) {
      // Cooperative cancellation: /api/audits/[id]/cancel flips the row to
      // status="failed"/error_code="CANCELLED". Check before each page so a
      // Stop takes effect within one page instead of running the whole crawl.
      const stillRunning = await step.run(`cancel-check-${i}`, async () => {
        const a = await getAudit(auditId);
        return a.status === "running";
      });
      if (!stillRunning) break;

      await step.run(`scan-page-${i}`, async () => {
        let pageId = "";
        let scanError: string | null = null;
        const telemetry = { networkidleTimedOut: false };

        // Per-page hard deadline: a pathological page (heavy JS, endless
        // network) must not stall the whole audit. On timeout we record a
        // failed page row and continue with the next page.
        const scanOutcome = await withDeadline(
          withPage(async (page) => {
            // NOTE: everything below is wrapped by the .catch() attached to
            // this withPage() call. A throw here (dead host, 404, navigation
            // timeout, a page that breaks axe) used to escape all the way to
            // Inngest, which retried once and then marked the ENTIRE audit
            // failed -- so one unreachable page in a five-page crawl meant no
            // report at all, including for the four pages that scanned fine.
            await page.goto(pageUrl, {
              waitUntil: "domcontentloaded",
              timeout: 20_000,
            });

          const title = await page.title();
          const finalUrl = page.url();

          if (isBotBlocked(title, null)) {
              pageId = await insertAuditPage({
                audit_id: auditId,
                page_url: finalUrl,
                page_title: title,
                status: "failed",
                wcag_score: null,
                axe_version: null,
                consent_dismissed: null,
                settled_at_ms: null,
                networkidle_timed_out: false,
                error_code: "BOT_BLOCKED",
                evidence: { botBlocked: true },
                scanned_at: null,
              });
            return null;
          }

          await waitForPageSettle(page, telemetry);

          const { findings, axeVersion, screenshot } = await runAxe(page);
          const keyboardResult = gates.keyboard
            ? await runKeyboard(page)
            : {
                findings: [] as typeof findings,
                focusableCount: 0,
                tabSequence: [],
                deadEndBeforeCompletion: false,
                focusTrapDetected: false,
                focusIndicatorMissing: false,
              };

          const allFindingsForPage = [...findings, ...keyboardResult.findings];

          // P11: AX-tree capture + deterministic checks (best-effort),
          // gated behind the "aria"/"screen-reader" modules — either enables it.
          let axTranscript: string[] = [];
          if (gates.axTree) {
            try {
              const axNodes = await captureAxTree(page);
              if (axNodes.length > 0) {
                const axFindings = runAxChecks(axNodes);
                allFindingsForPage.push(...axFindings);
                axTranscript = axTreeToTranscript(axNodes);
              }
            } catch {
              // AX capture is best-effort
            }
          }

          let srSnapshot = null;
          let srAnnouncements: Awaited<ReturnType<typeof captureLiveAnnouncements>> = [];
          if (gates.axTree) {
            try {
              srSnapshot = await captureAriaSnapshot(page);
            } catch {
              // SR snapshot capture is best-effort
            }
            try {
              srAnnouncements = await captureLiveAnnouncements(page);
            } catch {
              // SR announcements capture is best-effort
            }
          }

          // Responsive/reflow re-scan (WCAG 1.4.10), gated behind "responsive".
          // Runs after runAxe's screenshot capture (fixed 1440x900) since it
          // mutates the page's viewport — must not run before the screenshot.
          if (gates.responsive) {
            try {
              const responsiveFindings = await scanResponsive(page);
              allFindingsForPage.push(...responsiveFindings);
            } catch {
              // Responsive scan is best-effort
            }
          }

          const srEvidence: Record<string, unknown> = {};
          try {
            if (srSnapshot) {
              const snapshotJson = Buffer.from(JSON.stringify(srSnapshot), "utf-8");
              const snapshotPath = `evidence/sr/${auditId}/${i}/snapshot.json`;
              const snapshotUrl = await uploadEvidence(snapshotJson, snapshotPath, "application/json");
              srEvidence.srSnapshotUrl = snapshotUrl;
            }
          } catch {
            // Best-effort upload
          }
          try {
            if (srAnnouncements.length > 0) {
              const announcementsJson = Buffer.from(JSON.stringify(srAnnouncements), "utf-8");
              const announcementsPath = `evidence/sr/${auditId}/${i}/announcements.json`;
              const announcementsUrl = await uploadEvidence(announcementsJson, announcementsPath, "application/json");
              srEvidence.srAnnouncementsUrl = announcementsUrl;
              srEvidence.srAnnouncementCount = srAnnouncements.length;
            }
          } catch {
            // Best-effort upload
          }
          try {
            if (axTranscript.length > 0) {
              const transcriptJson = Buffer.from(JSON.stringify(axTranscript), "utf-8");
              const transcriptPath = `evidence/sr/${auditId}/${i}/ax-transcript.json`;
              const transcriptUrl = await uploadEvidence(transcriptJson, transcriptPath, "application/json");
              srEvidence.axTranscriptUrl = transcriptUrl;
              srEvidence.axTranscriptLineCount = axTranscript.length;
            }
          } catch {
            // Best-effort upload
          }

            pageId = await insertAuditPage({
              audit_id: auditId,
              page_url: finalUrl,
              page_title: title,
              status: "scanned",
              wcag_score: null,
              axe_version: axeVersion,
              consent_dismissed: null,
              settled_at_ms: null,
              networkidle_timed_out: telemetry.networkidleTimedOut,
              error_code: null,
              evidence: {
                telemetry,
                keyboardCount: keyboardResult.focusableCount,
                sr: srEvidence,
                screenshot: {
                  width: screenshot.width,
                  height: screenshot.height,
                  documentHeight: screenshot.documentHeight,
                  truncated: screenshot.truncated,
                },
              },
              scanned_at: new Date().toISOString(),
            });

          await deleteFindingsForPage(pageId);

          const evidencePath = `${auditId}/${i}`;
          const fullScreenshotPath = `${evidencePath}-full.webp`;

          // takeScreenshot reports the real captured size. The old code
          // hardcoded 1440x20000 as the fallback, so when the webp encode
          // threw (which it did on every page taller than 16383px) every
          // crop was clamped against dimensions the image never had.
          const screenshotWidth = screenshot.width;
          const screenshotHeight = screenshot.height;

          let fullScreenshotUrl: string | null = null;
          try {
            const webpScreenshot = await sharp(screenshot.buffer)
              .webp({ quality: 80 })
              .toBuffer();
            fullScreenshotUrl = await uploadEvidence(
              webpScreenshot,
              fullScreenshotPath
            );
          } catch {
            // Screenshot upload failed
          }

          const cropUploads: Promise<string | null>[] = [];
          for (const f of allFindingsForPage) {
            // cropRectFor returns null when the finding sits outside the
            // captured image -- see evidence-crop.ts for why that beats
            // clamping it into a plausible-looking wrong crop.
            const crop = f.bbox
              ? cropRectFor(f.bbox, screenshotWidth, screenshotHeight)
              : null;
            if (crop) {
              const { left, top, width, height } = crop;
              const cropPath = `${evidencePath}-${f.rule_id}-${Math.random().toString(36).slice(2, 8)}.webp`;
              cropUploads.push(
                // Deliberately re-decoding the PNG per crop: decoding once
                // into a raw buffer measured 2.5x faster but +46MB peak RSS
                // (a full-page raw RGB buffer), which is the wrong trade on a
                // memory-capped serverless worker. Cost is ~35ms/crop.
                sharp(screenshot.buffer)
                  .extract({ left, top, width, height })
                  .webp({ quality: 80 })
                  .toBuffer()
                  .then((buf) => uploadEvidence(buf, cropPath))
                  .catch(() => null)
              );
            } else {
              cropUploads.push(Promise.resolve(null));
            }
          }

          const cropUrls = await Promise.all(cropUploads);

          const findingRows = allFindingsForPage.map((f, idx) => ({
            audit_id: auditId,
            page_id: pageId,
            bucket: f.bucket,
            rule_id: f.rule_id,
            rule_title: f.rule_title,
            wcag_criteria: f.wcag_criteria,
            wcag_criterion: f.wcag_criterion,
            wcag_level: f.wcag_level,
            principle: f.principle,
            severity: f.severity,
            confidence: f.confidence,
            source_engines: f.source_engines,
            selector: f.selector,
            element_html: f.element_html,
            failure_summary: f.failure_summary,
            additional_instances: f.additional_instances,
            screenshot_crop_url: cropUrls[idx],
            full_screenshot_url: fullScreenshotUrl,
            recommendation: null,
            evidence: f.evidence,
            engine_version: f.engine_version,
          }));

          await insertFindings(findingRows);

          const matrix = computeComplianceMatrix(allFindingsForPage, coveredScIds);

          return {
            pageId,
            counts: {
              automated: findings.filter((f) => f.bucket === "automated").length,
              needsReview: findings.filter((f) => f.bucket === "needs_review").length,
              behavior: keyboardResult.findings.length,
              bestPractice: findings.filter((f) => f.bucket === "best-practice").length,
            },
            wcagScore: matrix.wcagScore,
          };
          }).catch((err: unknown) => {
            scanError = err instanceof Error ? err.message : String(err);
            return "SCAN_ERROR" as const;
          }),
          PAGE_SCAN_TIMEOUT_MS
        );

        // Handle per-page timeout or failure: record the page as failed and
        // keep going, so the audit still produces a report from the pages
        // that did scan.
        if (scanOutcome === "TIMEOUT" || scanOutcome === "SCAN_ERROR") {
          const timedOut = scanOutcome === "TIMEOUT";
          try {
            await insertAuditPage({
              audit_id: auditId,
              page_url: pageUrl,
              page_title: null,
              status: "failed",
              wcag_score: null,
              axe_version: null,
              consent_dismissed: null,
              settled_at_ms: null,
              networkidle_timed_out: timedOut,
              error_code: timedOut ? "PAGE_SCAN_TIMEOUT" : "PAGE_SCAN_ERROR",
              evidence: timedOut
                ? { timeoutMs: PAGE_SCAN_TIMEOUT_MS }
                : { error: scanError },
              scanned_at: null,
            });
          } catch {
            // best-effort
          }
          await updateAuditProgress(
            auditId,
            buildProgress(
              (pages as string[]).length,
              i + 1,
              pageUrl
            )
          );
          return null;
        }

        await updateAuditProgress(
          auditId,
          buildProgress(
            (pages as string[]).length,
            i + 1,
            pageUrl
          )
        );

        if (scanOutcome) {
          allFindings.push(scanOutcome);
        }

        return scanOutcome;
      });
    }

    // Final cancel guard: if the audit was stopped during the last page,
    // don't build a report or overwrite the cancelled status with "complete".
    const finalStatus = await step.run("cancel-check-final", async () => {
      return (await getAudit(auditId)).status;
    });
    if (finalStatus !== "running") {
      return { auditId, status: finalStatus };
    }

    await step.run("build-report", async () => {
      await buildAndStoreReport(auditId);
    });

    await updateAuditStatus(auditId, "complete", {
      completed_at: new Date().toISOString(),
    });

    return { auditId, status: "complete" };
  }
);
