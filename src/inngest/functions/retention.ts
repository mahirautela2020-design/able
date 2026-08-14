import { inngest } from "@/inngest/client";
import { cleanupExpiredData, failStaleRunningAudits } from "@/lib/supabase/server";

/**
 * Retention cron — runs daily, enforces the 24-hour TTL:
 *  - audits older than AUDIT_RETENTION_HOURS (default 24) are deleted
 *    together with their findings, pages, and evidence storage
 *  - Figma authorizations older than FIGMA_TOKEN_TTL_HOURS (default 24)
 *    are revoked (deleted), so an authorized token can never outlive a day
 *
 * This is the answer to "what if somebody authorises Figma and their data
 * lingers": every artifact self-destructs within 24h unless the user
 * returns and creates fresh ones.
 */
export const retention = inngest.createFunction(
  {
    id: "retention-cleanup",
    retries: 2,
    triggers: [{ cron: "0 2 * * *" }], // 02:00 UTC daily
  },
  async ({ step }) => {
    const result = await step.run("cleanup-expired", async () =>
      cleanupExpiredData()
    );

    // System-wide sweep for audits stuck at status="running" that nobody's
    // workbench tab is actively polling (the GET /api/audits/[id] route
    // handles the actively-polled case on every request).
    const staleAuditIds = await step.run("fail-stale-running", async () =>
      failStaleRunningAudits()
    );

    await step.run("log-cleanup", async () => {
      console.log(
        `[retention] audits deleted: ${result.auditsDeleted}, figma connections revoked: ${result.connectionsDeleted}, stale audits failed: ${staleAuditIds.length}`
      );
      return result;
    });

    return { ...result, staleAuditsFailed: staleAuditIds.length };
  }
);
