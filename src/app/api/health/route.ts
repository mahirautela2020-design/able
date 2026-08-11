import { supabase } from "@/lib/supabase/server";

export async function GET() {
  try {
    await supabase.from("audits").select("id").limit(1);
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "degraded" }, { status: 500 });
  }
}
