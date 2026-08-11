import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { auditUrl } from "@/inngest/functions/audit-url";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [auditUrl],
});

export const maxDuration = 60;
export const runtime = "nodejs";
export const memory = 3008;
