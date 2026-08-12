export type Platform = "web" | "ios" | "android";

export interface ScopePage {
  url: string;
  platform: Platform;
}

export interface MobileArtifact {
  id?: string;
  auditId: string;
  platform: "android" | "ios";
  apkPath?: string;
  bundleId?: string;
  minSdk?: string;
  targetSdk?: string;
  permissions: string[];
  activities: string[];
  services: string[];
  manifestJson: Record<string, unknown>;
}

export interface CodeRepo {
  id?: string;
  auditId: string;
  repoUrl: string;
  clonePath?: string;
  branch?: string;
  commitSha?: string;
  status: "pending" | "cloning" | "cloned" | "linting" | "complete" | "failed";
  errorDetail?: string;
}
