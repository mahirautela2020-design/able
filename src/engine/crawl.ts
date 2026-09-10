import type { Page } from "playwright-core";
import { withPage } from "./browser";

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

const BLOCKED_DOMAINS = [
  "localhost",
  "metadata.google.internal",
  "169.254.169.254",
];

export async function crawl(seedUrl: string, maxPages: number = 5): Promise<string[]> {
  const sanitized = sanitizeUrl(seedUrl);
  if (!sanitized) {
    throw new Error(`URL rejected by SSRF guard: ${seedUrl}`);
  }

  await validateHost(sanitized.hostname);

  return withPage(async (page) => {
    const urls: string[] = [];

    await page.goto(sanitized.href, {
      waitUntil: "domcontentloaded",
      timeout: 15_000,
    });

    const finalUrl = page.url();
    const finalParsed = new URL(finalUrl);
    await validateHost(finalParsed.hostname);
    urls.push(finalUrl);

    if (urls.length >= maxPages) return urls;

    const sitemapUrls = await discoverSitemap(page, finalParsed.origin);
    for (const u of sitemapUrls) {
      if (urls.length >= maxPages) break;
      const canonical = canonicalizeUrl(u, finalParsed.origin);
      if (canonical && !urls.includes(canonical)) {
        urls.push(canonical);
      }
    }

    if (urls.length >= maxPages) return urls;

    const linkUrls = await discoverLinks(page, finalParsed.origin);
    for (const u of linkUrls) {
      if (urls.length >= maxPages) break;
      const canonical = canonicalizeUrl(u, finalParsed.origin);
      if (canonical && !urls.includes(canonical)) {
        urls.push(canonical);
      }
    }

    return urls;
  });
}

export function sanitizeUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // User-friendly input: accept "www.qantas.com", "qantas.com",
  // "https://qantas.com", "http://..." — auto-prefix https:// when no
  // scheme is present.
  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    // Require a real host (rejects "https://" alone or bare paths)
    if (!url.hostname || !url.hostname.includes(".")) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

export async function validateHost(hostname: string): Promise<void> {
  if (BLOCKED_DOMAINS.includes(hostname)) {
    throw new Error(`SSRF_BLOCKED: ${hostname}`);
  }

  try {
    // Use dns.lookup (OS resolver) instead of dnsPromises.resolve4:
    // resolve4 queries DNS servers directly on port 53, which corporate
    // networks/firewalls often refuse (ECONNREFUSED on this dev machine).
    // lookup uses the OS resolver (getaddrinfo) — works on Windows, honors
    // hosts file, and still returns the IP for private-range checks.
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

function isPrivateIp(ip: string): boolean {
  // dns.lookup() can return an AAAA (IPv6) record for a hostname with no
  // IPv4 address at all -- PRIVATE_RANGES above is IPv4-only, so a
  // DNS-rebinding attacker pointing a public-looking hostname at ::1,
  // fe80::/10, fc00::/7, or an IPv4-mapped private address (::ffff:...)
  // sailed straight through this check. See src/lib/ssrf.ts's isPrivateIp
  // for the mirrored fix (this file duplicates that module rather than
  // importing it -- a pre-existing structural issue, not addressed here).
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
  if (lower === "::1" || lower === "0:0:0:0:0:0:0:1") return true;
  if (lower === "::" || lower === "0:0:0:0:0:0:0:0") return true;
  if (/^fe[89ab][0-9a-f]:/.test(lower)) return true;
  if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true;

  const dottedMapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (dottedMapped) return isPrivateIp(dottedMapped[1]);

  const hexMapped = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMapped) {
    const hi = parseInt(hexMapped[1], 16);
    const lo = parseInt(hexMapped[2], 16);
    const addr = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
    return isPrivateIp(addr);
  }

  return false;
}

async function discoverSitemap(
  page: Page,
  origin: string
): Promise<string[]> {
  const urls: string[] = [];
  try {
    const sitemapUrl = `${origin}/sitemap.xml`;
    const response = await page.request.get(sitemapUrl, {
      timeout: 5_000,
    });
    if (response.ok()) {
      const text = await response.text();
      const re = /<loc>\s*([^<]+)\s*<\/loc>/gi;
      let match: RegExpExecArray | null;
      while ((match = re.exec(text)) !== null) {
        urls.push(match[1]);
      }
    }
  } catch {
    // Sitemap not available
  }
  return urls;
}

async function discoverLinks(
  page: Page,
  origin: string
): Promise<string[]> {
  return page.evaluate((origin) => {
    const links = document.querySelectorAll("a[href]");
    const urls: string[] = [];
    for (const link of links) {
      try {
        const href = link.getAttribute("href");
        if (!href) continue;
        const url = new URL(href, origin);
        if (url.origin === origin && !url.pathname.match(/\.(png|jpg|jpeg|gif|svg|webp|css|js|pdf|zip)$/i)) {
          urls.push(url.href);
        }
      } catch {
        // Invalid URL
      }
    }
    return urls;
  }, origin);
}

function canonicalizeUrl(url: string, origin: string): string | null {
  try {
    const parsed = new URL(url, origin);
    if (parsed.origin !== origin) return null;
    parsed.hash = "";
    parsed.searchParams.sort();
    return parsed.href;
  } catch {
    return null;
  }
}

export function isBotBlocked(title: string, status: number | null): boolean {
  if (status === 403) return true;
  const patterns = /just a moment|attention required|cloudflare/i;
  return patterns.test(title);
}
