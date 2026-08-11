import { supabase } from "@/lib/supabase/server";
import { hasPermission, type OrgRole } from "@/lib/enterprise/rbac";

export interface EnterpriseSession {
  userId: string;
  orgId: string;
  role: OrgRole;
  membershipStatus: "active" | "invited" | "suspended";
}

interface AuthResult {
  session: EnterpriseSession | null;
  error?: { status: number; message: string };
}

interface SupabaseUser {
  id: string;
  app_metadata?: Record<string, unknown>;
}

interface SupabaseClientLike {
  auth: {
    getUser: (token: string) => Promise<{
      data: { user: SupabaseUser | null };
      error: unknown;
    }>;
  };
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          single: () => Promise<{ data: { role: string; status: string } | null; error: unknown }>;
        };
      };
    };
  };
}

async function getEnterpriseSession(
  request: Request,
  client: SupabaseClientLike
): Promise<AuthResult> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return {
      session: null,
      error: { status: 401, message: "Missing or invalid authorization header" },
    };
  }

  const token = authHeader.slice(7);
  if (!token) {
    return {
      session: null,
      error: { status: 401, message: "Empty token" },
    };
  }

  try {
    const resp = await client.auth.getUser(token);
    const user = resp?.data?.user;
    const userError = resp?.error;

    if (userError || !user) {
      return {
        session: null,
        error: { status: 401, message: "Invalid or expired session" },
      };
    }

    const appMeta = user.app_metadata || {};
    const orgId = appMeta.org_id as string | undefined;
    if (!orgId) {
      return {
        session: null,
        error: { status: 403, message: "No organization membership" },
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const membershipResp = await (client as any)
      .from("org_memberships")
      .select("role, status")
      .eq("user_id", user.id)
      .eq("org_id", orgId)
      .single();

    const membership = membershipResp?.data as { role: string; status: string } | null;

    if (!membership) {
      return {
        session: null,
        error: { status: 403, message: "Not a member of this organization" },
      };
    }

    if (membership.status === "suspended") {
      return {
        session: null,
        error: { status: 403, message: "Organization access suspended" },
      };
    }

    if (membership.status === "invited") {
      return {
        session: null,
        error: { status: 403, message: "Invitation not yet accepted" },
      };
    }

    return {
      session: {
        userId: user.id,
        orgId,
        role: membership.role as OrgRole,
        membershipStatus: membership.status as "active",
      },
    };
  } catch {
    return {
      session: null,
      error: { status: 401, message: "Authentication failed" },
    };
  }
}

async function getApiKeySession(request: Request): Promise<AuthResult> {
  const apiKey = request.headers.get("x-api-key");
  if (!apiKey) {
    return { session: null };
  }

  try {
    const { verifyApiKey } = await import("@/lib/enterprise/apikeys");
    const keyData = await verifyApiKey(apiKey);
    if (!keyData) {
      return {
        session: null,
        error: { status: 401, message: "Invalid or expired API key" },
      };
    }

    return {
      session: {
        userId: keyData.created_by,
        orgId: keyData.org_id,
        role: keyData.role as OrgRole,
        membershipStatus: "active",
      },
    };
  } catch {
    return {
      session: null,
      error: { status: 401, message: "API key validation failed" },
    };
  }
}

export interface EnterpriseAuthOptions {
  requiredPermission?: string;
  requireUserAuth?: boolean;
}

export async function requireEnterpriseAuth(
  request: Request,
  options: EnterpriseAuthOptions = {},
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: SupabaseClientLike | any = supabase
) {
  let result = await getEnterpriseSession(request, client);

  // Only fall through to API key if Bearer auth wasn't attempted (401 = missing/invalid token).
  // If Bearer auth succeeded but org check failed (403), return that immediately.
  if (!result.session && result.error?.status !== 403 && options.requireUserAuth !== false) {
    const apiKeyResult = await getApiKeySession(request);
    if (apiKeyResult.session) {
      result = apiKeyResult;
    }
  }

  if (!result.session || result.error) {
    return {
      response: Response.json(
        { error: result.error?.message || "Unauthorized" },
        { status: result.error?.status || 401 }
      ),
    };
  }

  if (options.requiredPermission) {
    if (!hasPermission(result.session.role, options.requiredPermission)) {
      return {
        response: Response.json(
          { error: "Insufficient permissions" },
          { status: 403 }
        ),
      };
    }
  }

  return { session: result.session };
}
