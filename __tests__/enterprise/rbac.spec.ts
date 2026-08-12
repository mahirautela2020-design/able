import { describe, it, expect } from "vitest";
import {
  hasPermission,
  isRoleAtLeast,
  getRolePermissions,
  isValidRole,
  type OrgRole,
  type Permission,
  PERMISSIONS,
} from "@/lib/enterprise/rbac";

describe("rbac", () => {
  describe("hasPermission", () => {
    it("owner has all permissions", () => {
      for (const perm of Object.keys(PERMISSIONS)) {
        expect(hasPermission("owner", perm)).toBe(true);
      }
    });

    it("admin can write audits and read reports", () => {
      expect(hasPermission("admin", "audit:write")).toBe(true);
      expect(hasPermission("admin", "report:read")).toBe(true);
      expect(hasPermission("admin", "audit:read")).toBe(true);
    });

    it("admin cannot manage org", () => {
      expect(hasPermission("admin", "org:manage")).toBe(false);
      expect(hasPermission("admin", "apikey:manage")).toBe(false);
    });

    it("auditor can write audits and read reports", () => {
      expect(hasPermission("auditor", "audit:write")).toBe(true);
      expect(hasPermission("auditor", "audit:read")).toBe(true);
      expect(hasPermission("auditor", "report:read")).toBe(true);
    });

    it("auditor cannot manage org or members", () => {
      expect(hasPermission("auditor", "org:manage")).toBe(false);
      expect(hasPermission("auditor", "member:manage")).toBe(false);
      expect(hasPermission("auditor", "apikey:manage")).toBe(false);
    });

    it("viewer can only read", () => {
      expect(hasPermission("viewer", "audit:read")).toBe(true);
      expect(hasPermission("viewer", "report:read")).toBe(true);
      expect(hasPermission("viewer", "evidence:read")).toBe(true);
      expect(hasPermission("viewer", "settings:read")).toBe(true);
      expect(hasPermission("viewer", "org:read")).toBe(true);
    });

    it("viewer cannot write anything", () => {
      expect(hasPermission("viewer", "audit:write")).toBe(false);
      expect(hasPermission("viewer", "report:export")).toBe(false);
      expect(hasPermission("viewer", "evidence:upload")).toBe(false);
      expect(hasPermission("viewer", "apikey:manage")).toBe(false);
      expect(hasPermission("viewer", "member:manage")).toBe(false);
      expect(hasPermission("viewer", "settings:write")).toBe(false);
      expect(hasPermission("viewer", "mcp:access")).toBe(false);
    });

    it("denies by default for unknown permissions", () => {
      expect(hasPermission("owner", "unknown:action" as string)).toBe(false);
      expect(hasPermission("admin", "unknown:action" as string)).toBe(false);
    });

    it("each role matches permission matrix", () => {
      const expectedPermissions: Record<OrgRole, Permission[]> = {
        owner: Object.keys(PERMISSIONS) as Permission[],
        admin: [
          "org:read", "audit:write", "audit:read", "report:read",
          "report:export", "evidence:read", "evidence:upload",
          "member:manage", "settings:write", "settings:read", "mcp:access",
        ],
        auditor: [
          "org:read", "audit:write", "audit:read", "report:read",
          "report:export", "evidence:read", "evidence:upload",
          "settings:read",
        ],
        viewer: [
          "org:read", "audit:read", "report:read", "evidence:read", "settings:read",
        ],
      };

      for (const [role, expected] of Object.entries(expectedPermissions)) {
        const actual = getRolePermissions(role as OrgRole);
        expect(actual.sort()).toEqual(expected.sort());
      }
    });
  });

  describe("isRoleAtLeast", () => {
    it("owner >= all roles", () => {
      expect(isRoleAtLeast("owner", "owner")).toBe(true);
      expect(isRoleAtLeast("owner", "admin")).toBe(true);
      expect(isRoleAtLeast("owner", "auditor")).toBe(true);
      expect(isRoleAtLeast("owner", "viewer")).toBe(true);
    });

    it("admin >= admin, auditor, viewer but not owner", () => {
      expect(isRoleAtLeast("admin", "owner")).toBe(false);
      expect(isRoleAtLeast("admin", "admin")).toBe(true);
      expect(isRoleAtLeast("admin", "auditor")).toBe(true);
      expect(isRoleAtLeast("admin", "viewer")).toBe(true);
    });

    it("viewer only >= viewer", () => {
      expect(isRoleAtLeast("viewer", "owner")).toBe(false);
      expect(isRoleAtLeast("viewer", "admin")).toBe(false);
      expect(isRoleAtLeast("viewer", "auditor")).toBe(false);
      expect(isRoleAtLeast("viewer", "viewer")).toBe(true);
    });
  });

  describe("isValidRole", () => {
    it("validates known roles", () => {
      expect(isValidRole("owner")).toBe(true);
      expect(isValidRole("admin")).toBe(true);
      expect(isValidRole("auditor")).toBe(true);
      expect(isValidRole("viewer")).toBe(true);
    });

    it("rejects unknown roles", () => {
      expect(isValidRole("superadmin")).toBe(false);
      expect(isValidRole("")).toBe(false);
      expect(isValidRole("guest")).toBe(false);
    });
  });

  describe("getRolePermissions", () => {
    it("returns sorted list for each role", () => {
      const perms = getRolePermissions("viewer");
      expect(perms).toEqual(perms.slice().sort());
    });
  });
});
