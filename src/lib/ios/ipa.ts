import JSZip from "jszip";
import { parse as parseXmlPlist } from "plist";

/**
 * Static .ipa parser — pure, no network, no macOS.
 *
 * An .ipa is a zip. We locate `Payload/<Name>.app/`, read its `Info.plist`
 * (XML *or* binary `bplist00`), and extract the accessibility-relevant bundle
 * metadata plus a filename scan of the icon assets. Nothing here can prove a
 * live accessibility failure, so every downstream finding is `needs_review`.
 *
 * GUARDRAILS (ENTERPRISE_SPEC §2): this module only *reads* structure. It never
 * fabricates violations, never shells out, never touches the network.
 */

/** Parsed iOS bundle metadata, all fields optional (best-effort). */
export interface IosBundle {
  bundleId?: string;
  displayName?: string;
  version?: string;
  build?: string;
  minimumOsVersion?: string;
  launchStoryboard?: string;
  localizations?: string[];
  /** UIAccessibility* / accessibility-adjacent keys present in the plist. */
  accessibilityKeys: string[];
  /** Icon filenames carrying an @2x variant (e.g. `AppIcon60x60@2x.png`). */
  iconNames2x: string[];
  /** Icon filenames carrying an @3x variant. */
  iconNames3x: string[];
  /** True when the bundle contains a compiled `Assets.car` catalog. */
  hasAssetsCar: boolean;
  /** False when Info.plist was missing or unreadable (encrypted/TestFlight). */
  plistReadable: boolean;
  /** Raw parsed plist (not serialized into API responses). */
  raw: Record<string, unknown>;
}

/** Typed error for malformed inputs — the upload route maps it to HTTP 400. */
export class IpaParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IpaParseError";
  }
}

const BPLIST_MAGIC = "bplist";

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value) && !Buffer.isBuffer(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: string[] = [];
  for (const item of value) {
    const s = asString(item);
    if (s !== undefined) out.push(s);
  }
  return out;
}

function collectAccessibilityKeys(raw: Record<string, unknown>): string[] {
  return Object.keys(raw)
    .filter(
      (k) =>
        k.toLowerCase().startsWith("uiaccessibility") ||
        k.toLowerCase().includes("accessibility")
    )
    .sort();
}

function parsePlist(buf: Buffer): Record<string, unknown> {
  const header = buf.toString("latin1", 0, 6);
  if (header === BPLIST_MAGIC) {
    const parsed = parseBinaryPlist(buf);
    return asRecord(parsed);
  }
  const parsed = parseXmlPlist(buf.toString("utf8"));
  return asRecord(parsed);
}

/**
 * Read a big-endian unsigned integer of `size` bytes from `buf` at `offset`.
 * Offsets/counts in a binary plist never exceed 2^53 in practice, so a Number
 * is lossless here.
 */
function readUInt(buf: Buffer, offset: number, size: number): number {
  let value = 0;
  for (let i = 0; i < size; i++) {
    value = value * 256 + buf[offset + i]!;
  }
  return value;
}

function parseBinaryPlist(buf: Buffer): unknown {
  if (buf.length < 40) throw new IpaParseError("Binary plist too short");
  if (buf.toString("latin1", 0, 6) !== BPLIST_MAGIC) {
    throw new IpaParseError("Not a binary plist");
  }

  const trailer = buf.length - 32;
  const offsetIntSize = buf[trailer + 6]!;
  const objectRefSize = buf[trailer + 7]!;
  const numObjects = readUInt(buf, trailer + 8, 8);
  const topObject = readUInt(buf, trailer + 16, 8);
  const offsetTableOffset = readUInt(buf, trailer + 24, 8);

  if (offsetIntSize < 1 || objectRefSize < 1) {
    throw new IpaParseError("Invalid binary plist trailer");
  }
  if (offsetTableOffset + numObjects * offsetIntSize > buf.length) {
    throw new IpaParseError("Binary plist offset table out of bounds");
  }

  const cache = new Map<number, unknown>();

  const getObjectOffset = (index: number): number =>
    readUInt(buf, offsetTableOffset + index * offsetIntSize, offsetIntSize);

  const parseObject = (index: number): unknown => {
    if (cache.has(index)) return cache.get(index);

    const offset = getObjectOffset(index);
    if (offset < 8 || offset >= buf.length) {
      cache.set(index, null);
      return null;
    }

    const marker = buf[offset]!;
    const type = marker >> 4;
    const info = marker & 0x0f;

    // Extended count/size encoding: info === 0xf means the real size is a
    // big-endian integer whose byte-length is 1 << (low nibble of the next byte).
    const readSize = (pos: number): { size: number; next: number } => {
      if (info !== 0x0f) return { size: info, next: pos };
      const intMarker = buf[pos]!;
      const intSize = 1 << (intMarker & 0x0f);
      const body = pos + 1;
      return { size: readUInt(buf, body, intSize), next: body + intSize };
    };

    let value: unknown;
    let cursor = offset + 1;

    switch (type) {
      case 0x0: // simple singleton
        if (info === 0x0) value = null;
        else if (info === 0x8) value = false;
        else if (info === 0x9) value = true;
        else value = null;
        break;

      case 0x1: { // integer
        const bytes = 1 << info;
        value = readUInt(buf, cursor, bytes);
        cursor += bytes;
        break;
      }

      case 0x2: { // real
        value = info === 4 ? buf.readFloatBE(cursor) : buf.readDoubleBE(cursor);
        cursor += info;
        break;
      }

      case 0x3: { // date — seconds since 2001-01-01 UTC
        const seconds = buf.readDoubleBE(cursor);
        value = new Date((seconds + 978307200) * 1000);
        cursor += 8;
        break;
      }

      case 0x4: { // data
        const { size, next } = readSize(cursor);
        value = buf.subarray(next, next + size);
        cursor = next + size;
        break;
      }

      case 0x5: { // ASCII string
        const { size, next } = readSize(cursor);
        value = buf.toString("utf8", next, next + size);
        cursor = next + size;
        break;
      }

      case 0x6: { // UTF-16BE string
        const { size, next } = readSize(cursor);
        value = decodeUtf16Be(buf, next, size);
        cursor = next + size * 2;
        break;
      }

      case 0x8: { // UID
        const bytes = info + 1;
        value = readUInt(buf, cursor, bytes);
        cursor += bytes;
        break;
      }

      case 0xa:
      case 0xc: { // array / set
        const { size, next } = readSize(cursor);
        const items: unknown[] = [];
        let p = next;
        for (let i = 0; i < size; i++) {
          items.push(parseObject(readUInt(buf, p, objectRefSize)));
          p += objectRefSize;
        }
        value = items;
        cursor = p;
        break;
      }

      case 0xd: { // dictionary
        const { size, next } = readSize(cursor);
        const obj: Record<string, unknown> = {};
        const refs: number[] = [];
        let p = next;
        for (let i = 0; i < size * 2; i++) {
          refs.push(readUInt(buf, p, objectRefSize));
          p += objectRefSize;
        }
        for (let i = 0; i < size; i++) {
          const key = parseObject(refs[i]!);
          const val = parseObject(refs[size + i]!);
          if (typeof key === "string" || typeof key === "number") {
            obj[String(key)] = val;
          }
        }
        value = obj;
        cursor = p;
        break;
      }

      default:
        value = null;
        break;
    }

    cache.set(index, value);
    return value;
  };

  return parseObject(topObject);
}

