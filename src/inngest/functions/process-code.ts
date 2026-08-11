import { inngest } from "@/inngest/client";
import { updateAuditProgress, supabase, insertFindings } from "@/lib/supabase/server";
import { cloneRepo, cleanupClone, validateSandboxPath } from "@/lib/git/clone";
import { runCodeLint } from "@/lib/code/lint-runner";

export const processCode = inngest.createFunction(
  {
    id: "process-code",
    concurrency: 1,
    retries: 1,
    throttle: { limit: 1, period: "1s" },
    triggers: [{ event: "audit/process-code" }],
  },
  async ({ event, step }) => {
    const { auditId, repoUrl } = event.data as { auditId: string; repoUrl: string };

    await step.run("start", async () => {
      await updateAuditProgress(auditId, { codePhase: "started" });
      return { started: true };
    });

    let clonePath = "";
    let commitSha = "";

    await step.run("clone", async () => {
      await updateAuditProgress(auditId, { codePhase: "cloning" });

      const { data: existingRepos } = await supabase
        .from("code_repos")
        .select("id")
        .eq("audit_id", auditId)
        .limit(1);

      if (existingRepos && existingRepos.length > 0) {
        await supabase
          .from("code_repos")
          .update({ status: "cloning" })
          .eq("audit_id", auditId);
      }

      const result = await cloneRepo(repoUrl, auditId);
      clonePath = result.clonePath;
      commitSha = result.commitSha;

      if (existingRepos && existingRepos.length > 0) {
        await supabase
          .from("code_repos")
          .update({
            clone_path: clonePath,
            branch: result.branch,
            commit_sha: commitSha,
            status: "cloned",
          })
          .eq("audit_id", auditId);
      } else {
        await supabase
          .from("code_repos")
          .insert({
            audit_id: auditId,
            repo_url: repoUrl,
            clone_path: clonePath,
            branch: result.branch,
            commit_sha: commitSha,
            status: "cloned",
          });
      }

      return { clonePath, commitSha };
    });

    let totalFindings = 0;

    await step.run("lint", async () => {
      validateSandboxPath(clonePath);

      await updateAuditProgress(auditId, { codePhase: "linting" });

      const lintFindings = await runCodeLint(clonePath);

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
        source_engines: ["code-lint"],
        selector: null,
        element_html: null,
        failure_summary: f.message,
        additional_instances: 0,
        screenshot_crop_url: null,
        full_screenshot_url: null,
        recommendation: null,
        evidence: { file: f.file, line: f.line },
        engine_version: "eslint+axe-core",
      }));

      if (findingRows.length > 0) {
        await insertFindings(findingRows as never[]);
      }

      totalFindings = findingRows.length;

      await supabase
        .from("code_repos")
        .update({ status: "complete" })
        .eq("audit_id", auditId);

      return { totalFindings };
    });

    await step.run("cleanup", async () => {
      cleanupClone(clonePath);
      await updateAuditProgress(auditId, {
        codePhase: "complete",
        codeFindings: totalFindings,
      });
      return { cleaned: true };
    });

    return { auditId, totalFindings };
  }
);
