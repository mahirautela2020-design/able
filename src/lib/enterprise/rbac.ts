export const ORG_ROLES = ["owner", "admin", "auditor", "viewer"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const PERMISSIONS = {
  "org:manage": ["owner"],
  "org:read": ["owner", "admin", "auditor", "viewer"],
  "audit:write": ["owner", "admin", "auditor"],
  "audit:read": ["owner", "admin", "auditor", "viewer"],
  "report:read": ["owner", "admin", "auditor", "viewer"],
  "report:export": ["owner", "admin", "auditor"],
  "evidence:read": ["owner", "admin", "auditor", "viewer"],
  "evidence:upload": ["owner", "admin", "auditor"],
  "apikey:manage": ["owner"],
  "member:manage": ["owner", "admin"],
  "settings:write": ["owner", "admin"],
  "settings:read": ["owner", "admin", "auditor", "viewer"],
  "mcp:access": ["owner", "admin"],
} as const;

export type Permission = keyof typeof PERMISSIONS;

const ROLE_HIERARCHY: Record<OrgRole, number> = {
  owner: 4,
  admin: 3,
  auditor: 2,
  viewer: 1,
};

export function hasPermission(role: OrgRole, permission: string): boolean {
  if (!(permission in PERMISSIONS)) {
    return false;
  }
  const allowedRoles = PERMISSIONS[permission as Permission] as readonly string[];
  return allowedRoles.includes(role);
}

export function isRoleAtLeast(role: OrgRole, minimum: OrgRole): boolean {
  return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[minimum];
}

export function getRolePermissions(role: OrgRole): Permission[] {
  return (Object.keys(PERMISSIONS) as Permission[])
    .filter((p) => hasPermission(role, p))
    .sort();
}

export function isValidRole(role: string): role is OrgRole {
  return ORG_ROLES.includes(role as OrgRole);
}
