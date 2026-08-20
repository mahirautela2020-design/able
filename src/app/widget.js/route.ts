export const runtime = "nodejs";
export const dynamic = "force-static";

import { ACCESSIBILITY_WIDGET_SCRIPT } from "@/lib/widget/accessibility-widget-script";

export async function GET() {
  return new Response(ACCESSIBILITY_WIDGET_SCRIPT, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      // Long cache -- the script is versionless/immutable per deploy; a new
      // deploy gets a new Vercel edge cache automatically.
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
