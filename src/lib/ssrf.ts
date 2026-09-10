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
  // IPv6 literals arrive bracketed from URL.hostname ("[::1]") and
  // unbracketed from dns.lookup()'s resolved addresses ("::1") -- strip
  // brackets and route to the IPv6 matcher whenever a colon is present, so
  // every caller of this function gets IPv6 coverage for free. Before this,
  // isPrivateIp only recognized IPv4 dotted-decimal, so ::1, fe80::/10
  // (link-local), fc00::/7 (unique-local), and IPv4-mapped IPv6
  // (::ffff:127.0.0.1) all sailed straight through validateHostSync (the
  // unauthenticated preview-proxy guard) and validateHost.
  const unbracketed = ip.startsWith("[") && ip.endsWith("]") ? ip.slice(1, -1) : ip;
  if (unbracketed.includes(":")) {
    return isPrivateIpv6(unbracketed);
  }
  if (ip === "169.254.169.254") return true;
  for (const range of PRIVATE_RANGES) {
    if (range.test(ip)) return true;
  }
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "0:0:0:0:0:0:0:1") return true; // loopback
  if (lower === "::" || lower === "0:0:0:0:0:0:0:0") return true; // unspecified
  if (/^fe[89ab][0-9a-f]:/.test(lower)) return true; // fe80::/10 link-local
  if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true; // fc00::/7 unique-local

  // IPv4-mapped, dotted form (::ffff:a.b.c.d) -- rarely produced by
  // URL.hostname but cheap to also accept.
  const dottedMapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (dottedMapped) return isPrivateIp(dottedMapped[1]);

  // IPv4-mapped, hex form -- what URL.hostname actually normalizes
  // "[::ffff:127.0.0.1]" to ("[::ffff:7f00:1]"). Each group is up to 4 hex
  // digits; recombine into the embedded IPv4 address and recurse.
  const hexMapped = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMapped) {
    const hi = parseInt(hexMapped[1], 16);
    const lo = parseInt(hexMapped[2], 16);
    const addr = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
    return isPrivateIp(addr);
  }

  return false;
}
