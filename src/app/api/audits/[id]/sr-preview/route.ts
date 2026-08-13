import { getAudit } from "@/lib/supabase/server";
import { requireSession } from "@/lib/supabase/session";
import { createClient } from "@supabase/supabase-js";

function getClientIp(request: Request): string | null {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Auth: same pattern as /api/audits/[id]/report (R5 mitigation)
    const auth = await requireSession(request);
    if (!auth.ok) {
      const auditRow = await getAudit(id);
      const reqIp = getClientIp(request);
      if (!reqIp || auditRow.created_ip !== reqIp) {
        return Response.json(
          { error: "Missing or invalid authorization header" },
          { status: 401 }
        );
      }
    }

    // Fetch the AX transcript evidence for page 0
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return Response.json({ lines: [], error: "Storage not configured" });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const transcriptPath = `evidence/sr/${id}/0/ax-transcript.json`;

    const { data, error } = await supabase.storage
      .from("evidence")
      .download(transcriptPath.replace(/^evidence\//, ""));

    if (error || !data) {
      return Response.json({ lines: [] });
    }

    const text = await data.text();
    const lines = JSON.parse(text) as string[];

    return Response.json({ lines });
  } catch {
    return Response.json(
      { error: "SR preview not available" },
      { status: 404 }
    );
  }
}
