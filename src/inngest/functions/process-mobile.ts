import { inngest } from "@/inngest/client";
import { updateAuditProgress, supabase, insertFindings } from "@/lib/supabase/server";
import { runApkLint } from "@/lib/android/apk-lint";

export const processMobile = inngest.createFunction(
  {
    id: "process-mobile",
    concurrency: 1,
    retries: 1,
    throttle: { limit: 1, period: "1s" },
    triggers: [{ event: "audit/process-mobile" }],
  },
  async ({ event, step }) => {
    const { auditId } = event.data as { auditId: string };

    await step.run("start", async () => {
      await updateAuditProgress(auditId, { mobilePhase: "started" });
      return { started: true };
    });

    const artifacts = await step.run("fetch-artifacts", async () => {
      const { data, error } = await supabase
        .from("mobile_artifacts")
        .select("*")
        .eq("audit_id", auditId)
        .eq("platform", "android");

      if (error) throw error;
      return data || [];
    });

    const allFindings: Array<Record<string, unknown>> = [];

    for (const artifact of artifacts) {
      if (!artifact.apk_path) continue;

      await step.run(`lint-apk-${artifact.id}`, async () => {
        const lintFindings = await runApkLint(artifact.apk_path);

        const findingRows = lintFindings.map((f) => ({
          audit_id: auditId,
          page_id: null,
          bucket: "automated",
          rule_id: f.rule_id,
          rule_title: f.rule_id,
          wcag_criteria: [] as string[],
          wcag_criterion: null,
          wcag_level: null,
          principle: null,
          severity: f.severity === "error" ? "serious" : "moderate",
          confidence: 0.8,
          source_engines: ["android-lint"],
          selector: null,
          element_html: null,
          failure_summary: f.message,
          additional_instances: 0,
          screenshot_crop_url: null,
          full_screenshot_url: null,
          recommendation: null,
          evidence: { file: f.file, line: f.line },
          engine_version: "aapt2",
        }));

        allFindings.push(...findingRows);
        return { findings: lintFindings.length };
      });
    }

    await step.run("save-findings", async () => {
      if (allFindings.length > 0) {
        await insertFindings(allFindings as never[]);
      }
      await updateAuditProgress(auditId, {
        mobilePhase: "complete",
        mobileFindings: allFindings.length,
      });
      return { totalFindings: allFindings.length };
    });

    return { auditId, totalFindings: allFindings.length };
  }
);
