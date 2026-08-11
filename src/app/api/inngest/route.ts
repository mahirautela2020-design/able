import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { functions } from "@/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});

export const maxDuration = 60;
export const runtime = "nodejs";
export const memory = 3008;
