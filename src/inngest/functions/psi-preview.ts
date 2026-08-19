import { inngest } from "@/inngest/client";
import { fetchFastPreview } from "@/lib/psi";
import { updateAuditFastPreview } from "@/lib/supabase/server";

/**
 * Fast PSI (Lighthouse-via-Google) accessibility preview -- runs alongside
 * the main audit-url pipeline, never gating or gated by it. Deliberately
 * has NO concurrency limit shared with auditUrl (see audit-url.ts's
 * concurrency:1) so a stuck full audit can never block this, and vice
 * versa. Best-effort only: no retries, and every failure path just writes
 * `error` into fast_preview rather than throwing -- a missing/quota'd key
 * must never affect the real audit.
 */
export const psiPreview = inngest.createFunction(
  {
    id: "psi-preview",
    concurrency: 5,
    retries: 0,
    triggers: [{ event: "audit/psi-preview" }],
  },
  async ({ event, step }) => {
    const { auditId, url } = event.data as { auditId: string; url: string };

    await step.run("fetch-preview", async () => {
      const preview = await fetchFastPreview(url);
      await updateAuditFastPreview(auditId, preview);
      return preview;
    });

    return { auditId };
  }
);
