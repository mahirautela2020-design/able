import { supabase } from "@/lib/supabase/server";

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, TokenBucket>();
const DEFAULT_RATE = 60;
const DEFAULT_WINDOW_MS = 60_000;

export function checkRateLimit(
  key: string,
  maxRequests: number = DEFAULT_RATE,
  windowMs: number = DEFAULT_WINDOW_MS
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket) {
    bucket = { tokens: maxRequests, lastRefill: now };
    buckets.set(key, bucket);
  }

  const elapsed = now - bucket.lastRefill;
  const refillTokens = (elapsed / windowMs) * maxRequests;
  bucket.tokens = Math.min(maxRequests, bucket.tokens + refillTokens);
  bucket.lastRefill = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return {
      allowed: true,
      remaining: Math.floor(bucket.tokens),
      resetAt: now + windowMs,
    };
  }

  return {
    allowed: false,
    remaining: 0,
    resetAt: bucket.lastRefill + windowMs,
  };
}

export function resetRateLimit(key: string): void {
  buckets.delete(key);
}

export function clearAllRateLimits(): void {
  buckets.clear();
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 100;

export async function recordAuditLog(entry: {
  actor: string;
  action: string;
  target: string;
  orgId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const { error } = await supabase.from("audit_log").insert({
        actor: entry.actor,
        action: entry.action,
        target: entry.target,
        org_id: entry.orgId || null,
        metadata: entry.metadata || {},
      });

      if (!error) return;
      lastError = error;
    } catch (e) {
      lastError = e;
    }

    if (attempt < MAX_RETRIES - 1) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }

  console.error("audit_log insert failed after retries:", lastError);
}
