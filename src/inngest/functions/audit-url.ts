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
import {
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
 * page is marked failed and the audit continues with the next page. */
const PAGE_SCAN_TIMEOUT_MS = 90_000;

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
  { id: "audit-url", concurrency: 1, retries: 1, triggers: [{ event: "audit/url" }] },
  async ({ event, step }) => {
    const { auditId, url } = event.data as { auditId: string; url: string };

    await step.run("crawl", async () => {
      await updateAuditStatus(auditId, "running");
      const pages = await crawl(url, MAX_PAGES);
      return { pages };
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
      await step.run(`scan-page-${i}`, async () => {
        let pageId = "";
        const telemetry = { networkidleTimedOut: false };

        // Per-page hard deadline: a pathological page (heavy JS, endless
        // network) must not stall the whole audit. On timeout we record a
        // failed page row and continue with the next page.
        const scanOutcome = await withDeadline(
          withPage(async (page) => {
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
          const keyboardResult = await runKeyboard(page);

          const allFindingsForPage = [...findings, ...keyboardResult.findings];

          // P11: AX-tree capture + deterministic checks (best-effort)
          let axTranscript: string[] = [];
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

          let srSnapshot = null;
          let srAnnouncements: Array<{ text: string; timestamp: number; source: string }> = [];
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
              evidence: { telemetry, keyboardCount: keyboardResult.focusableCount, sr: srEvidence },
              scanned_at: new Date().toISOString(),
            });

          await deleteFindingsForPage(pageId);

          const evidencePath = `${auditId}/${i}`;
          const fullScreenshotPath = `${evidencePath}-full.webp`;

          let fullScreenshotUrl: string | null = null;
          let screenshotWidth = 1440;
          let screenshotHeight = 20000;
          try {
            const webpScreenshot = await sharp(screenshot)
              .webp({ quality: 80 })
              .toBuffer();
            const metadata = await sharp(webpScreenshot).metadata();
            screenshotWidth = metadata.width || 1440;
            screenshotHeight = metadata.height || 20000;
            fullScreenshotUrl = await uploadEvidence(
              webpScreenshot,
              fullScreenshotPath
            );
          } catch {
            // Screenshot upload failed
          }

          const cropUploads: Promise<string | null>[] = [];
          for (const f of allFindingsForPage) {
            if (f.bbox) {
              const cropPath = `${evidencePath}-${f.rule_id}-${Math.random().toString(36).slice(2, 8)}.webp`;
              // sharp.extract requires integers within the image bounds —
              // bboxes are float (CSS pixels), so round + clamp everything.
              const left = Math.min(
                Math.max(0, Math.round(f.bbox.x - 30)),
                screenshotWidth - 1
              );
              const top = Math.min(
                Math.max(0, Math.round(f.bbox.y - 30)),
                screenshotHeight - 1
              );
              const width = Math.max(
                1,
                Math.min(screenshotWidth - left, Math.round(f.bbox.width + 60))
              );
              const height = Math.max(
                1,
                Math.min(screenshotHeight - top, Math.round(f.bbox.height + 60))
              );
              cropUploads.push(
                sharp(screenshot)
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

          const matrix = computeComplianceMatrix(allFindingsForPage);

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
          }),
          PAGE_SCAN_TIMEOUT_MS
        );

        // Handle per-page timeout: record the page as failed, keep going.
        if (scanOutcome === "TIMEOUT") {
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
              networkidle_timed_out: true,
              error_code: "PAGE_SCAN_TIMEOUT",
              evidence: { timeoutMs: PAGE_SCAN_TIMEOUT_MS },
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

    await step.run("build-report", async () => {
      await buildAndStoreReport(auditId);
    });

    await updateAuditStatus(auditId, "complete", {
      completed_at: new Date().toISOString(),
    });

    return { auditId, status: "complete" };
  }
);
