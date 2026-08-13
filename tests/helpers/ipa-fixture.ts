import JSZip from "jszip";

/**
 * Test helpers to build .ipa fixtures entirely in-memory (no macOS, no real
 * app, no committed binary). Produces both XML and binary (bplist00) Info.plist
 * variants so the parser is exercised against each format.
 */

// ── XML plist encoder ───────────────────────────────────────────────────────

function xmlValue(value: unknown): string {
  if (value === null) return "<string></string>";
  if (typeof value === "boolean") return value ? "<true/>" : "<false/>";
  if (typeof value === "number") return `<integer>${value}</integer>`;
  if (typeof value === "string") {
    return `<string>${value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</string>`;
  }
  if (Array.isArray(value)) {
    return `<array>${value.map((v) => xmlValue(v)).join("")}</array>`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    const body = entries
      .map(([k, v]) => `<key>${k}</key>${xmlValue(v)}`)
      .join("");
    return `<dict>${body}</dict>`;
  }
  return `<string>${String(value)}</string>`;
}

function xmlPlist(root: Record<string, unknown>): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n${xmlValue(root)}\n</plist>`;
}

// ── Binary plist encoder (bplist00) ─────────────────────────────────────────

function writeUInt64BE(buf: Buffer, offset: number, value: number): void {
  buf.writeUInt32BE(Math.floor(value / 0x100000000), offset);
  buf.writeUInt32BE(value >>> 0, offset + 4);
}

function encodeBplist(root: unknown): Buffer {
  const objects: Buffer[] = [];
  const offsets: number[] = [];
  let length = 8;

  function append(obj: Buffer): number {
    offsets.push(length);
    objects.push(obj);
    length += obj.length;
    return objects.length - 1;
  }

  // Encode a count/size that follows a marker: values < 15 use the low nibble;
  // larger values use the extended form (0xF marker + int marker + big-endian int).
  function sizeBytes(count: number): Buffer {
    if (count < 15) return Buffer.alloc(0);
    let sz = 1;
    while (sz < 8 && count >= Math.pow(2, 8 * sz)) sz++;
    const lg = Math.log2(sz);
    const body = Buffer.alloc(sz);
    let v = count;
    for (let i = sz - 1; i >= 0; i--) {
      body[i] = v & 0xff;
      v = Math.floor(v / 256);
    }
    return Buffer.concat([Buffer.from([0x10 | lg]), body]);
  }

  function sizeMarker(size: number): number {
    return size < 15 ? size : 0x0f;
  }

  function encodeString(s: string): number {
    const bytes = Buffer.from(s, "utf8");
    return append(
      Buffer.concat([Buffer.from([0x50 | sizeMarker(bytes.length)]), sizeBytes(bytes.length), bytes])
    );
  }

  function encodeInteger(n: number): number {
    let size = 1;
    while (size < 8 && n >= Math.pow(2, 8 * size)) size++;
    const sizeLog2 = Math.log2(size);
    const header = Buffer.from([0x10 | sizeLog2]);
    const body = Buffer.alloc(size);
    let v = n;
    for (let i = size - 1; i >= 0; i--) {
      body[i] = v & 0xff;
      v = Math.floor(v / 256);
    }
    return append(Buffer.concat([header, body]));
  }

  function encode(value: unknown): number {
    if (value === null) return append(Buffer.from([0x00]));
    if (typeof value === "boolean") return append(Buffer.from([value ? 0x09 : 0x08]));
    if (typeof value === "number") return encodeInteger(value);
    if (typeof value === "string") return encodeString(value);
    if (Array.isArray(value)) {
      const refs = value.map(encode);
      const body = Buffer.alloc(refs.length);
      refs.forEach((r, i) => (body[i] = r));
      return append(
        Buffer.concat([Buffer.from([0xa0 | sizeMarker(value.length)]), sizeBytes(value.length), body])
      );
    }
    if (typeof value === "object") {
      const entries = Object.entries(value as Record<string, unknown>);
      const keys = entries.map(([k]) => encodeString(k));
      const vals = entries.map(([, v]) => encode(v));
      const body = Buffer.alloc(keys.length + vals.length);
      [...keys, ...vals].forEach((r, i) => (body[i] = r));
      return append(
        Buffer.concat([Buffer.from([0xd0 | sizeMarker(entries.length)]), sizeBytes(entries.length), body])
      );
    }
    return encodeString(String(value));
  }

  const topObject = encode(root);

  const offsetTableOffset = length;
  const offsetIntSize = 4;
  const offsetTable = Buffer.alloc(offsets.length * offsetIntSize);
  offsets.forEach((off, i) => offsetTable.writeUInt32BE(off, i * offsetIntSize));
  length += offsetTable.length;

  const trailer = Buffer.alloc(32);
  trailer[6] = offsetIntSize;
  trailer[7] = 1; // objectRefSize (fixtures have < 256 objects)
  writeUInt64BE(trailer, 8, objects.length);
  writeUInt64BE(trailer, 16, topObject);
  writeUInt64BE(trailer, 24, offsetTableOffset);

  return Buffer.concat([Buffer.from("bplist00", "ascii"), ...objects, offsetTable, trailer]);
}

// ── .ipa (zip) builders ─────────────────────────────────────────────────────

export interface IpaFixtureOptions {
  /** Extra files under `Payload/Fake.app/` as name → content. */
  files?: Record<string, string | Buffer>;
}

export async function buildIpa(
  plist: Record<string, unknown>,
  opts: IpaFixtureOptions = {}
): Promise<Buffer> {
  return buildIpaRaw(xmlPlist(plist), opts);
}

export async function buildIpaBinary(
  plist: Record<string, unknown>,
  opts: IpaFixtureOptions = {}
): Promise<Buffer> {
  return buildIpaRaw(encodeBplist(plist), opts);
}

async function buildIpaRaw(
  plistContent: Buffer | string,
  opts: IpaFixtureOptions
): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("Payload/Fake.app/Info.plist", plistContent);
  for (const [name, content] of Object.entries(opts.files ?? {})) {
    zip.file(`Payload/Fake.app/${name}`, content);
  }
  const out = await zip.generateAsync({ type: "uint8array" });
  return Buffer.from(out);
}
