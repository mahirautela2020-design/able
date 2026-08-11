import { requireEnterpriseAuth } from "@/lib/enterprise/auth";
import { issueApiKey, revokeApiKey, listApiKeys } from "@/lib/enterprise/apikeys";
import { recordAuditLog } from "@/lib/enterprise/ratelimit";

export async function GET(request: Request) {
  const auth = await requireEnterpriseAuth(request, {
    requiredPermission: "apikey:manage",
  });
  if (auth.response) return auth.response;

  try {
    const keys = await listApiKeys(auth.session.orgId);
    return Response.json(keys);
  } catch (e) {
    console.error("GET /api/enterprise/keys error:", e);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireEnterpriseAuth(request, {
    requiredPermission: "apikey:manage",
  });
  if (auth.response) return auth.response;

  try {
    const body = await request.json();
    const { name, role, expiresInDays } = body;

    if (!name || typeof name !== "string") {
      return Response.json({ error: "name is required" }, { status: 400 });
    }

    if (!role || !["owner", "admin", "auditor", "viewer"].includes(role)) {
      return Response.json({ error: "valid role is required" }, { status: 400 });
    }

    const key = await issueApiKey(
      auth.session.orgId,
      auth.session.userId,
      name,
      role,
      expiresInDays
    );

    await recordAuditLog({
      actor: auth.session.userId,
      action: "apikey:issue",
      target: key.id,
      orgId: auth.session.orgId,
    });

    return Response.json(key, { status: 201 });
  } catch (e) {
    console.error("POST /api/enterprise/keys error:", e);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireEnterpriseAuth(request, {
    requiredPermission: "apikey:manage",
  });
  if (auth.response) return auth.response;

  try {
    const { keyId } = await request.json();

    if (!keyId || typeof keyId !== "string") {
      return Response.json({ error: "keyId is required" }, { status: 400 });
    }

    await revokeApiKey(keyId);

    await recordAuditLog({
      actor: auth.session.userId,
      action: "apikey:revoke",
      target: keyId,
      orgId: auth.session.orgId,
    });

    return Response.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/enterprise/keys error:", e);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
