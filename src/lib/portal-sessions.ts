export type AuthMethod = "basic" | "cookie" | "header" | "sso-oidc" | "sso-saml";

export interface PortalSession {
  id: string;
  name: string;
  targetUrl: string;
  authMethod: AuthMethod;
  loginUrl?: string;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  credentials?: {
    usernameSelector?: string;
    passwordSelector?: string;
    submitSelector?: string;
  };
  createdAt: string;
  lastUsedAt?: string;
}

export const AUTH_METHOD_LABELS: Record<AuthMethod, string> = {
  basic: "Basic Auth (username/password)",
  cookie: "Cookie (paste from browser)",
  header: "Custom Header (e.g., API token)",
  "sso-oidc": "SSO — OpenID Connect",
  "sso-saml": "SSO — SAML",
};

export function generateSessionId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "sess_";
  for (let i = 0; i < 16; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

export function isAuthMethod(value: string): value is AuthMethod {
  return ["basic", "cookie", "header", "sso-oidc", "sso-saml"].includes(value);
}
