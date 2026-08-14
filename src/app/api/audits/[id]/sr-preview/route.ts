import { getAudit } from "@/lib/supabase/server";
import { requireSession } from "@/lib/supabase/session";
import { getClientIp } from "@/lib/http";
import { createClient } from "@supabase/supabase-js";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Owner-scoped auth: same real ownership check as /api/audits/[id]/report
    // and /api/audits/[id]/contrast-finding — a valid session alone is not
    // enough, it must belong to THIS audit's owner (or, for anonymous
    // owners, match the creator IP). Missing audit and not-owner get the
    // same 401 to avoid ID-enumeration.
    let auditRow: Awaited<ReturnType<typeof getAudit>> | null = null;
    try {
      auditRow = await getAudit(id);
    } catch {
      auditRow = null;
    }
    if (!auditRow) {
      return Response.json(
        { error: "Missing or invalid authorization header" },
        { status: 401 }
      );
    }

    const auth = await requireSession(request);
    const reqIp = getClientIp(request);
    const isOwner = auth.ok
      ? auditRow.created_by
        ? auditRow.created_by === auth.userId
        : !!reqIp && auditRow.created_ip === reqIp
      : !!reqIp && auditRow.created_ip === reqIp;
    if (!isOwner) {
      return Response.json(
        { error: "Missing or invalid authorization header" },
        { status: 401 }
      );
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
