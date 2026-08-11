const PRIVATE_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^198\.1[89]\./,
];

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "169.254.169.254",
]);

export function sanitizeUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:" && url.protocol !== "git+ssh:") {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

export async function validateHost(hostname: string): Promise<void> {
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new Error(`SSRF_BLOCKED: ${hostname}`);
  }

  try {
    const { lookup } = await import("node:dns");
    const addresses = await new Promise<string[]>((resolve, reject) => {
      lookup(hostname, { all: true }, (err, addrs) =>
        err ? reject(err) : resolve(addrs.map((a) => a.address))
      );
    });
    if (addresses.length === 0) {
      throw new Error(`DNS_RESOLVE_FAILED: ${hostname}`);
    }
    for (const addr of addresses) {
      if (isPrivateIp(addr)) {
        throw new Error(`SSRF_BLOCKED: ${hostname} -> ${addr}`);
      }
    }
  } catch (e: unknown) {
    if (e instanceof Error && e.message.startsWith("SSRF_BLOCKED")) {
      throw e;
    }
    throw new Error(`DNS_RESOLVE_FAILED: ${hostname}`);
  }
}

export function validateHostSync(hostname: string): void {
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new Error(`SSRF_BLOCKED: ${hostname}`);
  }
  if (isPrivateIp(hostname)) {
    throw new Error(`SSRF_BLOCKED: ${hostname} is private IP`);
  }
}

export function validateGitHost(hostname: string): void {
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new Error(`SSRF_BLOCKED: ${hostname}`);
  }
  if (isPrivateIp(hostname)) {
    throw new Error(`SSRF_BLOCKED: ${hostname} is private IP`);
  }
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.startsWith("169.254.") ||
    hostname.startsWith("10.") ||
    hostname.startsWith("192.168.") ||
    hostname.match(/^172\.(1[6-9]|2\d|3[01])\./)
  ) {
    throw new Error(`SSRF_BLOCKED: ${hostname} is private/local`);
  }
}

export function validateGitUrl(raw: string): string {
  const url = parseGitUrl(raw);
  if (!url) {
    throw new Error(`SSRF_BLOCKED: invalid git URL`);
  }
  validateGitHost(url.hostname);
  return raw;
}

export function parseGitUrl(raw: string): URL | null {
  if (raw.startsWith("file://")) return null;

  if (raw.startsWith("git@")) {
    const match = raw.match(/^git@([^:]+):/);
    if (!match) return null;
    try {
      return new URL(`https://${match[1]}`);
    } catch {
      return null;
    }
  }

  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function isPrivateIp(ip: string): boolean {
  if (ip === "169.254.169.254") return true;
  for (const range of PRIVATE_RANGES) {
    if (range.test(ip)) return true;
  }
  return false;
}
