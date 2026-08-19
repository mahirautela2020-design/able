import "server-only";

/**
 * Fast accessibility preview via Google PageSpeed Insights (PSI), which runs
 * Lighthouse server-side on Google's infrastructure. This is deliberately a
 * PREVIEW, not a replacement for the main axe+Playwright pipeline: it uses
 * the same underlying rule engine (Lighthouse's accessibility category
 * wraps axe-core, same as we do), but skips everything this app adds on top
 * -- keyboard walkthrough, AX-tree/SR simulation, responsive re-scan,
 * contrast lab. Its value is speed (Google's servers, not ours) and a free
 * screenshot, shown while the full audit is still running.
 *
 * Never throws -- a missing key, quota error, or network failure just means
 * no fast preview; the main pipeline is unaffected either way.
 */

const PSI_BASE = "https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed";

export interface FastPreviewIssue {
  id: string;
  title: string;
  description: string;
}

export interface FastPreview {
  score: number | null; // 0-100
  screenshot: string | null; // data: URI (jpeg)
  issues: FastPreviewIssue[];
  fetchedAt: string;
  error: string | null;
}

interface LighthouseAudit {
  id?: string;
  title?: string;
  description?: string;
  score?: number | null;
  scoreDisplayMode?: string;
  details?: { data?: string };
}

interface LighthouseResult {
  categories?: { accessibility?: { score?: number | null } };
  audits?: Record<string, LighthouseAudit>;
}

export async function fetchFastPreview(url: string): Promise<FastPreview> {
  const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY;
  const empty: FastPreview = {
    score: null,
    screenshot: null,
    issues: [],
    fetchedAt: new Date().toISOString(),
    error: null,
  };

  if (!apiKey) {
    return { ...empty, error: "No GOOGLE_PAGESPEED_API_KEY configured" };
  }

  try {
    // PERFORMANCE is requested alongside ACCESSIBILITY solely because PSI
    // only includes the final-screenshot audit when a category that runs
    // the full trace (performance) is present -- accessibility-only
    // responses omit it.
    const params = new URLSearchParams({ url, key: apiKey });
    params.append("category", "ACCESSIBILITY");
    params.append("category", "PERFORMANCE");

    const res = await fetch(`${PSI_BASE}?${params.toString()}`, {
      signal: AbortSignal.timeout(45_000),
    });

    if (!res.ok) {
      return { ...empty, error: `PSI API error ${res.status}` };
    }

    const data = (await res.json()) as { lighthouseResult?: LighthouseResult };
    const lr = data.lighthouseResult;
    if (!lr) {
      return { ...empty, error: "PSI response missing lighthouseResult" };
    }

    const scoreRaw = lr.categories?.accessibility?.score;
    const score = typeof scoreRaw === "number" ? Math.round(scoreRaw * 100) : null;

    const audits = lr.audits ?? {};
    const screenshot = audits["final-screenshot"]?.details?.data ?? null;

    // Failed accessibility checks: binary-scored audits (pass/fail, not a
    // numeric sub-score) with score !== 1, sorted worst-first, capped to a
    // short list -- this is a preview, not the full findings table.
    const issues: FastPreviewIssue[] = Object.values(audits)
      .filter(
        (a) =>
          a.scoreDisplayMode === "binary" &&
          typeof a.score === "number" &&
          a.score < 1 &&
          typeof a.id === "string" &&
          typeof a.title === "string"
      )
      .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
      .slice(0, 8)
      .map((a) => ({
        id: a.id!,
        title: a.title!,
        description: (a.description ?? "").replace(/\[.*?\]\(.*?\)/g, "").trim(),
      }));

    return {
      score,
      screenshot: screenshot ? `data:image/jpeg;base64,${screenshot.split(",").pop()}` : null,
      issues,
      fetchedAt: new Date().toISOString(),
      error: null,
    };
  } catch (e) {
    return { ...empty, error: (e as Error).message };
  }
}
