export interface IosManifest {
  bundleId?: string;
  bundleName?: string;
  version?: string;
  build?: string;
  minimumOsVersion?: string;
  supportedPlatforms: string[];
  capabilities: string[];
  raw: Record<string, unknown>;
}

export function parseIpaManifest(_filePath: string): IosManifest | null {
  console.warn("BLOCKER-IF-ABSENT: iOS IPA parsing requires 7zip and bplist-parser. Returning stub.");
  return null;
}

export function parseIpaManifestStub(): IosManifest {
  return {
    supportedPlatforms: [],
    capabilities: [],
    raw: { stub: true, note: "iOS IPA parsing not yet implemented — requires 7zip + bplist-parser" },
  };
}