function decodeUtf16Be(buf: Buffer, offset: number, chars: number): string {
  const le = Buffer.alloc(chars * 2);
  for (let i = 0; i < chars; i++) {
    le[i * 2] = buf[offset + i * 2 + 1]!;
    le[i * 2 + 1] = buf[offset + i * 2]!;
  }
  return le.toString("utf16le");
}

interface IconScan {
  iconNames2x: string[];
  iconNames3x: string[];
  hasAssetsCar: boolean;
}

function scanIcons(files: Array<{ name: string }>): IconScan {
  const scan: IconScan = { iconNames2x: [], iconNames3x: [], hasAssetsCar: false };
  const seen = new Set<string>();

  for (const file of files) {
    const base = file.name.split("/").pop() ?? "";
    if (base.toLowerCase() === "assets.car") {
      scan.hasAssetsCar = true;
    }
    if (!/\.png$/i.test(base)) continue;
    if (!/appicon/i.test(base)) continue;

    const at2 = /@2x/i.test(base);
    const at3 = /@3x/i.test(base);
    const stem = base.replace(/\.png$/i, "").replace(/@[23]x$/i, "");

    if (at3 && !seen.has(`${stem}@3x`)) {
      seen.add(`${stem}@3x`);
      scan.iconNames3x.push(stem);
    } else if (at2 && !seen.has(`${stem}@2x`)) {
      seen.add(`${stem}@2x`);
      scan.iconNames2x.push(stem);
    }
  }

  scan.iconNames2x.sort();
  scan.iconNames3x.sort();
  return scan;
}

/**
 * Parse an .ipa bundle from its raw bytes. Throws `IpaParseError` when the
 * archive is not a valid zip or contains no `Payload/*.app/` bundle. A present
 * but unreadable Info.plist (encrypted/TestFlight) degrades to
 * `plistReadable: false` rather than throwing — no fabricated findings.
 */
export async function parseIpa(buffer: Buffer): Promise<IosBundle> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new IpaParseError("Not a valid zip archive");
  }

  const paths = Object.keys(zip.files);

  const appRoot = paths.find(
    (p) => /^Payload\/[^/]+\.app\/$/.test(p) && zip.files[p]!.dir
  );
  if (!appRoot) {
    throw new IpaParseError("No Payload/*.app/ bundle found in the .ipa");
  }

  const plistPath = `${appRoot}Info.plist`;

  const bundle: IosBundle = {
    accessibilityKeys: [],
    iconNames2x: [],
    iconNames3x: [],
    hasAssetsCar: false,
    plistReadable: false,
    raw: {},
  };

  // Icons are scanned from filenames regardless of plist readability, so a
  // partial report is still honest about what was in the bundle.
  const iconScan = scanIcons(paths.map((p) => ({ name: p })));
  bundle.iconNames2x = iconScan.iconNames2x;
  bundle.iconNames3x = iconScan.iconNames3x;
  bundle.hasAssetsCar = iconScan.hasAssetsCar;

  const plistFile = zip.files[plistPath];
  if (plistFile && !plistFile.dir) {
    try {
      const uint8 = await plistFile.async("uint8array");
      const raw = parsePlist(Buffer.from(uint8));
      bundle.raw = raw;
      bundle.plistReadable = true;

      bundle.bundleId = asString(raw.CFBundleIdentifier);
      bundle.displayName =
        asString(raw.CFBundleDisplayName) ?? asString(raw.CFBundleName);
      bundle.version = asString(raw.CFBundleShortVersionString);
      bundle.build = asString(raw.CFBundleVersion);
      bundle.minimumOsVersion = asString(raw.MinimumOSVersion);
      bundle.launchStoryboard = asString(raw.UILaunchStoryboardName);
      bundle.localizations = asStringArray(raw.CFBundleLocalizations);
      bundle.accessibilityKeys = collectAccessibilityKeys(raw);
    } catch {
      // Unreadable plist (e.g. signed/encrypted) — keep plistReadable: false.
      bundle.plistReadable = false;
    }
  }

  return bundle;
}
